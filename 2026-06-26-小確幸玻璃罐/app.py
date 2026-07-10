# -*- coding: utf-8 -*-
"""
小確幸玻璃罐 · Jar of Small Joys
一個用來收集每天小確幸的玻璃罐。
後端：Flask + SQLite（標準函式庫，無需額外資料庫）。
首次執行會自動建立 jar.db。
"""

import os
import random
import sqlite3
from datetime import datetime, date, timedelta

from flask import Flask, request, jsonify, render_template, g

APP_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(APP_DIR, "jar.db")

# 五種心情，key 對應前端的顏色（前端 app.js 內有相同對照表）
MOODS = {
    "warm": "溫暖",
    "calm": "平靜",
    "surprise": "小驚喜",
    "lucky": "幸運",
    "proud": "有成就",
}

app = Flask(__name__)


# ---------- 資料庫 ----------
def get_db():
    db = getattr(g, "_db", None)
    if db is None:
        db = g._db = sqlite3.connect(DB_PATH)
        db.row_factory = sqlite3.Row
    return db


@app.teardown_appcontext
def close_db(_exc):
    db = getattr(g, "_db", None)
    if db is not None:
        db.close()


def init_db():
    """建立資料表（若不存在）。可重複呼叫。"""
    db = sqlite3.connect(DB_PATH)
    db.execute(
        """
        CREATE TABLE IF NOT EXISTS joys (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            content    TEXT NOT NULL,
            mood       TEXT NOT NULL DEFAULT 'warm',
            created_at TEXT NOT NULL
        )
        """
    )
    db.commit()
    db.close()


def row_to_dict(r):
    return {
        "id": r["id"],
        "content": r["content"],
        "mood": r["mood"] if r["mood"] in MOODS else "warm",
        "mood_label": MOODS.get(r["mood"], "溫暖"),
        "created_at": r["created_at"],
    }


# ---------- 頁面 ----------
@app.route("/")
def index():
    return render_template("index.html", moods=MOODS)


# ---------- API ----------
@app.route("/api/joys", methods=["GET"])
def list_joys():
    db = get_db()
    rows = db.execute(
        "SELECT * FROM joys ORDER BY datetime(created_at) DESC, id DESC"
    ).fetchall()
    return jsonify([row_to_dict(r) for r in rows])


@app.route("/api/joys", methods=["POST"])
def add_joy():
    data = request.get_json(silent=True) or {}
    content = (data.get("content") or "").strip()
    mood = data.get("mood") or "warm"
    if mood not in MOODS:
        mood = "warm"
    if not content:
        return jsonify({"error": "請先寫下一則小確幸 🙂"}), 400
    if len(content) > 200:
        content = content[:200]

    now = datetime.now().isoformat(timespec="seconds")
    db = get_db()
    cur = db.execute(
        "INSERT INTO joys (content, mood, created_at) VALUES (?, ?, ?)",
        (content, mood, now),
    )
    db.commit()
    row = db.execute("SELECT * FROM joys WHERE id = ?", (cur.lastrowid,)).fetchone()
    return jsonify(row_to_dict(row)), 201


@app.route("/api/joys/random", methods=["GET"])
def random_joy():
    db = get_db()
    rows = db.execute("SELECT * FROM joys").fetchall()
    if not rows:
        return jsonify({"error": "罐子還是空的，先投一則進去吧 ✨"}), 404
    return jsonify(row_to_dict(random.choice(rows)))


@app.route("/api/joys/<int:joy_id>", methods=["DELETE"])
def delete_joy(joy_id):
    db = get_db()
    db.execute("DELETE FROM joys WHERE id = ?", (joy_id,))
    db.commit()
    return jsonify({"ok": True})


@app.route("/api/stats", methods=["GET"])
def stats():
    db = get_db()
    rows = db.execute("SELECT mood, created_at FROM joys").fetchall()

    total = len(rows)
    today = date.today()
    this_month = 0
    days = set()
    mood_count = {}

    for r in rows:
        try:
            d = datetime.fromisoformat(r["created_at"]).date()
        except ValueError:
            continue
        if d.year == today.year and d.month == today.month:
            this_month += 1
        days.add(d)
        mood_count[r["mood"]] = mood_count.get(r["mood"], 0) + 1

    # 連續天數：從今天（若今天沒有就從最近一筆那天）往回數，連續有紀錄的天數
    streak = 0
    if days:
        cursor = today if today in days else max(days)
        while cursor in days:
            streak += 1
            cursor -= timedelta(days=1)

    top_mood = None
    if mood_count:
        top_key = max(mood_count, key=mood_count.get)
        top_mood = MOODS.get(top_key, top_key)

    return jsonify(
        {
            "total": total,
            "this_month": this_month,
            "streak": streak,
            "top_mood": top_mood,
        }
    )


# 匯入時就確保資料表存在（讓 `flask run` 與 `python app.py` 都適用）
init_db()


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=False)
