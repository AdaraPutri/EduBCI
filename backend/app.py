from __future__ import annotations

import json
import random
import os
import sqlite3
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, StreamingResponse
import io
import csv

from pathlib import Path
import subprocess
import sys

DB_PATH = os.path.join(os.path.dirname(__file__), "edubci.sqlite")

CHANNELS = ["PO3", "PO4", "C3", "C4", "CP3", "CP4", "F5", "F6"]

app = FastAPI()

class TrainRFReq(BaseModel):
    participant_id: str

@app.post("/api/train_rf")
def train_rf(req: TrainRFReq):
    pid = req.participant_id.strip()
    if not pid:
        raise HTTPException(status_code=400, detail="participant_id is required")

    repo_root = Path(__file__).resolve().parents[1]
    script_path = repo_root / "ml" / "train_rf.py"
    db_path = Path(DB_PATH).resolve()

    if not script_path.exists():
        raise HTTPException(status_code=500, detail=f"train_rf.py not found at {script_path}")
    if not db_path.exists():
        raise HTTPException(status_code=500, detail=f"DB not found at {db_path}")

    # ✅ per-participant output folder so metrics aren't overwritten
    out_dir = repo_root / "models" / pid
    out_dir.mkdir(parents=True, exist_ok=True)

    cmd = [
        sys.executable,
        str(script_path),
        "--db-path",
        str(db_path),
        "--participant-id",
        pid,
        "--out-dir",
        str(out_dir),
    ]

    try:
        proc = subprocess.run(
            cmd,
            cwd=str(repo_root),
            capture_output=True,
            text=True,
            check=False,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to run training: {e}")

    stdout = (proc.stdout or "")[-8000:]
    stderr = (proc.stderr or "")[-8000:]

    if proc.returncode != 0:
        raise HTTPException(
            status_code=500,
            detail=f"Training failed (code {proc.returncode}).\n{stderr or stdout}",
        )

    metrics_path = out_dir / "rf_metrics.json"
    metrics = None
    if metrics_path.exists():
        try:
            metrics = json.loads(metrics_path.read_text(encoding="utf-8"))
        except Exception:
            metrics = None

    return {"ok": True, "participant_id": pid, "stdout": stdout, "metrics": metrics}

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    body = await request.body()
    print("\n--- 422 VALIDATION ERROR ---")
    print("PATH:", request.url.path)
    print("ERRORS:", exc.errors())
    print("BODY:", body.decode("utf-8", errors="ignore"))
    print("--- END ---\n")
    return JSONResponse(status_code=422, content={"detail": exc.errors()})

# Allow your CRA dev server to call this backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def utc_now_ms() -> int:
    return int(datetime.now(timezone.utc).timestamp() * 1000)


def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    conn = get_conn()
    cur = conn.cursor()

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS sessions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          participant_id TEXT NOT NULL,
          started_at_ms INTEGER NOT NULL,
          ended_at_ms INTEGER
        );
        """
    )

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS label_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          session_id INTEGER NOT NULL,
          participant_id TEXT NOT NULL,
          paragraph_id INTEGER,
          paragraph_type TEXT,
          sentence_id INTEGER,
          t_sentence_start INTEGER,
          t_sentence_end INTEGER,
          key_label TEXT,
          t_key_press INTEGER,
          FOREIGN KEY(session_id) REFERENCES sessions(id)
        );
        """
    )

    cols = ",\n".join([f"{ch} REAL" for ch in CHANNELS])
    cur.execute(
        f"""
        CREATE TABLE IF NOT EXISTS eeg_rows (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          session_id INTEGER NOT NULL,
          participant_id TEXT NOT NULL,
          t_app INTEGER NOT NULL,
          t_device INTEGER,
          paragraph_id INTEGER,
          sentence_id INTEGER,
          {cols},
          FOREIGN KEY(session_id) REFERENCES sessions(id)
        );
        """
    )

    conn.commit()
    conn.close()


