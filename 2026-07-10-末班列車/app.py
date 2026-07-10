# -*- coding: utf-8 -*-
"""
末班列車 · 互動文字冒險（後端）
================================
Flask + SQLite。首次啟動會自動建立 game.db 並灌入故事資料。

主要 API：
  GET  /                 首頁（前端單頁）
  GET  /api/state        取得目前進度（沒有存檔就從「上車」開始）
  POST /api/start        重新開始一段旅程（清空隨身之物，保留結局收集）
  POST /api/choose       做出一個選擇，前進到下一個場景
  GET  /api/endings      取得結局收集清單（哪些已解鎖）

玩家以前端 localStorage 產生的 player_id 識別，一人一份存檔與收集。
"""
import json
import os
import sqlite3
from datetime import datetime, timezone, timedelta

from flask import Flask, g, jsonify, render_template, request

import story_data

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "game.db")
TW = timezone(timedelta(hours=8))  # 台灣時區

app = Flask(__name__)
# 讓 jsonify 直接輸出中文（不要轉成跳脫字元）
try:
    app.json.ensure_ascii = False          # Flask 2.3+
except Exception:                          # 舊版 Flask
    app.config["JSON_AS_ASCII"] = False


# --------------------------------------------------------------------- 資料庫
def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


@app.teardown_appcontext
def close_db(exc):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    """建立資料表，並在故事資料表為空時灌入 story_data。"""
    # 保險：若資料夾裡殘留一個空的（0 byte）game.db（例如同步或上次中斷留下的），
    # 就連同它的 journal 一起清掉，讓下面重新建立乾淨的資料庫；正常有資料的 db 不受影響。
    try:
        if os.path.exists(DB_PATH) and os.path.getsize(DB_PATH) == 0:
            for stale in (DB_PATH, DB_PATH + "-journal"):
                if os.path.exists(stale):
                    os.remove(stale)
    except OSError:
        pass

    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()
    cur.executescript(
        """
        CREATE TABLE IF NOT EXISTS nodes (
            id           TEXT PRIMARY KEY,
            title        TEXT NOT NULL,
            body         TEXT NOT NULL,
            is_ending    INTEGER NOT NULL DEFAULT 0,
            ending_name  TEXT,
            ending_tone  TEXT,
            ending_line  TEXT
        );
        CREATE TABLE IF NOT EXISTS choices (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            from_node  TEXT NOT NULL,
            label      TEXT NOT NULL,
            to_node    TEXT NOT NULL,
            requires   TEXT,
            grants     TEXT,
            order_idx  INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS saves (
            player_id    TEXT PRIMARY KEY,
            current_node TEXT NOT NULL,
            inventory    TEXT NOT NULL DEFAULT '[]',
            updated_at   TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS endings (
            player_id   TEXT NOT NULL,
            ending_name TEXT NOT NULL,
            ending_tone TEXT,
            ending_line TEXT,
            reached_at  TEXT NOT NULL,
            PRIMARY KEY (player_id, ending_name)
        );
        """
    )

    # 只有在 nodes 為空時才灌資料（避免重複）
    cur.execute("SELECT COUNT(*) FROM nodes")
    if cur.fetchone()[0] == 0:
        for nid, node in story_data.NODES.items():
            cur.execute(
                "INSERT INTO nodes (id, title, body, is_ending, ending_name, ending_tone, ending_line) "
                "VALUES (?,?,?,?,?,?,?)",
                (
                    nid,
                    node["title"],
                    node["body"],
                    1 if node.get("is_ending") else 0,
                    node.get("ending_name"),
                    node.get("ending_tone"),
                    node.get("ending_line"),
                ),
            )
            for i, ch in enumerate(node.get("choices", [])):
                grants = [x for x in (ch.get("grants"), ch.get("grants2")) if x]
                cur.execute(
                    "INSERT INTO choices (from_node, label, to_node, requires, grants, order_idx) "
                    "VALUES (?,?,?,?,?,?)",
                    (
                        nid,
                        ch["label"],
                        ch["to"],
                        ch.get("requires"),
                        ",".join(grants) if grants else None,
                        i,
                    ),
                )
    con.commit()
    con.close()


# --------------------------------------------------------------------- 工具
def now_str():
    return datetime.now(TW).strftime("%Y-%m-%d %H:%M:%S")


def get_save(db, player_id, create=True):
    row = db.execute("SELECT * FROM saves WHERE player_id=?", (player_id,)).fetchone()
    if row is None and create:
        db.execute(
            "INSERT INTO saves (player_id, current_node, inventory, updated_at) VALUES (?,?,?,?)",
            (player_id, "start", "[]", now_str()),
        )
        db.commit()
        row = db.execute("SELECT * FROM saves WHERE player_id=?", (player_id,)).fetchone()
    return row


def load_inventory(row):
    try:
        return json.loads(row["inventory"])
    except Exception:
        return []


def build_inventory_view(inv):
    """把玩家持有的 token 轉成前端可顯示的清單（隱藏未登錄的旗標）。"""
    view = []
    for t in inv:
        meta = story_data.TOKENS.get(t)
        if meta:
            view.append({"token": t, "emoji": meta["emoji"], "kind": meta["kind"], "desc": meta["desc"]})
    return view


