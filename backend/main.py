from __future__ import annotations

import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parent.parent
DB_PATH = Path(os.environ.get("SKILLSWAP_DB", ROOT / "skillswap.db"))
FRONTEND = ROOT / "frontend"

app = FastAPI(title="SkillSwap", version="0.1.0", description="A small community for exchanging skills.")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "OPTIONS"],
    allow_headers=["Content-Type"],
)
app.mount("/static", StaticFiles(directory=FRONTEND), name="static")


def connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DB_PATH, timeout=10)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys = ON")
    return db


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def init_db() -> None:
    with connect() as db:
        db.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS user_skills (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            skill TEXT NOT NULL,
            kind TEXT NOT NULL CHECK(kind IN ('teach', 'learn')),
            UNIQUE(user_id, skill, kind)
        );
        CREATE TABLE IF NOT EXISTS swaps (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            requester_id TEXT NOT NULL REFERENCES users(id),
            recipient_id TEXT NOT NULL REFERENCES users(id),
            skill TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','declined')),
            created_at TEXT NOT NULL,
            UNIQUE(requester_id, recipient_id, skill)
        );
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            swap_id INTEGER NOT NULL REFERENCES swaps(id) ON DELETE CASCADE,
            sender_id TEXT NOT NULL REFERENCES users(id),
            body TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_skills_lookup ON user_skills(kind, skill);
        CREATE INDEX IF NOT EXISTS idx_swaps_requester ON swaps(requester_id, id);
        CREATE INDEX IF NOT EXISTS idx_swaps_recipient ON swaps(recipient_id, id);
        CREATE INDEX IF NOT EXISTS idx_messages_swap ON messages(swap_id, id);
        """)
        db.commit()


@app.on_event("startup")
def startup() -> None:
    init_db()


class UserIn(BaseModel):
    id: str = Field(min_length=8, max_length=80)
    name: str = Field(min_length=1, max_length=48)


class SkillsIn(BaseModel):
    teach: list[str] = Field(default_factory=list, max_length=30)
    learn: list[str] = Field(default_factory=list, max_length=30)


class SwapIn(BaseModel):
    requester_id: str = Field(min_length=8, max_length=80)
    recipient_id: str = Field(min_length=8, max_length=80)
    skill: str = Field(min_length=1, max_length=64)


class RespondIn(BaseModel):
    user_id: str = Field(min_length=8, max_length=80)
    response: Literal["accepted", "declined"]


class MessageIn(BaseModel):
    user_id: str = Field(min_length=8, max_length=80)
    body: str = Field(min_length=1, max_length=2000)


def clean_skills(skills: list[str]) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()
    for raw in skills:
        skill = " ".join(raw.strip().split())[:64]
        key = skill.casefold()
        if skill and key not in seen:
            seen.add(key)
            result.append(skill)
    return result


def public_user(db: sqlite3.Connection, user_id: str) -> dict | None:
    row = db.execute("SELECT id, name FROM users WHERE id = ?", (user_id,)).fetchone()
    if not row:
        return None
    skills = db.execute(
        "SELECT skill, kind FROM user_skills WHERE user_id = ? ORDER BY id", (user_id,)
    ).fetchall()
    return {
        "id": row["id"],
        "name": row["name"],
        "teach": [item["skill"] for item in skills if item["kind"] == "teach"],
        "learn": [item["skill"] for item in skills if item["kind"] == "learn"],
    }


@app.get("/")
def home():
    return FileResponse(FRONTEND / "index.html")


@app.get("/api/health")
def health():
    return {"ok": True, "app": "SkillSwap"}


@app.get("/api/health/database")
def database_health():
    with connect() as db:
        db.execute("SELECT 1").fetchone()
    return {"ok": True, "database": "connected"}


@app.post("/api/users")
def save_user(payload: UserIn):
    name = " ".join(payload.name.strip().split())
    if not name:
        raise HTTPException(400, "Please enter a name.")
    with connect() as db:
        db.execute(
            "INSERT INTO users(id, name, created_at) VALUES(?,?,?) "
            "ON CONFLICT(id) DO UPDATE SET name=excluded.name",
            (payload.id, name, now()),
        )
        db.commit()
        return public_user(db, payload.id)


@app.get("/api/users/{user_id}")
def get_user(user_id: str):
    with connect() as db:
        user = public_user(db, user_id)
        if not user:
            raise HTTPException(404, "Profile not found.")
        return user


@app.put("/api/users/{user_id}/skills")
def save_skills(user_id: str, payload: SkillsIn):
    with connect() as db:
        if not db.execute("SELECT id FROM users WHERE id=?", (user_id,)).fetchone():
            raise HTTPException(404, "Profile not found. Save your name first.")
        db.execute("DELETE FROM user_skills WHERE user_id=?", (user_id,))
        for kind, skills in (("teach", clean_skills(payload.teach)), ("learn", clean_skills(payload.learn))):
            db.executemany(
                "INSERT OR IGNORE INTO user_skills(user_id, skill, kind) VALUES(?,?,?)",
                [(user_id, skill, kind) for skill in skills],
            )
        db.commit()
        return public_user(db, user_id)


@app.get("/api/users/{user_id}/matches")
def matches(user_id: str):
    with connect() as db:
        me = public_user(db, user_id)
        if not me:
            raise HTTPException(404, "Profile not found.")
        wanted = {skill.casefold() for skill in me["learn"]}
        if not wanted:
            return []
        rows = db.execute(
            "SELECT DISTINCT u.id FROM users u "
            "JOIN user_skills s ON s.user_id=u.id "
            "WHERE u.id != ? AND s.kind='teach' ORDER BY u.name COLLATE NOCASE",
            (user_id,),
        ).fetchall()
        results = []
        for row in rows:
            other = public_user(db, row["id"])
            offered = [skill for skill in other["teach"] if skill.casefold() in wanted]
            if offered:
                other["matching_skills"] = offered
                results.append(other)
        return results


@app.post("/api/swaps")
def create_swap(payload: SwapIn):
    skill = " ".join(payload.skill.strip().split())
    if not skill:
        raise HTTPException(400, "Choose a skill to request.")
    if payload.requester_id == payload.recipient_id:
        raise HTTPException(400, "You cannot request a swap with yourself.")
    with connect() as db:
        requester = public_user(db, payload.requester_id)
        recipient = public_user(db, payload.recipient_id)
        if not requester or not recipient:
            raise HTTPException(404, "One of the profiles could not be found.")
        if skill.casefold() not in {s.casefold() for s in recipient["teach"]}:
            raise HTTPException(400, "That skill is no longer offered by this person.")
        if skill.casefold() not in {s.casefold() for s in requester["learn"]}:
            raise HTTPException(400, "That skill is not on your learning list.")
        try:
            cursor = db.execute(
                "INSERT INTO swaps(requester_id, recipient_id, skill, status, created_at) "
                "VALUES(?,?,?,'pending',?)",
                (payload.requester_id, payload.recipient_id, skill, now()),
            )
            db.commit()
        except sqlite3.IntegrityError:
            raise HTTPException(409, "You have already requested this skill from this person.")
        return {"id": cursor.lastrowid, "status": "pending"}


@app.get("/api/users/{user_id}/swaps")
def list_swaps(user_id: str):
    with connect() as db:
        if not db.execute("SELECT id FROM users WHERE id=?", (user_id,)).fetchone():
            raise HTTPException(404, "Profile not found.")
        rows = db.execute(
            "SELECT s.*, a.name AS requester_name, b.name AS recipient_name "
            "FROM swaps s JOIN users a ON a.id=s.requester_id "
            "JOIN users b ON b.id=s.recipient_id "
            "WHERE s.requester_id=? OR s.recipient_id=? ORDER BY s.id DESC",
            (user_id, user_id),
        ).fetchall()
        return [dict(row) for row in rows]


@app.post("/api/swaps/{swap_id}/respond")
def respond(swap_id: int, payload: RespondIn):
    with connect() as db:
        swap = db.execute("SELECT * FROM swaps WHERE id=?", (swap_id,)).fetchone()
        if not swap:
            raise HTTPException(404, "Swap request not found.")
        if swap["recipient_id"] != payload.user_id:
            raise HTTPException(403, "Only the recipient can respond to this request.")
        if swap["status"] != "pending":
            raise HTTPException(409, "This request has already been answered.")
        db.execute("UPDATE swaps SET status=? WHERE id=?", (payload.response, swap_id))
        db.commit()
        return {"id": swap_id, "status": payload.response}


def authorized_swap(db: sqlite3.Connection, swap_id: int, user_id: str) -> sqlite3.Row:
    swap = db.execute("SELECT * FROM swaps WHERE id=?", (swap_id,)).fetchone()
    if not swap:
        raise HTTPException(404, "Swap not found.")
    if user_id not in (swap["requester_id"], swap["recipient_id"]):
        raise HTTPException(403, "This conversation is not yours.")
    if swap["status"] != "accepted":
        raise HTTPException(403, "Chat opens when the swap is accepted.")
    return swap


@app.get("/api/swaps/{swap_id}/messages")
def get_messages(swap_id: int, user_id: str = Query(min_length=8, max_length=80)):
    with connect() as db:
        authorized_swap(db, swap_id, user_id)
        rows = db.execute(
            "SELECT m.id, m.swap_id, m.sender_id, u.name AS sender_name, m.body, m.created_at "
            "FROM messages m JOIN users u ON u.id=m.sender_id "
            "WHERE m.swap_id=? ORDER BY m.id",
            (swap_id,),
        ).fetchall()
        return [dict(row) for row in rows]


@app.post("/api/swaps/{swap_id}/messages")
def send_message(swap_id: int, payload: MessageIn):
    body = payload.body.strip()
    if not body:
        raise HTTPException(400, "Message cannot be empty.")
    with connect() as db:
        authorized_swap(db, swap_id, payload.user_id)
        db.execute(
            "INSERT INTO messages(swap_id, sender_id, body, created_at) VALUES(?,?,?,?)",
            (swap_id, payload.user_id, body, now()),
        )
        db.commit()
        return {"ok": True}
