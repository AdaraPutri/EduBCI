"""
Train a baseline EEG confusion classifier (Random Forest) from edubci.sqlite.

Data sources (SQLite):
  - label_events: sentence windows + key_label ("neutral" | "confusion")
  - eeg_rows: raw EEG channel samples with t_app timestamps

Pipeline:
  1) Load label_events + eeg_rows for a session/participant
  2) For each labeled sentence, slice EEG rows where t_app in [t_sentence_start, t_sentence_end]
  3) Create overlapping windows within that slice (default: 2s windows, 1s step)
     - Window sizes are computed using a per-sentence sampling-rate estimate:
         fs_est = n_samples / duration_sec
  4) Extract features per window:
     - Time-domain: mean, std, skew, kurtosis (per channel)
     - Frequency-domain: bandpower(theta/alpha/beta) via Welch (per channel)
     - Engagement index beta/(alpha+theta) (per channel)
  5) Split train/test by paragraph_id (GroupShuffleSplit) to reduce leakage
  6) Train RandomForestClassifier and evaluate
  7) Save model bundle (joblib)

Usage:
  python train_rf.py --db-path backend/edubci.sqlite --participant-id P001
"""

from __future__ import annotations

import argparse
import json
import os
import sqlite3
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
from joblib import dump
from scipy.signal import welch, butter, sosfiltfilt, iirnotch, filtfilt
from scipy.stats import kurtosis, skew
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (
    accuracy_score,
    balanced_accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
)
from sklearn.model_selection import GroupShuffleSplit

CHANNELS = ["PO3", "PO4", "C3", "C4", "CP3", "CP4", "F5", "F6"]
BANDS = {
    "theta": (4.0, 8.0),
    "alpha": (8.0, 12.0),
    "beta": (12.0, 30.0),
}


@dataclass
class Config:
    window_sec: float = 2.0
    step_sec: float = 1.0
    test_size: float = 0.2
    seed: int = 42
    min_samples_per_sentence: int = 64  # skip super-short segments

    # preprocessing
    bandpass_low_hz: float = 1.0
    bandpass_high_hz: float = 40.0
    bandpass_order: int = 4

    do_notch_60hz: bool = True
    notch_hz: float = 60.0
    notch_q: float = 30.0

    do_standardize: bool = True  # channel-wise z-score before windowing


def _connect(db_path: str) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def _read_tables(
    conn: sqlite3.Connection, participant_id: Optional[str] = None
) -> Tuple[pd.DataFrame, pd.DataFrame]:
    label_sql = """
        SELECT
          id AS label_event_id,
          session_id,
          participant_id,
          paragraph_id,
          sentence_id,
          t_sentence_start,
          t_sentence_end,
          key_label
        FROM label_events
        WHERE t_sentence_start IS NOT NULL
          AND t_sentence_end IS NOT NULL
          AND key_label IS NOT NULL
    """

    eeg_cols = ", ".join(
        ["id AS eeg_id", "session_id", "participant_id", "t_app", "t_device", "paragraph_id", "sentence_id"]
        + CHANNELS
    )
    eeg_sql = f"""
        SELECT {eeg_cols}
        FROM eeg_rows
        WHERE t_app IS NOT NULL
    """

    params: List[object] = []
    if participant_id:
        label_sql += " AND participant_id = ?"
        eeg_sql += " AND participant_id = ?"
        params.append(participant_id)

    labels = pd.read_sql_query(label_sql, conn, params=params)
    eeg = pd.read_sql_query(eeg_sql, conn, params=params)

    labels["key_label"] = labels["key_label"].astype(str).str.strip().str.lower()
    labels = labels[labels["key_label"].isin(["neutral", "confusion"])].copy()

    for c in ["session_id", "paragraph_id", "sentence_id", "t_sentence_start", "t_sentence_end"]:
        if c in labels.columns:
            labels[c] = pd.to_numeric(labels[c], errors="coerce")
    for c in ["session_id", "paragraph_id", "sentence_id", "t_app", "t_device"]:
        if c in eeg.columns:
            eeg[c] = pd.to_numeric(eeg[c], errors="coerce")

    labels = labels.dropna(subset=["session_id", "t_sentence_start", "t_sentence_end"])
    eeg = eeg.dropna(subset=["session_id", "t_app"])

    eeg = eeg.sort_values(["session_id", "t_app", "eeg_id"]).reset_index(drop=True)
    labels = labels.sort_values(
        ["session_id", "t_sentence_start", "t_sentence_end", "label_event_id"]
    ).reset_index(drop=True)

    return labels, eeg