def endings_progress(db, player_id):
    total = len(story_data.ENDINGS_ORDER)
    got = db.execute("SELECT COUNT(*) AS c FROM endings WHERE player_id=?", (player_id,)).fetchone()["c"]
    return {"unlocked": got, "total": total}


def node_payload(db, player_id, save_row, just_unlocked=False, new_to_collection=False):
    inv = load_inventory(save_row)
    nid = save_row["current_node"]
    node = db.execute("SELECT * FROM nodes WHERE id=?", (nid,)).fetchone()

    choices = []
    if not node["is_ending"]:
        rows = db.execute(
            "SELECT * FROM choices WHERE from_node=? ORDER BY order_idx", (nid,)
        ).fetchall()
        for c in rows:
            if c["requires"] and c["requires"] not in inv:
                continue  # 條件未達成的選項先不顯示
            choices.append({"id": c["id"], "label": c["label"]})

    return {
        "node": {
            "id": node["id"],
            "title": node["title"],
            "body": node["body"],
            "is_ending": bool(node["is_ending"]),
            "ending_name": node["ending_name"],
            "ending_tone": node["ending_tone"],
            "ending_line": node["ending_line"],
        },
        "choices": choices,
        "inventory": build_inventory_view(inv),
        "endings": endings_progress(db, player_id),
        "just_unlocked": just_unlocked,
        "new_to_collection": new_to_collection,
    }


def require_player_id():
    data = request.get_json(silent=True) or {}
    pid = data.get("player_id") or request.args.get("player_id")
    return (pid or "").strip()


# --------------------------------------------------------------------- 路由
@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/state")
def api_state():
    pid = require_player_id()
    if not pid:
        return jsonify({"error": "缺少 player_id"}), 400
    db = get_db()
    save = get_save(db, pid)
    return jsonify(node_payload(db, pid, save))


@app.route("/api/start", methods=["POST"])
def api_start():
    pid = require_player_id()
    if not pid:
        return jsonify({"error": "缺少 player_id"}), 400
    db = get_db()
    db.execute(
        "INSERT INTO saves (player_id, current_node, inventory, updated_at) VALUES (?,?,?,?) "
        "ON CONFLICT(player_id) DO UPDATE SET current_node='start', inventory='[]', updated_at=?",
        (pid, "start", "[]", now_str(), now_str()),
    )
    db.commit()
    save = get_save(db, pid)
    return jsonify(node_payload(db, pid, save))


@app.route("/api/choose", methods=["POST"])
def api_choose():
    pid = require_player_id()
    if not pid:
        return jsonify({"error": "缺少 player_id"}), 400
    data = request.get_json(silent=True) or {}
    choice_id = data.get("choice_id")

    db = get_db()
    save = get_save(db, pid)
    inv = load_inventory(save)

    ch = db.execute("SELECT * FROM choices WHERE id=?", (choice_id,)).fetchone()
    if ch is None:
        return jsonify({"error": "找不到這個選項"}), 404
    if ch["from_node"] != save["current_node"]:
        return jsonify({"error": "這個選項不屬於目前的場景"}), 400
    if ch["requires"] and ch["requires"] not in inv:
        return jsonify({"error": "你還沒有辦法做這個選擇"}), 400

    # 給予隨身之物 / 回憶
    if ch["grants"]:
        for tok in ch["grants"].split(","):
            tok = tok.strip()
            if tok and tok not in inv:
                inv.append(tok)

    dest = ch["to_node"]
    db.execute(
        "UPDATE saves SET current_node=?, inventory=?, updated_at=? WHERE player_id=?",
        (dest, json.dumps(inv, ensure_ascii=False), now_str(), pid),
    )
    db.commit()

    # 若抵達結局，記進收集
    just_unlocked = False
    new_to_collection = False
    node = db.execute("SELECT * FROM nodes WHERE id=?", (dest,)).fetchone()
    if node["is_ending"]:
        just_unlocked = True
        exists = db.execute(
            "SELECT 1 FROM endings WHERE player_id=? AND ending_name=?", (pid, node["ending_name"])
        ).fetchone()
        if exists is None:
            new_to_collection = True
            db.execute(
                "INSERT INTO endings (player_id, ending_name, ending_tone, ending_line, reached_at) "
                "VALUES (?,?,?,?,?)",
                (pid, node["ending_name"], node["ending_tone"], node["ending_line"], now_str()),
            )
            db.commit()

    save = get_save(db, pid)
    return jsonify(node_payload(db, pid, save, just_unlocked, new_to_collection))


@app.route("/api/endings")
def api_endings():
    pid = require_player_id()
    if not pid:
        return jsonify({"error": "缺少 player_id"}), 400
    db = get_db()
    got = {
        r["ending_name"]: r
        for r in db.execute("SELECT * FROM endings WHERE player_id=?", (pid,)).fetchall()
    }
    items = []
    for name in story_data.ENDINGS_ORDER:
        r = got.get(name)
        items.append(
            {
                "name": name,
                "unlocked": r is not None,
                "tone": r["ending_tone"] if r else None,
                "line": r["ending_line"] if r else None,
                "reached_at": r["reached_at"] if r else None,
            }
        )
    return jsonify(
        {"endings": items, "unlocked": len(got), "total": len(story_data.ENDINGS_ORDER)}
    )


if __name__ == "__main__":
    init_db()
    print("末班列車已進站 ➜ 請用瀏覽器打開 http://localhost:5000")
    app.run(host="127.0.0.1", port=5000, debug=False)
