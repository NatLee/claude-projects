# -*- coding: utf-8 -*-
"""
推敲 · 每日成語猜謎  ——  Flask + SQLite 後端
- 每日題目依「台灣日期」決定，全體一致，且重開伺服器不變。
- 猜測一律由伺服器判定回饋（綠／黃／灰），答案不外洩到前端。
- 對局結果寫入 SQLite，提供統計（勝率、猜中次數分佈）。
"""
import os
import re
import hashlib
import sqlite3
from datetime import datetime, timezone, timedelta

from flask import Flask, jsonify, request, render_template

from idioms import IDIOMS

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "tuiqiao.db")
TAIPEI = timezone(timedelta(hours=8))  # 台灣無夏令時，固定 UTC+8
WORD_LEN = 4
MAX_ATTEMPTS = 6
HAN_RE = re.compile(r"^[一-鿿]{4}$")

app = Flask(__name__)


# ----------------------------- 資料庫 -----------------------------
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db()
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS plays (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            play_date  TEXT NOT NULL,      -- 對局日期（台灣）YYYY-MM-DD
            mode       TEXT NOT NULL,      -- daily / practice
            pid        INTEGER NOT NULL,   -- 題目索引
            won        INTEGER NOT NULL,   -- 1 勝 0 敗
            guesses    INTEGER NOT NULL,   -- 用了幾次猜中（敗則為 MAX+1）
            created_at TEXT NOT NULL
        )
        """
    )
    conn.commit()
    conn.close()


# ----------------------------- 工具 -----------------------------
def taipei_today():
    return datetime.now(TAIPEI).strftime("%Y-%m-%d")


def daily_pid(date_str):
    """以日期字串雜湊，穩定地對應到題庫索引。"""
    h = hashlib.md5(date_str.encode("utf-8")).hexdigest()
    return int(h, 16) % len(IDIOMS)


def valid_pid(pid):
    return isinstance(pid, int) and 0 <= pid < len(IDIOMS)


def judge(answer, guess):
    """Wordle 兩階段判定，正確處理重複字。"""
    result = ["absent"] * WORD_LEN
    remain = {}
    for ch in answer:
        remain[ch] = remain.get(ch, 0) + 1
    # 第一階段：位置正確
    for i in range(WORD_LEN):
        if guess[i] == answer[i]:
            result[i] = "correct"
            remain[guess[i]] -= 1
    # 第二階段：字存在但位置不對
    for i in range(WORD_LEN):
        if result[i] == "correct":
            continue
        ch = guess[i]
        if remain.get(ch, 0) > 0:
            result[i] = "present"
            remain[ch] -= 1
    return result


def stats_for(rows):
    total = len(rows)
    won = sum(1 for r in rows if r["won"])
    dist = {str(i): 0 for i in range(1, MAX_ATTEMPTS + 1)}
    streak = 0
    best_streak = 0
    for r in sorted(rows, key=lambda x: x["created_at"]):
        if r["won"]:
            if str(r["guesses"]) in dist:
                dist[str(r["guesses"])] += 1
            streak += 1
            best_streak = max(best_streak, streak)
        else:
            streak = 0
    return {
        "total": total,
        "won": won,
        "lost": total - won,
        "winRate": round(won / total * 100) if total else 0,
        "distribution": dist,
        "currentStreak": streak,
        "bestStreak": best_streak,
    }


# ----------------------------- 路由 -----------------------------
@app.route("/")
def index():
    return render_template(
        "index.html",
        word_len=WORD_LEN,
        max_attempts=MAX_ATTEMPTS,
        total_idioms=len(IDIOMS),
        today=taipei_today(),
    )


@app.route("/api/puzzle/today")
def puzzle_today():
    date_str = taipei_today()
    return jsonify(
        {
            "pid": daily_pid(date_str),
            "date": date_str,
            "mode": "daily",
            "length": WORD_LEN,
            "attempts": MAX_ATTEMPTS,
        }
    )


@app.route("/api/puzzle/random")
def puzzle_random():
    import random

    today_pid = daily_pid(taipei_today())
    pid = today_pid
    if len(IDIOMS) > 1:
        while pid == today_pid:
            pid = random.randrange(len(IDIOMS))
    return jsonify(
        {"pid": pid, "mode": "practice", "length": WORD_LEN, "attempts": MAX_ATTEMPTS}
    )


@app.route("/api/guess", methods=["POST"])
def guess():
    data = request.get_json(silent=True) or {}
    g = (data.get("guess") or "").strip()
    pid = data.get("pid")
    if not valid_pid(pid):
        return jsonify({"ok": False, "error": "題目不存在"}), 400
    if not HAN_RE.match(g):
        return jsonify({"ok": False, "error": "請輸入四個中文字"}), 200
    answer = IDIOMS[pid]["word"]
    feedback = judge(answer, g)
    solved = all(s == "correct" for s in feedback)
    return jsonify({"ok": True, "guess": g, "feedback": feedback, "solved": solved})


@app.route("/api/hint")
def hint():
    try:
        pid = int(request.args.get("pid", "-1"))
    except ValueError:
        pid = -1
    if not valid_pid(pid):
        return jsonify({"ok": False, "error": "題目不存在"}), 400
    return jsonify({"ok": True, "hint": IDIOMS[pid]["hint"]})


@app.route("/api/reveal", methods=["POST"])
def reveal():
    data = request.get_json(silent=True) or {}
    pid = data.get("pid")
    if not valid_pid(pid):
        return jsonify({"ok": False, "error": "題目不存在"}), 400
    item = IDIOMS[pid]
    return jsonify(
        {"ok": True, "answer": item["word"], "meaning": item["meaning"], "hint": item["hint"]}
    )


@app.route("/api/result", methods=["POST"])
def result():
    data = request.get_json(silent=True) or {}
    pid = data.get("pid")
    mode = "practice" if data.get("mode") == "practice" else "daily"
    won = 1 if data.get("won") else 0
    try:
        guesses = int(data.get("guesses"))
    except (TypeError, ValueError):
        guesses = MAX_ATTEMPTS + 1
    if not valid_pid(pid):
        return jsonify({"ok": False, "error": "題目不存在"}), 400
    guesses = max(1, min(guesses, MAX_ATTEMPTS + 1))
    now = datetime.now(TAIPEI)
    conn = get_db()
    conn.execute(
        "INSERT INTO plays (play_date, mode, pid, won, guesses, created_at) VALUES (?,?,?,?,?,?)",
        (taipei_today(), mode, pid, won, guesses, now.isoformat(timespec="seconds")),
    )
    conn.commit()
    conn.close()
    return jsonify({"ok": True, "stats": _collect_stats()})


@app.route("/api/stats")
def stats():
    return jsonify({"ok": True, "stats": _collect_stats()})


def _collect_stats():
    conn = get_db()
    all_rows = conn.execute("SELECT * FROM plays WHERE mode='daily'").fetchall()
    today_rows = conn.execute(
        "SELECT * FROM plays WHERE mode='daily' AND play_date=?", (taipei_today(),)
    ).fetchall()
    conn.close()
    return {"all": stats_for(all_rows), "today": stats_for(today_rows)}


if __name__ == "__main__":
    init_db()
    print("推敲 已啟動 → http://localhost:5000")
    app.run(host="0.0.0.0", port=5000, debug=False)