def _bandpower_welch(x: np.ndarray, fs: float, fmin: float, fmax: float) -> float:
    x = np.asarray(x, dtype=float)
    if x.size < 8 or fs <= 0:
        return float("nan")

    nperseg = int(min(256, max(32, x.size)))
    freqs, psd = welch(
        x,
        fs=fs,
        nperseg=nperseg,
        noverlap=nperseg // 2 if nperseg >= 64 else 0,
    )
    mask = (freqs >= fmin) & (freqs <= fmax)
    if not np.any(mask):
        return float("nan")
    return float(np.trapz(psd[mask], freqs[mask]))


def _extract_features(window: np.ndarray, fs: float) -> Dict[str, float]:
    feats: Dict[str, float] = {}
    n_samples, n_ch = window.shape
    if n_ch != len(CHANNELS):
        raise ValueError(f"Expected {len(CHANNELS)} channels, got {n_ch}")

    for i, ch in enumerate(CHANNELS):
        sig = window[:, i]
        feats[f"{ch}__mean"] = float(np.mean(sig))
        feats[f"{ch}__std"] = float(np.std(sig, ddof=0))
        feats[f"{ch}__skew"] = float(skew(sig, bias=False)) if n_samples >= 8 else float("nan")
        feats[f"{ch}__kurt"] = float(kurtosis(sig, fisher=True, bias=False)) if n_samples >= 8 else float("nan")

    for i, ch in enumerate(CHANNELS):
        sig = window[:, i]
        bp: Dict[str, float] = {}
        for band_name, (lo, hi) in BANDS.items():
            val = _bandpower_welch(sig, fs=fs, fmin=lo, fmax=hi)
            feats[f"{ch}__bp_{band_name}"] = float(np.log1p(val)) if np.isfinite(val) else float("nan")
            bp[band_name] = val

        denom = (bp.get("alpha", 0.0) + bp.get("theta", 0.0))
        feats[f"{ch}__engagement"] = float(bp.get("beta", 0.0) / denom) if denom and np.isfinite(denom) else float("nan")

    feats["fs_est"] = float(fs)
    feats["n_samples"] = float(n_samples)
    return feats


def _make_windows(samples: np.ndarray, duration_sec: float, cfg: Config):
    n = samples.shape[0]
    if duration_sec <= 0 or n < cfg.min_samples_per_sentence:
        return []

    fs_est = float(n / duration_sec)
    fs_est = float(np.clip(fs_est, 20.0, 1000.0))

    win_n = int(round(cfg.window_sec * fs_est))
    step_n = int(round(cfg.step_sec * fs_est))
    win_n = max(16, min(win_n, n))
    step_n = max(1, step_n)

    windows = []
    start = 0
    while start + win_n <= n:
        windows.append((samples[start : start + win_n, :], fs_est))
        start += step_n
    return windows


def _fill_nans(mat: np.ndarray) -> np.ndarray:
    """Replace NaNs per-channel so filters don't explode."""
    x = np.array(mat, dtype=float, copy=True)
    for i in range(x.shape[1]):
        col = x[:, i]
        if np.isnan(col).any():
            m = np.nanmedian(col)
            if not np.isfinite(m):
                m = 0.0
            col[np.isnan(col)] = m
            x[:, i] = col
    return x


def _apply_notch(mat: np.ndarray, fs: float, notch_hz: float, q: float) -> np.ndarray:
    """
    Notch around notch_hz (e.g., 60 Hz). Only works if fs is high enough.
    """
    if fs is None or not np.isfinite(fs) or fs <= 0:
        return mat

    # Need Nyquist > notch_hz
    if fs / 2.0 <= notch_hz + 1.0:
        return mat

    b, a = iirnotch(w0=notch_hz, Q=q, fs=fs)

    # MIN CHANGE: padlen=0 prevents crash on short segments
    return filtfilt(b, a, mat, axis=0, padlen=0)


