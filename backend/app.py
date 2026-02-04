from __future__ import annotations

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

    # repo root = parent of backend/
    repo_root = Path(__file__).resolve().parents[1]
    script_path = repo_root / "ml" / "train_rf.py"
    db_path = Path(DB_PATH).resolve()

    if not script_path.exists():
        raise HTTPException(status_code=500, detail=f"train_rf.py not found at {script_path}")

    if not db_path.exists():
        raise HTTPException(status_code=500, detail=f"DB not found at {db_path}")

    cmd = [
        sys.executable,
        str(script_path),
        "--db-path",
        str(db_path),
        "--participant-id",
        pid,
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

    # Return logs (trimmed) so FE can show something later if needed
    stdout = (proc.stdout or "")[-8000:]
    stderr = (proc.stderr or "")[-8000:]

    if proc.returncode != 0:
        raise HTTPException(
            status_code=500,
            detail=f"Training failed (code {proc.returncode}).\n{stderr or stdout}",
        )

    return {"ok": True, "participant_id": pid, "stdout": stdout}

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