@app.on_event("startup")
def on_startup():
    init_db()


# ---------- API models ----------
class StartSessionReq(BaseModel):
    participant_id: str


class StartSessionResp(BaseModel):
    session_id: int
    started_at_ms: int


class LabelEventReq(BaseModel):
    participant_id: str
    paragraph_id: Optional[int] = None
    paragraph_type: Optional[str] = None
    sentence_id: Optional[int] = None
    t_sentence_start: Optional[int] = None
    t_sentence_end: Optional[int] = None
    key_label: str
    t_key_press: Optional[int] = None


class EEGRow(BaseModel):
    t_app: int
    t_device: Optional[int] = None
    paragraph_id: Optional[int] = None
    sentence_id: Optional[int] = None
    PO3: Optional[float] = None
    PO4: Optional[float] = None
    C3: Optional[float] = None
    C4: Optional[float] = None
    CP3: Optional[float] = None
    CP4: Optional[float] = None
    F5: Optional[float] = None
    F6: Optional[float] = None


class EEGBatchReq(BaseModel):
    participant_id: str
    rows: List[EEGRow] = Field(default_factory=list)


class FinishSessionResp(BaseModel):
    ended_at_ms: int


# ---------- Endpoints ----------
@app.post("/api/session/start", response_model=StartSessionResp)
def start_session(req: StartSessionReq):
    pid = req.participant_id.strip()
    if not pid:
        raise HTTPException(status_code=400, detail="participant_id is required")

    started_at = utc_now_ms()

    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO sessions (participant_id, started_at_ms) VALUES (?, ?)",
        (pid, started_at),
    )
    session_id = cur.lastrowid
    conn.commit()
    conn.close()

    return StartSessionResp(session_id=session_id, started_at_ms=started_at)