def _apply_bandpass(mat: np.ndarray, fs: float, low: float, high: float, order: int) -> np.ndarray:
    if fs is None or not np.isfinite(fs) or fs <= 0:
        return mat

    nyq = fs / 2.0
    lo = max(0.001, low)
    hi = min(high, nyq - 0.001)

    # If invalid, skip
    if hi <= lo:
        return mat

    sos = butter(order, [lo, hi], btype="bandpass", fs=fs, output="sos")

    # MIN CHANGE: padlen=0 prevents crash on short segments
    return sosfiltfilt(sos, mat, axis=0, padlen=0)


def _standardize_channels(mat: np.ndarray) -> np.ndarray:
    """Z-score each channel: (x - mean) / std."""
    x = np.array(mat, dtype=float, copy=True)
    mu = np.mean(x, axis=0)
    sd = np.std(x, axis=0, ddof=0)
    sd = np.where(sd < 1e-8, 1.0, sd)
    return (x - mu) / sd


def _preprocess_segment(mat: np.ndarray, fs: float, cfg: Config) -> np.ndarray:
    """
    Order:
      1) fill NaNs
      2) notch (optional)
      3) bandpass
      4) standardize (optional)
    """
    x = _fill_nans(mat)

    if cfg.do_notch_60hz:
        x = _apply_notch(x, fs=fs, notch_hz=cfg.notch_hz, q=cfg.notch_q)

    x = _apply_bandpass(
        x,
        fs=fs,
        low=cfg.bandpass_low_hz,
        high=cfg.bandpass_high_hz,
        order=cfg.bandpass_order,
    )

    if cfg.do_standardize:
        x = _standardize_channels(x)

    return x


def _build_dataset(labels: pd.DataFrame, eeg: pd.DataFrame, cfg: Config) -> Tuple[pd.DataFrame, pd.Series, pd.Series]:
    eeg_by_session = {int(sid): df for sid, df in eeg.groupby("session_id", sort=False)}

    rows: List[Dict[str, object]] = []

    for _, ev in labels.iterrows():
        sid = int(ev["session_id"])
        if sid not in eeg_by_session:
            continue

        t0 = float(ev["t_sentence_start"])
        t1 = float(ev["t_sentence_end"])
        if not np.isfinite(t0) or not np.isfinite(t1) or t1 <= t0:
            continue

        dur = (t1 - t0) / 1000.0
        eeg_sess = eeg_by_session[sid]
        seg = eeg_sess[(eeg_sess["t_app"] >= t0) & (eeg_sess["t_app"] <= t1)]
        if seg.empty:
            continue

        mat_raw = seg[CHANNELS].to_numpy(dtype=float, copy=True)

        # MIN CHANGE: skip too-short segments BEFORE filtering
        if mat_raw.shape[0] < cfg.min_samples_per_sentence:
            continue

        # estimate fs from samples/duration (same as your windowing logic)
        fs_est = float(mat_raw.shape[0] / dur) if dur > 0 else 0.0
        fs_est = float(np.clip(fs_est, 20.0, 1000.0)) if np.isfinite(fs_est) else 0.0

        mat = _preprocess_segment(mat_raw, fs=fs_est, cfg=cfg)

        for w_idx, (w, fs_est_win) in enumerate(_make_windows(mat, dur, cfg)):
            feats = _extract_features(w, fs=fs_est_win)

            rows.append(
                {
                    **feats,
                    "y": 1 if ev["key_label"] == "confusion" else 0,
                    "session_id": sid,
                    "participant_id": ev.get("participant_id"),
                    "paragraph_id": int(ev["paragraph_id"]) if pd.notna(ev.get("paragraph_id")) else -1,
                    "sentence_id": int(ev["sentence_id"]) if pd.notna(ev.get("sentence_id")) else -1,
                    "label_event_id": int(ev["label_event_id"]),
                    "window_index": w_idx,
                }
            )

    if not rows:
        raise RuntimeError("No training windows were generated. Check that label_events and eeg_rows overlap in time.")

    df = pd.DataFrame(rows)

    meta_cols = ["session_id", "participant_id", "paragraph_id", "sentence_id", "label_event_id", "window_index", "y"]
    feature_cols = [c for c in df.columns if c not in set(meta_cols)]
    features = df[feature_cols].copy()
    features = features.dropna(axis=1, how="all")

    med = features.median(numeric_only=True)
    features = features.fillna(med)

    out = pd.concat([features, df[meta_cols]], axis=1)

    y = out["y"].astype(int)
    groups = out["paragraph_id"].astype(int)
    return out, y, groups


