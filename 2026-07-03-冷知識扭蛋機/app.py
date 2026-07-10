# -*- coding: utf-8 -*-
"""
冷知識扭蛋機 — Flask + SQLite 後端
每天早上的小驚喜：轉一顆扭蛋，抽出一則經過查證的冷知識，慢慢收集整本圖鑑。

啟動：
    pip install -r requirements.txt
    python app.py
然後打開瀏覽器： http://localhost:5000
資料庫 gacha.db 會在第一次執行時自動建立並填入卡片。
"""

import os
import random
import sqlite3
from datetime import datetime, timezone, timedelta
from flask import Flask, jsonify, render_template

app = Flask(__name__)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
# 預設把資料庫放在專案資料夾；可用環境變數 GACHA_DB 指定其他位置
DB_PATH = os.environ.get("GACHA_DB", os.path.join(BASE_DIR, "gacha.db"))

# 台灣時區（UTC+8），純為記錄抽卡時間用
TW_TZ = timezone(timedelta(hours=8))

# 稀有度抽出權重：越稀有越難抽到
RARITY_WEIGHT = {"普通": 6, "稀有": 3, "傳說": 1}

# ---------------------------------------------------------------------------
# 卡片資料：24 則冷知識，全部經過查證（來源見 說明.md）
# 欄位：類別, emoji, 標題, 內容, 來源, 稀有度
# ---------------------------------------------------------------------------
CARDS = [
    # 動物 🐾
    ("動物", "🐙", "章魚有三顆心臟",
     "章魚有三顆心臟，血液還是藍色的——因為牠們用含銅的「血藍蛋白」運送氧氣，而不是含鐵的血紅素。",
     "Smithsonian Ocean", "稀有"),
    ("動物", "🦦", "海獺睡覺會牽手",
     "海獺睡覺時會手牽手，甚至用海帶把自己纏住，避免在睡夢中被海流沖散、彼此走失。",
     "Vancouver Aquarium", "稀有"),
    ("動物", "🐝", "蜜蜂認得出人臉",
     "蜜蜂能被訓練分辨不同的人臉，靠的是記住五官的相對位置，準確率高達八九成——而牠的腦袋比針頭還小。",
     "Journal of Experimental Biology, 2010", "傳說"),
    ("動物", "🦥", "樹懶消化最慢",
     "樹懶是消化最慢的哺乳動物，一片葉子最慢要花上約一個月才能消化完，牠也因此大約一週才下樹排便一次。",
     "The Sloth Conservation Foundation", "普通"),

    # 太空 🚀
    ("太空", "🪐", "金星的一天比一年長",
     "金星自轉一圈要 243 個地球日，繞太陽一圈卻只要 225 個地球日——所以在金星上，「一天」比「一年」還要漫長。",
     "NASA Solar System", "傳說"),
    ("太空", "✨", "一茶匙重十億噸",
     "一茶匙的中子星物質，拿到地球上大約重十億噸，比全世界所有人加起來還重——因為它幾乎是一整顆被壓碎的原子核。",
     "BBC Sky at Night / SpaceDaily", "傳說"),
    ("太空", "☀️", "太陽獨佔 99.86%",
     "太陽一個就佔了整個太陽系總質量的 99.86%，八大行星、小行星、彗星全部加起來還不到千分之二。",
     "NASA", "稀有"),
    ("太空", "🌅", "一天看 16 次日出",
     "國際太空站每約 90 分鐘就繞地球一圈，站上的太空人一天可以看見 16 次日出和日落。",
     "NASA ISS", "普通"),

    # 人體 🫀
    ("人體", "🫁", "左肺比右肺小",
     "你的左肺天生就比右肺小一點、少一葉——這是為了在胸腔左側替心臟讓出空間。",
     "Cleveland Clinic", "普通"),
    ("人體", "🌀", "胃每幾天換新皮",
     "胃壁的黏膜每三到四天就更新一次，因為胃酸強到能腐蝕金屬，不常換新的話，胃會把自己給消化掉。",
     "Encyclopaedia Britannica", "稀有"),
    ("人體", "👃", "鼻子能分辨一兆種氣味",
     "2014 年《Science》研究估計，人的鼻子至少能分辨一兆種不同氣味，遠遠超過過去「大約一萬種」的舊說法。",
     "Science, 2014", "稀有"),
    ("人體", "🦴", "骨頭比鋼還強",
     "以相同重量來比，人的骨頭比鋼還要堅固——它在承受壓力時的強度重量比，勝過許多金屬。",
     "PBS / Nova", "普通"),

    # 歷史 📜
    ("歷史", "🦣", "金字塔比長毛象晚",
     "埃及大金字塔蓋好時，長毛象其實還活著——最後一群長毛象在西伯利亞的弗蘭格爾島一直存活到約公元前 1650 年。",
     "Wikipedia: Wrangel Island / Woolly mammoth", "傳說"),
    ("歷史", "👑", "埃及豔后離登月更近",
     "克麗奧佩脫拉（埃及豔后）活著的年代，距離人類登陸月球，竟然比距離金字塔落成還要近。",
     "History / 時間軸推算", "傳說"),
    ("歷史", "🎓", "牛津比阿茲提克老",
     "牛津大學比阿茲提克帝國還古老：牛津早在 1096 年就開始授課，阿茲提克人要到 1325 年才建立首都。",
     "University of Oxford", "稀有"),
    ("歷史", "🐰", "拿破崙被兔子擊退",
     "拿破崙曾被一大群兔子「擊退」——一場慶功狩獵放出上千隻家兔，牠們不怕人，反而朝拿破崙一行人蜂擁而上。",
     "Napoleon.org / History", "普通"),

    # 食物 🍯
    ("食物", "🍯", "蜂蜜永不腐壞",
     "蜂蜜幾乎永遠不會壞。考古學家曾在三千多年前的古埃及墓中，挖出仍然可以食用的蜂蜜。",
     "Smithsonian Magazine", "傳說"),
    ("食物", "🍌", "香蕉是漿果，草莓不是",
     "在植物學上，香蕉才是「漿果（berry）」，而草莓其實不算——真正的漿果要由單一子房發育、種子包在果肉裡。",
     "Encyclopaedia Britannica", "稀有"),
    ("食物", "🍅", "番茄醬曾被當藥賣",
     "1830 年代的美國，番茄醬曾被包成藥丸當「良藥」販賣，宣稱能治腹瀉和消化不良。",
     "Smithsonian Magazine", "稀有"),
    ("食物", "🥕", "胡蘿蔔原本不是橘的",
     "胡蘿蔔原本多是紫色或白色的，我們今天熟悉的橘色，是後來荷蘭人一代代培育出來的品種。",
     "Live Science", "普通"),

    # 自然・地理 🌍
    ("自然", "🏜️", "撒哈拉替雨林施肥",
     "撒哈拉沙漠的沙塵每年飄越大西洋，把富含磷的養分送到亞馬遜雨林——沙漠竟然是雨林的施肥者。",
     "NASA Earth Observatory", "稀有"),
    ("自然", "🌏", "澳洲比月亮還寬",
     "澳洲東西寬約 4000 公里，而月球的直徑只有約 3474 公里——澳洲比整個月亮還要「寬」。",
     "Geoscience Australia / NASA", "傳說"),
    ("自然", "💧", "芬蘭有 18 萬個湖",
     "芬蘭素有「千湖之國」之稱，但實際上它境內的湖泊超過 18 萬個，「千」其實是嚴重低估。",
     "Finland Statistics", "普通"),
    ("自然", "🧭", "阿拉斯加同時最北西東",
     "阿拉斯加同時是全美最北、最西、又最東的州——因為它的阿留申群島一路跨過了東經 180 度線。",
     "USGS", "稀有"),
]


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def _build_schema_and_seed(conn):
    cur = conn.cursor()
    cur.execute(
        "CREATE TABLE IF NOT EXISTS cards ("
        " id INTEGER PRIMARY KEY AUTOINCREMENT,"
        " category TEXT NOT NULL, emoji TEXT NOT NULL, title TEXT NOT NULL,"
        " fact TEXT NOT NULL, source TEXT NOT NULL, rarity TEXT NOT NULL)"
    )
    cur.execute(
        "CREATE TABLE IF NOT EXISTS collection ("
        " card_id INTEGER PRIMARY KEY, first_pulled_at TEXT NOT NULL,"
        " pull_count INTEGER NOT NULL DEFAULT 0,"
        " FOREIGN KEY (card_id) REFERENCES cards(id))"
    )
    cur.execute("SELECT COUNT(*) AS n FROM cards")
    if cur.fetchone()["n"] == 0:
        cur.executemany(
            "INSERT INTO cards (category, emoji, title, fact, source, rarity)"
            " VALUES (?, ?, ?, ?, ?, ?)",
            CARDS,
        )
    conn.commit()


