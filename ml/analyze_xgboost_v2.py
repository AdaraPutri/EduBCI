"""
EduBCI – RF vs XGBoost Analysis Script
========================================
Runs both Random Forest (baseline) and XGBoost (primary) on each participant's
data, then produces:
  - Per-participant metrics CSV
  - Aggregate summary CSV
  - Confusion matrices (PNG)
  - Feature importance plots (PNG)
  - ROC curves per participant (PNG)
  - Combined results JSON for thesis write-up

Usage:
  python analyze_xgboost.py --db-path backend/edubci.sqlite --out-dir results/

If you have already exported per-participant CSVs from train_rf.py, you can
point --csv-dir to that folder instead (one CSV per participant named
dataset_windows.csv or <pid>_dataset_windows.csv).

Dependencies:
  pip install xgboost scikit-learn pandas numpy scipy matplotlib seaborn joblib
"""

from __future__ import annotations

import argparse
import json
import os
import sqlite3
import warnings
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import seaborn as sns

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
    roc_auc_score,
    roc_curve,
)
from sklearn.model_selection import GroupShuffleSplit, StratifiedKFold, cross_val_score

try:
    import xgboost as xgb
    HAS_XGB = True
except ImportError:
    HAS_XGB = False
    print("WARNING: xgboost not installed. Only RF will run. pip install xgboost")

warnings.filterwarnings("ignore", category=UserWarning)

# ─── Constants ────────────────────────────────────────────────────────────────
CHANNELS = ["PO3", "PO4", "C3", "C4", "CP3", "CP4", "F5", "F6"]
BANDS = {
    "theta": (4.0, 8.0),
    "alpha": (8.0, 12.0),
    "beta":  (12.0, 30.0),
}


@dataclass
class Config:
    window_sec:              float = 2.0
    step_sec:                float = 1.0
    test_size:               float = 0.2
    seed:                    int   = 42
    min_samples_per_sentence: int  = 64
    bandpass_low_hz:         float = 1.0
    bandpass_high_hz:        float = 40.0
    bandpass_order:          int   = 4
    do_notch_60hz:           bool  = True
    notch_hz:                float = 60.0
    notch_q:                 float = 30.0
    do_standardize:          bool  = True
    # XGBoost hyper-parameters (simple tuned defaults for small EEG datasets)
    xgb_n_estimators:        int   = 300
    xgb_max_depth:           int   = 5
    xgb_learning_rate:       float = 0.05
    xgb_subsample:           float = 0.8
    xgb_colsample_bytree:    float = 0.8
    # Set True to drop fs_est and n_samples (reading-pace proxies, not pure EEG)
    drop_pace_features:      bool  = True


# ─── Signal processing helpers (same as train_rf.py) ──────────────────────────

def _fill_nans(mat: np.ndarray) -> np.ndarray:
    x = np.array(mat, dtype=float, copy=True)
    for i in range(x.shape[1]):
        col = x[:, i]
        if np.isnan(col).any():
            m = np.nanmedian(col)
            col[np.isnan(col)] = 0.0 if not np.isfinite(m) else m
            x[:, i] = col
    return x


def _apply_notch(mat, fs, hz, q):
    if fs is None or fs / 2.0 <= hz + 1.0:
        return mat
    b, a = iirnotch(w0=hz, Q=q, fs=fs)
    return filtfilt(b, a, mat, axis=0, padlen=0)


def _apply_bandpass(mat, fs, low, high, order):
    if fs is None or not np.isfinite(fs) or fs <= 0:
        return mat
    nyq = fs / 2.0
    lo, hi = max(0.001, low), min(high, nyq - 0.001)
    if hi <= lo:
        return mat
    sos = butter(order, [lo, hi], btype="bandpass", fs=fs, output="sos")
    return sosfiltfilt(sos, mat, axis=0, padlen=0)


def _standardize(mat):
    x = np.array(mat, dtype=float, copy=True)
    mu = np.mean(x, axis=0)
    sd = np.std(x, axis=0, ddof=0)
    sd = np.where(sd < 1e-8, 1.0, sd)
    return (x - mu) / sd