def _train_and_eval(X: pd.DataFrame, y: pd.Series, groups: pd.Series, cfg: Config):
    drop_cols = {"y", "session_id", "participant_id", "paragraph_id", "sentence_id", "label_event_id", "window_index"}
    feature_cols = [c for c in X.columns if c not in drop_cols]
    X_feat = X[feature_cols].to_numpy(dtype=float)

    splitter = GroupShuffleSplit(n_splits=1, test_size=cfg.test_size, random_state=cfg.seed)
    train_idx, test_idx = next(splitter.split(X_feat, y, groups=groups))

    X_train, X_test = X_feat[train_idx], X_feat[test_idx]
    y_train, y_test = y.iloc[train_idx].to_numpy(), y.iloc[test_idx].to_numpy()

    clf = RandomForestClassifier(
        n_estimators=400,
        random_state=cfg.seed,
        n_jobs=-1,
        class_weight="balanced",
        max_depth=None,
        min_samples_leaf=2,
    )
    clf.fit(X_train, y_train)
    y_pred = clf.predict(X_test)

    metrics = {
        "n_samples_total": int(X_feat.shape[0]),
        "n_train": int(X_train.shape[0]),
        "n_test": int(X_test.shape[0]),
        "label_counts": {"neutral": int((y == 0).sum()), "confusion": int((y == 1).sum())},
        "accuracy": float(accuracy_score(y_test, y_pred)),
        "balanced_accuracy": float(balanced_accuracy_score(y_test, y_pred)),
        "f1_confusion": float(f1_score(y_test, y_pred, pos_label=1, zero_division=0)),
        "confusion_matrix": confusion_matrix(y_test, y_pred).tolist(),
        "classification_report": classification_report(
            y_test, y_pred, target_names=["neutral", "confusion"], zero_division=0
        ),
        "feature_count": int(len(feature_cols)),
        "feature_cols": feature_cols,
    }
    return clf, metrics, (train_idx, test_idx)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db-path", type=str, default=str(Path("backend") / "edubci.sqlite"))
    ap.add_argument("--participant-id", type=str, default=None)
    ap.add_argument("--window-sec", type=float, default=2.0)
    ap.add_argument("--step-sec", type=float, default=1.0)
    ap.add_argument("--test-size", type=float, default=0.2)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--out-dir", type=str, default="models")
    ap.add_argument("--dataset-out", type=str, default="dataset_windows.csv")
    args = ap.parse_args()

    cfg = Config(
        window_sec=args.window_sec,
        step_sec=args.step_sec,
        test_size=args.test_size,
        seed=args.seed,
    )

    if not os.path.exists(args.db_path):
        raise SystemExit(f"DB not found at: {args.db_path}")

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    conn = _connect(args.db_path)
    try:
        labels, eeg = _read_tables(conn, participant_id=args.participant_id)
    finally:
        conn.close()

    if labels.empty:
        raise SystemExit("No label_events found (with neutral/confusion and sentence timestamps).")
    if eeg.empty:
        raise SystemExit("No eeg_rows found.")

    X_df, y, groups = _build_dataset(labels, eeg, cfg)

    dataset_path = out_dir / args.dataset_out
    X_df.to_csv(dataset_path, index=False)

    model, metrics, _ = _train_and_eval(X_df, y, groups, cfg)

    bundle = {
        "model": model,
        "config": cfg.__dict__,
        "channels": CHANNELS,
        "bands": BANDS,
        "feature_cols": metrics["feature_cols"],
        "metrics": metrics,
    }

    model_path = out_dir / "rf_confusion_model.joblib"
    dump(bundle, model_path)

    metrics_path = out_dir / "rf_metrics.json"
    with open(metrics_path, "w", encoding="utf-8") as f:
        json.dump(metrics, f, indent=2)

    print("\n=== Training complete ===")
    print(f"DB: {args.db_path}")
    if args.participant_id:
        print(f"Participant: {args.participant_id}")
    print(f"Dataset saved: {dataset_path}")
    print(f"Model saved:   {model_path}")
    print(f"Metrics saved: {metrics_path}\n")
    print(metrics["classification_report"])
    print("Confusion matrix [[TN, FP],[FN, TP]]:")
    print(metrics["confusion_matrix"])


if __name__ == "__main__":
    main()