def init_db():
    """建立資料表；若卡片尚未匯入則自動填入。
    若既有資料庫檔損毀或不完整，會自動刪除重建，確保第一次執行必定成功。"""
    conn = None
    try:
        conn = get_db()
        _build_schema_and_seed(conn)
        conn.close()
    except sqlite3.DatabaseError:
        try:
            if conn is not None:
                conn.close()
        except Exception:
            pass
        for suffix in ("", "-journal", "-wal", "-shm"):
            p = DB_PATH + suffix
            if os.path.exists(p):
                os.remove(p)  # 移除損毀／不完整的資料庫及殘留日誌後重建
        conn = get_db()
        _build_schema_and_seed(conn)
        conn.close()


def card_to_dict(row, collected=False, pull_count=0):
    return {
        "id": row["id"],
        "category": row["category"],
        "emoji": row["emoji"],
        "title": row["title"],
        "fact": row["fact"],
        "source": row["source"],
        "rarity": row["rarity"],
        "collected": collected,
        "pull_count": pull_count,
    }


def compute_stats(conn):
    total_cards = conn.execute("SELECT COUNT(*) AS n FROM cards").fetchone()["n"]
    unique_collected = conn.execute("SELECT COUNT(*) AS n FROM collection").fetchone()["n"]
    total_pulls = conn.execute(
        "SELECT COALESCE(SUM(pull_count), 0) AS n FROM collection"
    ).fetchone()["n"]
    percent = round(unique_collected / total_cards * 100) if total_cards else 0
    return {
        "total_cards": total_cards,
        "unique_collected": unique_collected,
        "total_pulls": total_pulls,
        "percent": percent,
    }


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/pull", methods=["POST"])
def pull():
    """轉一顆扭蛋：依稀有度加權隨機抽出一張卡，記錄進收藏。"""
    conn = get_db()
    rows = conn.execute("SELECT * FROM cards").fetchall()
    if not rows:
        conn.close()
        return jsonify({"error": "尚無卡片"}), 500

    weights = [RARITY_WEIGHT.get(r["rarity"], 1) for r in rows]
    chosen = random.choices(rows, weights=weights, k=1)[0]

    existing = conn.execute(
        "SELECT * FROM collection WHERE card_id = ?", (chosen["id"],)
    ).fetchone()
    is_new = existing is None
    now = datetime.now(TW_TZ).isoformat(timespec="seconds")

    if is_new:
        conn.execute(
            "INSERT INTO collection (card_id, first_pulled_at, pull_count) VALUES (?, ?, 1)",
            (chosen["id"], now),
        )
        pull_count = 1
    else:
        pull_count = existing["pull_count"] + 1
        conn.execute(
            "UPDATE collection SET pull_count = ? WHERE card_id = ?",
            (pull_count, chosen["id"]),
        )
    conn.commit()

    stats = compute_stats(conn)
    conn.close()

    return jsonify(
        {
            "card": card_to_dict(chosen, collected=True, pull_count=pull_count),
            "is_new": is_new,
            "stats": stats,
        }
    )


@app.route("/api/album")
def album():
    """回傳整本圖鑑：每張卡片與是否已收集，加上統計。"""
    conn = get_db()
    rows = conn.execute("SELECT * FROM cards ORDER BY id").fetchall()
    owned = {
        r["card_id"]: r["pull_count"]
        for r in conn.execute("SELECT card_id, pull_count FROM collection").fetchall()
    }
    cards = [
        card_to_dict(r, collected=r["id"] in owned, pull_count=owned.get(r["id"], 0))
        for r in rows
    ]
    stats = compute_stats(conn)
    conn.close()
    return jsonify({"cards": cards, "stats": stats})


@app.route("/api/reset", methods=["POST"])
def reset():
    """清空收藏，重新開始收集。"""
    conn = get_db()
    conn.execute("DELETE FROM collection")
    conn.commit()
    stats = compute_stats(conn)
    conn.close()
    return jsonify({"ok": True, "stats": stats})


if __name__ == "__main__":
    init_db()
    print("冷知識扭蛋機已啟動 →  http://localhost:5000")
    app.run(host="0.0.0.0", port=5000, debug=False)