def _preprocess(mat, fs, cfg: Config):
    x = _fill_nans(mat)
    if cfg.do_notch_60hz:
        x = _apply_notch(x, fs, cfg.notch_hz, cfg.notch_q)
    x = _apply_bandpass(x, fs, cfg.bandpass_low_hz, cfg.bandpass_high_hz, cfg.bandpass_order)
    if cfg.do_standardize:
        x = _standardize(x)
    return x


def _bandpower(sig, fs, fmin, fmax):
    if sig.size < 8 or fs <= 0:
        return np.nan
    nperseg = int(min(256, max(32, sig.size)))
    freqs, psd = welch(sig, fs=fs, nperseg=nperseg,
                       noverlap=nperseg // 2 if nperseg >= 64 else 0)
    mask = (freqs >= fmin) & (freqs <= fmax)
    return float(np.trapezoid(psd[mask], freqs[mask])) if np.any(mask) else np.nan


def _extract_features(window: np.ndarray, fs: float) -> Dict[str, float]:
    feats: Dict[str, float] = {}
    for i, ch in enumerate(CHANNELS):
        sig = window[:, i]
        n = len(sig)
        feats[f"{ch}__mean"]  = float(np.mean(sig))
        feats[f"{ch}__std"]   = float(np.std(sig, ddof=0))
        feats[f"{ch}__skew"]  = float(skew(sig, bias=False))  if n >= 8 else np.nan
        feats[f"{ch}__kurt"]  = float(kurtosis(sig, fisher=True, bias=False)) if n >= 8 else np.nan

        bp: Dict[str, float] = {}
        for band, (lo, hi) in BANDS.items():
            val = _bandpower(sig, fs, lo, hi)
            feats[f"{ch}__bp_{band}"] = float(np.log1p(val)) if np.isfinite(val) else np.nan
            bp[band] = val

        denom = (bp.get("alpha", 0) or 0) + (bp.get("theta", 0) or 0)
        feats[f"{ch}__engagement"] = float(bp.get("beta", 0) / denom) if denom else np.nan

    feats["fs_est"] = float(fs)
    feats["n_samples"] = float(window.shape[0])
    return feats


def _make_windows(mat, dur_sec, cfg: Config):
    n = mat.shape[0]
    if dur_sec <= 0 or n < cfg.min_samples_per_sentence:
        return []
    fs = float(np.clip(n / dur_sec, 20.0, 1000.0))
    win_n  = max(16, min(int(round(cfg.window_sec * fs)), n))
    step_n = max(1,  int(round(cfg.step_sec * fs)))
    windows = []
    start = 0
    while start + win_n <= n:
        windows.append((mat[start: start + win_n, :], fs))
        start += step_n
    return windows


# ─── DB helpers ───────────────────────────────────────────────────────────────

def _load_from_db(db_path: str, participant_id: Optional[str] = None
                  ) -> Tuple[pd.DataFrame, pd.DataFrame]:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row

    pid_clause = "AND participant_id = ?" if participant_id else ""
    params = [participant_id] if participant_id else []

    labels = pd.read_sql_query(
        f"""SELECT id AS label_event_id, session_id, participant_id,
               paragraph_id, sentence_id,
               t_sentence_start, t_sentence_end, key_label
            FROM label_events
            WHERE t_sentence_start IS NOT NULL AND t_sentence_end IS NOT NULL
              AND key_label IN ('neutral','confusion') {pid_clause}""",
        conn, params=params)

    eeg_cols = ", ".join(
        ["id AS eeg_id", "session_id", "participant_id", "t_app", "t_device",
         "paragraph_id", "sentence_id"] + CHANNELS)
    eeg = pd.read_sql_query(
        f"SELECT {eeg_cols} FROM eeg_rows WHERE t_app IS NOT NULL {pid_clause}",
        conn, params=params)

    conn.close()

    for c in ["session_id", "paragraph_id", "sentence_id",
              "t_sentence_start", "t_sentence_end"]:
        if c in labels.columns:
            labels[c] = pd.to_numeric(labels[c], errors="coerce")
    for c in ["session_id", "paragraph_id", "sentence_id", "t_app"]:
        if c in eeg.columns:
            eeg[c] = pd.to_numeric(eeg[c], errors="coerce")

    labels = labels[labels["key_label"].str.lower().isin(["neutral", "confusion"])].copy()
    labels = labels.dropna(subset=["session_id", "t_sentence_start", "t_sentence_end"])
    eeg    = eeg.dropna(subset=["session_id", "t_app"])
    eeg    = eeg.sort_values(["session_id", "t_app"]).reset_index(drop=True)
    return labels, eeg


# ─── Dataset builder ──────────────────────────────────────────────────────────

def build_dataset(labels: pd.DataFrame, eeg: pd.DataFrame,
                  cfg: Config) -> pd.DataFrame:
    eeg_by_session = {int(s): d for s, d in eeg.groupby("session_id")}
    rows = []
    for _, ev in labels.iterrows():
        sid = int(ev["session_id"])
        if sid not in eeg_by_session:
            continue
        t0, t1 = float(ev["t_sentence_start"]), float(ev["t_sentence_end"])
        if not (np.isfinite(t0) and np.isfinite(t1) and t1 > t0):
            continue
        dur = (t1 - t0) / 1000.0
        seg = eeg_by_session[sid].query("t_app >= @t0 and t_app <= @t1")
        if seg.empty:
            continue
        mat_raw = seg[CHANNELS].to_numpy(dtype=float)
        if mat_raw.shape[0] < cfg.min_samples_per_sentence:
            continue
        fs = float(np.clip(mat_raw.shape[0] / dur, 20.0, 1000.0))
        mat = _preprocess(mat_raw, fs, cfg)
        for w_idx, (w, fs_w) in enumerate(_make_windows(mat, dur, cfg)):
            feats = _extract_features(w, fs_w)
            rows.append({
                **feats,
                "y":              1 if str(ev["key_label"]).lower() == "confusion" else 0,
                "participant_id": ev.get("participant_id"),
                "session_id":     sid,
                "paragraph_id":   int(ev["paragraph_id"]) if pd.notna(ev.get("paragraph_id")) else -1,
                "sentence_id":    int(ev["sentence_id"])  if pd.notna(ev.get("sentence_id"))  else -1,
                "label_event_id": int(ev["label_event_id"]),
                "window_index":   w_idx,
            })
    if not rows:
        raise RuntimeError("No windows generated – check label/EEG timestamp overlap.")
    df = pd.DataFrame(rows)
    meta = ["y", "participant_id", "session_id", "paragraph_id",
            "sentence_id", "label_event_id", "window_index"]
    feat_cols = [c for c in df.columns if c not in set(meta)]
    df[feat_cols] = df[feat_cols].apply(lambda col: col.fillna(col.median()))
    return df


# ─── Training + evaluation ────────────────────────────────────────────────────

META_COLS = {"y", "participant_id", "session_id", "paragraph_id",
             "sentence_id", "label_event_id", "window_index"}


def _get_splits(df, cfg):
    feat_cols = [c for c in df.columns if c not in META_COLS]
    if cfg.drop_pace_features:
        feat_cols = [c for c in feat_cols if c not in ("fs_est", "n_samples")]
    X = df[feat_cols].to_numpy(dtype=float)
    y = df["y"].to_numpy(dtype=int)
    groups = df["paragraph_id"].to_numpy(dtype=int)
    splitter = GroupShuffleSplit(n_splits=1, test_size=cfg.test_size,
                                 random_state=cfg.seed)
    train_idx, test_idx = next(splitter.split(X, y, groups=groups))
    return X, y, groups, feat_cols, train_idx, test_idx


def _metrics_dict(y_test, y_pred, y_prob, label=""):
    cm = confusion_matrix(y_test, y_pred)
    tn, fp, fn, tp = cm.ravel() if cm.size == 4 else (0, 0, 0, 0)
    d = {
        f"{label}accuracy":          float(accuracy_score(y_test, y_pred)),
        f"{label}balanced_accuracy": float(balanced_accuracy_score(y_test, y_pred)),
        f"{label}f1_confusion":      float(f1_score(y_test, y_pred, pos_label=1, zero_division=0)),
        f"{label}f1_neutral":        float(f1_score(y_test, y_pred, pos_label=0, zero_division=0)),
        f"{label}f1_macro":          float(f1_score(y_test, y_pred, average="macro", zero_division=0)),
        f"{label}roc_auc":           float(roc_auc_score(y_test, y_prob)) if len(np.unique(y_test)) > 1 else np.nan,
        f"{label}tp": int(tp), f"{label}fp": int(fp),
        f"{label}tn": int(tn), f"{label}fn": int(fn),
        f"{label}confusion_matrix":  cm.tolist(),
    }
    return d


def train_rf(df: pd.DataFrame, cfg: Config) -> dict:
    X, y, groups, feat_cols, tr, te = _get_splits(df, cfg)
    clf = RandomForestClassifier(
        n_estimators=400, random_state=cfg.seed, n_jobs=-1,
        class_weight="balanced", max_depth=None, min_samples_leaf=2,
    )
    clf.fit(X[tr], y[tr])
    y_pred = clf.predict(X[te])
    y_prob = clf.predict_proba(X[te])[:, 1]
    m = _metrics_dict(y[te], y_pred, y_prob, label="rf_")
    m["rf_n_train"]     = int(len(tr))
    m["rf_n_test"]      = int(len(te))
    m["rf_label_counts"]= {"neutral": int((y == 0).sum()), "confusion": int((y == 1).sum())}
    m["rf_feature_importances"] = dict(zip(feat_cols, clf.feature_importances_.tolist()))
    m["rf_classification_report"] = classification_report(
        y[te], y_pred, target_names=["neutral", "confusion"], zero_division=0)
    return {"model": clf, "feat_cols": feat_cols,
            "splits": (tr, te), "X": X, "y": y, "metrics": m}


def train_xgb(df: pd.DataFrame, cfg: Config) -> dict:
    if not HAS_XGB:
        return {}
    X, y, groups, feat_cols, tr, te = _get_splits(df, cfg)
    scale_pos_weight = float((y == 0).sum()) / max((y == 1).sum(), 1)
    clf = xgb.XGBClassifier(
        n_estimators=cfg.xgb_n_estimators,
        max_depth=cfg.xgb_max_depth,
        learning_rate=cfg.xgb_learning_rate,
        subsample=cfg.xgb_subsample,
        colsample_bytree=cfg.xgb_colsample_bytree,
        scale_pos_weight=scale_pos_weight,
        random_state=cfg.seed,
        eval_metric="logloss",
        use_label_encoder=False,
        verbosity=0,
        n_jobs=-1,
    )
    clf.fit(X[tr], y[tr])
    y_pred = clf.predict(X[te])
    y_prob = clf.predict_proba(X[te])[:, 1]
    m = _metrics_dict(y[te], y_pred, y_prob, label="xgb_")
    m["xgb_n_train"]      = int(len(tr))
    m["xgb_n_test"]       = int(len(te))
    m["xgb_label_counts"] = {"neutral": int((y == 0).sum()), "confusion": int((y == 1).sum())}
    # get_fscore() returns f0/f1/... indices; use get_score with feature names instead
    booster = clf.get_booster()
    booster.feature_names = feat_cols
    fi_raw = booster.get_score(importance_type="gain")
    # map fN back to real names if needed
    fi_named = {}
    for k, v in fi_raw.items():
        if k.startswith("f") and k[1:].isdigit():
            idx = int(k[1:])
            fi_named[feat_cols[idx] if idx < len(feat_cols) else k] = v
        else:
            fi_named[k] = v
    m["xgb_feature_importances"] = fi_named
    m["xgb_classification_report"] = classification_report(
        y[te], y_pred, target_names=["neutral", "confusion"], zero_division=0)
    return {"model": clf, "feat_cols": feat_cols,
            "splits": (tr, te), "X": X, "y": y, "metrics": m}


# ─── Plotting ─────────────────────────────────────────────────────────────────

def _plot_confusion_matrices(pid, rf_res, xgb_res, out_dir):
    models = []
    if rf_res:
        y  = rf_res["y"][rf_res["splits"][1]]
        yp = rf_res["model"].predict(rf_res["X"][rf_res["splits"][1]])
        models.append(("Random Forest", confusion_matrix(y, yp)))
    if xgb_res:
        y  = xgb_res["y"][xgb_res["splits"][1]]
        yp = xgb_res["model"].predict(xgb_res["X"][xgb_res["splits"][1]])
        models.append(("XGBoost", confusion_matrix(y, yp)))

    fig, axes = plt.subplots(1, len(models), figsize=(5 * len(models), 4))
    if len(models) == 1:
        axes = [axes]
    for ax, (name, cm) in zip(axes, models):
        sns.heatmap(cm, annot=True, fmt="d", cmap="Blues", ax=ax,
                    xticklabels=["Neutral", "Confusion"],
                    yticklabels=["Neutral", "Confusion"])
        ax.set_title(f"{name}\n{pid}")
        ax.set_ylabel("True"); ax.set_xlabel("Predicted")
    plt.tight_layout()
    path = out_dir / f"{pid}_confusion_matrices.png"
    fig.savefig(path, dpi=150, bbox_inches="tight")
    plt.close(fig)
    return path


def _plot_roc(pid, rf_res, xgb_res, out_dir):
    fig, ax = plt.subplots(figsize=(5, 4))
    ax.plot([0, 1], [0, 1], "k--", lw=0.8)
    for res, name, color in [
        (rf_res,  "Random Forest", "steelblue"),
        (xgb_res, "XGBoost",       "darkorange"),
    ]:
        if not res:
            continue
        y = res["y"][res["splits"][1]]
        yp = res["model"].predict_proba(res["X"][res["splits"][1]])[:, 1]
        if len(np.unique(y)) > 1:
            fpr, tpr, _ = roc_curve(y, yp)
            auc = roc_auc_score(y, yp)
            ax.plot(fpr, tpr, color=color, lw=1.8, label=f"{name} (AUC={auc:.2f})")
    ax.set_xlabel("False Positive Rate"); ax.set_ylabel("True Positive Rate")
    ax.set_title(f"ROC Curve – {pid}")
    ax.legend(loc="lower right", fontsize=8)
    plt.tight_layout()
    path = out_dir / f"{pid}_roc.png"
    fig.savefig(path, dpi=150, bbox_inches="tight")
    plt.close(fig)
    return path


def _plot_feature_importance(pid, rf_res, xgb_res, out_dir, top_n=15):
    plots = []
    for res, name, tag in [
        (rf_res,  "Random Forest", "rf"),
        (xgb_res, "XGBoost",       "xgb"),
    ]:
        if not res:
            continue
        key = f"{tag}_feature_importances"
        fi_dict = res["metrics"].get(key, {})
        if not fi_dict:
            continue
        fi = pd.Series(fi_dict).sort_values(ascending=False).head(top_n)
        fig, ax = plt.subplots(figsize=(7, max(3, top_n * 0.35)))
        fi[::-1].plot(kind="barh", ax=ax, color="steelblue" if tag == "rf" else "darkorange")
        ax.set_title(f"Top {top_n} Feature Importances – {name}\n{pid}")
        ax.set_xlabel("Importance")
        plt.tight_layout()
        path = out_dir / f"{pid}_{tag}_feature_importance.png"
        fig.savefig(path, dpi=150, bbox_inches="tight")
        plt.close(fig)
        plots.append(path)
    return plots


def _plot_aggregate_comparison(summary_df: pd.DataFrame, out_dir: Path):
    """Bar chart of RF vs XGBoost across participants for key metrics."""
    metrics_to_plot = [
        ("rf_f1_confusion",  "xgb_f1_confusion",  "F1 (Confusion class)"),
        ("rf_balanced_accuracy", "xgb_balanced_accuracy", "Balanced Accuracy"),
        ("rf_roc_auc",       "xgb_roc_auc",       "ROC AUC"),
    ]
    fig, axes = plt.subplots(1, len(metrics_to_plot), figsize=(5 * len(metrics_to_plot), 5))
    for ax, (rf_col, xgb_col, ylabel) in zip(axes, metrics_to_plot):
        df_plot = summary_df[["participant_id", rf_col, xgb_col]].dropna()
        x = np.arange(len(df_plot))
        width = 0.35
        ax.bar(x - width/2, df_plot[rf_col],  width, label="Random Forest", color="steelblue")
        ax.bar(x + width/2, df_plot[xgb_col], width, label="XGBoost",       color="darkorange")
        ax.set_xticks(x)
        ax.set_xticklabels(df_plot["participant_id"], rotation=45, ha="right", fontsize=7)
        ax.set_ylabel(ylabel); ax.set_title(ylabel)
        ax.axhline(0.5, color="grey", linestyle="--", lw=0.8, label="Chance (0.5)")
        ax.set_ylim(0, 1.05)
        ax.legend(fontsize=7)
    plt.suptitle("RF vs XGBoost – Per Participant", fontsize=12)
    plt.tight_layout()
    path = out_dir / "aggregate_rf_vs_xgb.png"
    fig.savefig(path, dpi=150, bbox_inches="tight")
    plt.close(fig)
    return path


# ─── Main ─────────────────────────────────────────────────────────────────────

def run_participant(pid, labels, eeg, cfg, out_dir):
    print(f"\n{'='*60}\nParticipant: {pid}")
    try:
        df = build_dataset(labels, eeg, cfg)
    except RuntimeError as e:
        print(f"  SKIP – {e}")
        return None

    n_conf    = int((df["y"] == 1).sum())
    n_neutral = int((df["y"] == 0).sum())
    n_total   = len(df)
    print(f"  Windows: {n_total}  (confusion={n_conf}, neutral={n_neutral})")

    if n_conf < 5 or n_neutral < 5:
        print("  SKIP – too few samples in one class.")
        return None

    rf_res  = train_rf(df, cfg)
    xgb_res = train_xgb(df, cfg)

    # Plots
    _plot_confusion_matrices(pid, rf_res, xgb_res, out_dir)
    _plot_roc(pid, rf_res, xgb_res, out_dir)
    _plot_feature_importance(pid, rf_res, xgb_res, out_dir)

    # Save models
    if rf_res:
        dump({"model": rf_res["model"], "feat_cols": rf_res["feat_cols"],
              "metrics": rf_res["metrics"]},
             out_dir / f"{pid}_rf_model.joblib")
    if xgb_res:
        dump({"model": xgb_res["model"], "feat_cols": xgb_res["feat_cols"],
              "metrics": xgb_res["metrics"]},
             out_dir / f"{pid}_xgb_model.joblib")

    # Print summary
    rm = rf_res["metrics"]  if rf_res  else {}
    xm = xgb_res["metrics"] if xgb_res else {}

    row = {
        "participant_id":       pid,
        "n_windows_total":      n_total,
        "n_confusion_windows":  n_conf,
        "n_neutral_windows":    n_neutral,
        "label_ratio_conf":     round(n_conf / n_total, 3),
        # RF
        "rf_accuracy":          rm.get("rf_accuracy"),
        "rf_balanced_accuracy": rm.get("rf_balanced_accuracy"),
        "rf_f1_confusion":      rm.get("rf_f1_confusion"),
        "rf_f1_macro":          rm.get("rf_f1_macro"),
        "rf_roc_auc":           rm.get("rf_roc_auc"),
        "rf_tp": rm.get("rf_tp"), "rf_fp": rm.get("rf_fp"),
        "rf_tn": rm.get("rf_tn"), "rf_fn": rm.get("rf_fn"),
        # XGBoost
        "xgb_accuracy":          xm.get("xgb_accuracy"),
        "xgb_balanced_accuracy": xm.get("xgb_balanced_accuracy"),
        "xgb_f1_confusion":      xm.get("xgb_f1_confusion"),
        "xgb_f1_macro":          xm.get("xgb_f1_macro"),
        "xgb_roc_auc":           xm.get("xgb_roc_auc"),
        "xgb_tp": xm.get("xgb_tp"), "xgb_fp": xm.get("xgb_fp"),
        "xgb_tn": xm.get("xgb_tn"), "xgb_fn": xm.get("xgb_fn"),
    }

    print(f"  RF   → balanced_acc={rm.get('rf_balanced_accuracy', 'N/A'):.3f}  "
          f"f1_conf={rm.get('rf_f1_confusion', 'N/A'):.3f}  "
          f"roc_auc={rm.get('rf_roc_auc', 'N/A'):.3f}")
    if xgb_res:
        print(f"  XGB  → balanced_acc={xm.get('xgb_balanced_accuracy', 'N/A'):.3f}  "
              f"f1_conf={xm.get('xgb_f1_confusion', 'N/A'):.3f}  "
              f"roc_auc={xm.get('xgb_roc_auc', 'N/A'):.3f}")

    full_detail = {
        "participant_id": pid,
        "rf_classification_report":  rm.get("rf_classification_report"),
        "xgb_classification_report": xm.get("xgb_classification_report"),
        "rf_confusion_matrix":       rm.get("rf_confusion_matrix"),
        "xgb_confusion_matrix":      xm.get("xgb_confusion_matrix"),
    }
    with open(out_dir / f"{pid}_detail.json", "w") as f:
        json.dump(full_detail, f, indent=2)

    return row


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db-path",  default="backend/edubci.sqlite")
    ap.add_argument("--out-dir",  default="results")
    ap.add_argument("--participant-id", default=None,
                    help="Run for a single participant. Omit to run all.")
    ap.add_argument("--keep-pace-features", action="store_true",
                    help="Keep fs_est and n_samples (reading-pace proxies). Default: drop them.")
    args = ap.parse_args()

    db_path = args.db_path
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    cfg = Config(drop_pace_features=not args.keep_pace_features)

    if not os.path.exists(db_path):
        raise SystemExit(f"DB not found: {db_path}")

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row

    if args.participant_id:
        pids = [args.participant_id]
    else:
        rows = conn.execute(
            "SELECT DISTINCT participant_id FROM label_events "
            "WHERE key_label IN ('neutral','confusion') ORDER BY participant_id"
        ).fetchall()
        pids = [r["participant_id"] for r in rows]
    conn.close()

    print(f"Participants to process: {pids}")

    all_rows = []
    for pid in pids:
        labels, eeg = _load_from_db(db_path, participant_id=pid)
        if labels.empty or eeg.empty:
            print(f"  SKIP {pid} – no data in DB.")
            continue
        row = run_participant(pid, labels, eeg, cfg, out_dir)
        if row:
            all_rows.append(row)

    if not all_rows:
        print("\nNo participants produced results.")
        return

    summary = pd.DataFrame(all_rows)
    summary_path = out_dir / "summary_rf_vs_xgb.csv"
    summary.to_csv(summary_path, index=False)
    print(f"\nSummary saved: {summary_path}")

    # Aggregate means
    num_cols = summary.select_dtypes(include=[float, int]).columns.tolist()
    means = summary[num_cols].mean()
    print("\n=== Aggregate Means ===")
    for col in ["rf_balanced_accuracy", "rf_f1_confusion", "rf_roc_auc",
                "xgb_balanced_accuracy", "xgb_f1_confusion", "xgb_roc_auc"]:
        if col in means:
            print(f"  {col:35s}: {means[col]:.3f}")

    # Aggregate plot
    _plot_aggregate_comparison(summary, out_dir)
    print(f"\nAggregate plot saved: {out_dir / 'aggregate_rf_vs_xgb.png'}")

    # Thesis-ready JSON summary
    thesis_summary = {
        "n_participants": len(all_rows),
        "mean_rf_balanced_accuracy":  float(means.get("rf_balanced_accuracy",  np.nan)),
        "mean_rf_f1_confusion":       float(means.get("rf_f1_confusion",       np.nan)),
        "mean_rf_roc_auc":            float(means.get("rf_roc_auc",            np.nan)),
        "mean_xgb_balanced_accuracy": float(means.get("xgb_balanced_accuracy", np.nan)),
        "mean_xgb_f1_confusion":      float(means.get("xgb_f1_confusion",      np.nan)),
        "mean_xgb_roc_auc":           float(means.get("xgb_roc_auc",           np.nan)),
        "per_participant":            all_rows,
    }
    with open(out_dir / "thesis_summary.json", "w") as f:
        json.dump(thesis_summary, f, indent=2, default=str)
    print(f"Thesis JSON saved: {out_dir / 'thesis_summary.json'}")
    print("\nDone.")


if __name__ == "__main__":
    main()