@app.post("/api/session/{session_id}/label")
def add_label(session_id: int, req: LabelEventReq):
    conn = get_conn()
    cur = conn.cursor()

    # ensure session exists
    cur.execute("SELECT id FROM sessions WHERE id=?", (session_id,))
    if cur.fetchone() is None:
        conn.close()
        raise HTTPException(status_code=404, detail="session not found")

    cur.execute(
        """
        INSERT INTO label_events (
          session_id, participant_id, paragraph_id, paragraph_type, sentence_id,
          t_sentence_start, t_sentence_end, key_label, t_key_press
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            session_id,
            req.participant_id,
            req.paragraph_id,
            req.paragraph_type,
            req.sentence_id,
            req.t_sentence_start,
            req.t_sentence_end,
            req.key_label,
            req.t_key_press,
        ),
    )
    conn.commit()
    conn.close()
    return {"ok": True}


@app.post("/api/session/{session_id}/eeg/batch")
def add_eeg_batch(session_id: int, req: EEGBatchReq):
    if not req.rows:
        return {"ok": True, "inserted": 0}

    conn = get_conn()
    cur = conn.cursor()

    # ensure session exists
    cur.execute("SELECT id FROM sessions WHERE id=?", (session_id,))
    if cur.fetchone() is None:
        conn.close()
        raise HTTPException(status_code=404, detail="session not found")

    values = []
    for r in req.rows:
        values.append(
            (
                session_id,
                req.participant_id,
                r.t_app,
                r.t_device,
                r.paragraph_id,
                r.sentence_id,
                r.PO3,
                r.PO4,
                r.C3,
                r.C4,
                r.CP3,
                r.CP4,
                r.F5,
                r.F6,
            )
        )

    cur.executemany(
        """
        INSERT INTO eeg_rows (
          session_id, participant_id, t_app, t_device, paragraph_id, sentence_id,
          PO3, PO4, C3, C4, CP3, CP4, F5, F6
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        values,
    )
    conn.commit()
    conn.close()
    return {"ok": True, "inserted": len(values)}


@app.post("/api/session/{session_id}/finish", response_model=FinishSessionResp)
def finish_session(session_id: int):
    ended_at = utc_now_ms()
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("UPDATE sessions SET ended_at_ms=? WHERE id=?", (ended_at, session_id))
    if cur.rowcount == 0:
        conn.close()
        raise HTTPException(status_code=404, detail="session not found")
    conn.commit()
    conn.close()
    return FinishSessionResp(ended_at_ms=ended_at)

@app.get("/api/participants")
def list_participants():
    conn = get_conn()
    cur = conn.cursor()

    cur.execute(
        """
        SELECT
          participant_id,
          COUNT(*) AS session_count,
          MAX(started_at_ms) AS last_started_at_ms,
          MAX(ended_at_ms) AS last_ended_at_ms
        FROM sessions
        GROUP BY participant_id
        ORDER BY last_started_at_ms DESC
        """
    )
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return {"participants": rows}


@app.get("/api/participants/{participant_id}/csv")
def download_participant_csv(participant_id: str):
    pid = participant_id.strip()
    if not pid:
        raise HTTPException(status_code=400, detail="participant_id is required")

    conn = get_conn()
    cur = conn.cursor()

    # Pull EEG rows and attach the latest label per (session_id, sentence_id)
    cols = ["PO3", "PO4", "C3", "C4", "CP3", "CP4", "F5", "F6"]

    cur.execute(
        f"""
        WITH latest_labels AS (
          SELECT session_id, sentence_id, MAX(id) AS max_id
          FROM label_events
          WHERE participant_id = ?
          GROUP BY session_id, sentence_id
        )
        SELECT
          e.session_id,
          e.participant_id,
          e.t_app,
          e.t_device,
          e.paragraph_id,
          e.sentence_id,
          le.paragraph_type,
          le.key_label,
          le.t_sentence_start,
          le.t_sentence_end,
          le.t_key_press,
          {", ".join([f"e.{c}" for c in cols])}
        FROM eeg_rows e
        LEFT JOIN latest_labels ll
          ON ll.session_id = e.session_id AND ll.sentence_id = e.sentence_id
        LEFT JOIN label_events le
          ON le.id = ll.max_id
        WHERE e.participant_id = ?
        ORDER BY e.session_id ASC, e.t_app ASC
        """,
        (pid, pid),
    )

    data = cur.fetchall()
    conn.close()

    if not data:
        raise HTTPException(status_code=404, detail="No data found for participant")

    output = io.StringIO()
    writer = csv.writer(output)

    header = [
        "session_id",
        "participant_id",
        "t_app",
        "t_device",
        "paragraph_id",
        "sentence_id",
        "paragraph_type",
        "key_label",
        "t_sentence_start",
        "t_sentence_end",
        "t_key_press",
        *cols,
    ]
    writer.writerow(header)

    for r in data:
        writer.writerow([r.get(h, "") for h in header])

    csv_bytes = output.getvalue().encode("utf-8")
    output.close()

    filename = f"participant_{pid}.csv"
    return StreamingResponse(
        io.BytesIO(csv_bytes),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
    
class SimulationItemsResp(BaseModel):
    participant_id: str
    n_requested: int
    n_returned: int
    confusion_matrix: Optional[List[List[int]]] = None
    recall_neutral: Optional[float] = None
    recall_confusion: Optional[float] = None
    items: List[Dict[str, Any]] = Field(default_factory=list)


@app.get("/api/simulation/items", response_model=SimulationItemsResp)
def simulation_items(participant_id: str, n: int = 10):
    pid = (participant_id or "").strip()
    if not pid:
        raise HTTPException(status_code=400, detail="participant_id is required")

    # Load participant metrics (confusion matrix) if available
    repo_root = Path(__file__).resolve().parents[1]
    metrics_path = repo_root / "models" / pid / "rf_metrics.json"

    cm = None
    recall_neu = None
    recall_con = None
    if metrics_path.exists():
        try:
            metrics = json.loads(metrics_path.read_text(encoding="utf-8"))
            cm = metrics.get("confusion_matrix")
            if (
                isinstance(cm, list)
                and len(cm) == 2
                and all(isinstance(r, list) and len(r) == 2 for r in cm)
            ):
                tn, fp = int(cm[0][0]), int(cm[0][1])
                fn, tp = int(cm[1][0]), int(cm[1][1])

                # recall(neutral) = TN/(TN+FP), recall(confusion) = TP/(TP+FN)
                denom_neu = tn + fp
                denom_con = tp + fn
                recall_neu = (tn / denom_neu) if denom_neu else None
                recall_con = (tp / denom_con) if denom_con else None
        except Exception:
            cm = None

    # Fallback recalls if missing
    if recall_neu is None:
        recall_neu = 0.5
    if recall_con is None:
        recall_con = 0.5

    conn = get_conn()
    cur = conn.cursor()

    # latest manual label per (paragraph_id, sentence_id)
    cur.execute(
        """
        WITH latest AS (
          SELECT paragraph_id, sentence_id, MAX(id) AS max_id
          FROM label_events
          WHERE participant_id = ?
            AND sentence_id IS NOT NULL
            AND key_label IN ('neutral','confusion')
          GROUP BY paragraph_id, sentence_id
        )
        SELECT le.paragraph_id, le.sentence_id, le.key_label
        FROM label_events le
        JOIN latest l ON le.id = l.max_id
        """,
        (pid,),
    )
    rows = cur.fetchall()
    conn.close()

    if not rows:
        raise HTTPException(status_code=404, detail="No labeled sentences found for participant")

    true_neu = [{"paragraph_id": r["paragraph_id"], "sentence_id": r["sentence_id"]} for r in rows if (r["key_label"] or "").strip().lower() == "neutral"]
    true_con = [{"paragraph_id": r["paragraph_id"], "sentence_id": r["sentence_id"]} for r in rows if (r["key_label"] or "").strip().lower() == "confusion"]

    # Choose how many to show from each TRUE class (simple: half/half)
    n_total = max(1, int(n))
    n_con = min(len(true_con), (n_total + 1) // 2)
    n_neu = min(len(true_neu), n_total - n_con)

    # If one side is short, fill with the other
    while (n_con + n_neu) < n_total and len(true_con) > n_con:
        n_con += 1
    while (n_con + n_neu) < n_total and len(true_neu) > n_neu:
        n_neu += 1

    # Split by confusion-matrix-driven correctness rates
    tp_count = int(round(recall_con * n_con))
    fn_count = n_con - tp_count

    tn_count = int(round(recall_neu * n_neu))
    fp_count = n_neu - tn_count

    random.shuffle(true_con)
    random.shuffle(true_neu)

    picked_tp = true_con[:tp_count]
    picked_fn = true_con[tp_count:tp_count + fn_count]

    picked_tn = true_neu[:tn_count]
    picked_fp = true_neu[tn_count:tn_count + fp_count]

    items = []

    def add_items(picks, true_label, pred_label, bucket):
        for s in picks:
            items.append(
                {
                    "paragraph_id": int(s["paragraph_id"]) if s["paragraph_id"] is not None else None,
                    "sentence_id": int(s["sentence_id"]) if s["sentence_id"] is not None else None,
                    "true_label": true_label,
                    "predicted_label": pred_label,
                    "bucket": bucket,  # TP/FP/TN/FN
                }
            )

    add_items(picked_tp, "confusion", "confusion", "TP")
    add_items(picked_fn, "confusion", "neutral", "FN")
    add_items(picked_tn, "neutral", "neutral", "TN")
    add_items(picked_fp, "neutral", "confusion", "FP")

    random.shuffle(items)

    return SimulationItemsResp(
        participant_id=pid,
        n_requested=n_total,
        n_returned=len(items),
        confusion_matrix=cm,
        recall_neutral=float(recall_neu),
        recall_confusion=float(recall_con),
        items=items,
    )


class SimulationFeedbackReq(BaseModel):
    session_id: int
    participant_id: str
    paragraph_id: Optional[int] = None
    sentence_id: Optional[int] = None
    bucket: str  # TP/FP/TN/FN
    true_label: str
    predicted_label: str
    feedback_text: str
    t_feedback_ms: Optional[int] = None


@app.post("/api/simulation/feedback")
def save_simulation_feedback(req: SimulationFeedbackReq):
    pid = (req.participant_id or "").strip()
    if not pid:
        raise HTTPException(status_code=400, detail="participant_id is required")
    if not req.session_id:
        raise HTTPException(status_code=400, detail="session_id is required")

    payload = {
        "kind": "simulation_feedback",
        "bucket": req.bucket,
        "true_label": req.true_label,
        "predicted_label": req.predicted_label,
        "paragraph_id": req.paragraph_id,
        "sentence_id": req.sentence_id,
        "feedback_text": req.feedback_text,
        "t_feedback_ms": req.t_feedback_ms,
    }

    conn = get_conn()
    cur = conn.cursor()

    # ensure session exists
    cur.execute("SELECT id FROM sessions WHERE id=?", (req.session_id,))
    if cur.fetchone() is None:
        conn.close()
        raise HTTPException(status_code=404, detail="session not found")

    # ✅ store as label_events row WITHOUT sentence_id so it won't affect your EEG CSV join
    cur.execute(
        """
        INSERT INTO label_events (
          session_id, participant_id, paragraph_id, paragraph_type, sentence_id,
          t_sentence_start, t_sentence_end, key_label, t_key_press
        ) VALUES (?, ?, ?, ?, NULL, NULL, NULL, ?, ?)
        """,
        (
            req.session_id,
            pid,
            req.paragraph_id,
            json.dumps(payload, ensure_ascii=False),
            "simulation_feedback",
            req.t_feedback_ms,
        ),
    )
    conn.commit()
    conn.close()
    return {"ok": True}


@app.get("/api/participants/{participant_id}/simulation_feedback_csv")
def download_sim_feedback_csv(participant_id: str):
    pid = (participant_id or "").strip()
    if not pid:
        raise HTTPException(status_code=400, detail="participant_id is required")

    conn = get_conn()
    cur = conn.cursor()

    cur.execute(
        """
        SELECT id, session_id, participant_id, paragraph_id, paragraph_type, t_key_press
        FROM label_events
        WHERE participant_id = ?
          AND key_label = 'simulation_feedback'
        ORDER BY id ASC
        """,
        (pid,),
    )
    rows = cur.fetchall()
    conn.close()

    if not rows:
        raise HTTPException(status_code=404, detail="No simulation feedback found for participant")

    output = io.StringIO()
    writer = csv.writer(output)

    header = [
        "id",
        "session_id",
        "participant_id",
        "paragraph_id",
        "sentence_id",
        "bucket",
        "true_label",
        "predicted_label",
        "t_feedback_ms",
        "feedback_text",
    ]
    writer.writerow(header)

    for r in rows:
        blob = r["paragraph_type"] or ""
        data = {}
        try:
            data = json.loads(blob) if blob else {}
        except Exception:
            data = {}

        writer.writerow(
            [
                r["id"],
                r["session_id"],
                r["participant_id"],
                r["paragraph_id"],
                data.get("sentence_id", ""),
                data.get("bucket", ""),
                data.get("true_label", ""),
                data.get("predicted_label", ""),
                data.get("t_feedback_ms", r["t_key_press"] or ""),
                data.get("feedback_text", ""),
            ]
        )

    csv_bytes = output.getvalue().encode("utf-8")
    output.close()

    filename = f"participant_{pid}_simulation_feedback.csv"
    return StreamingResponse(
        io.BytesIO(csv_bytes),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
