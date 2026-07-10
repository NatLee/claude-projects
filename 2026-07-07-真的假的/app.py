# -*- coding: utf-8 -*-
"""
真的假的？· 冷知識真偽鑑定所
一個用 Flask + SQLite 打造的「真偽判斷」小遊戲後端。
每則敘述都是網路上流傳的冷知識，玩家判斷它是「真」還是「假」（迷思），
系統翻出朱印揭曉答案、附上解說與查證來源，並把每次作答存進 SQLite，
統計答對率、連勝，以及「你最容易被哪一類騙」。
所有題目皆經 WebSearch 查證，來源見 說明.md。
"""

import os
import sqlite3
from datetime import datetime, timezone, timedelta
from flask import Flask, jsonify, request, render_template

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "facts.db")
TW_TZ = timezone(timedelta(hours=8))  # 台灣時區

app = Flask(__name__)

# ---------------------------------------------------------------------------
# 題庫：每則皆經查證。verdict = 1 表示「敘述為真」，0 表示「敘述為假（迷思）」。
# ---------------------------------------------------------------------------
FACTS = [
    # ---------- 為真的敘述 ----------
    {
        "claim": "章魚有三顆心臟，而且血液是藍色的。",
        "verdict": 1, "category": "動物",
        "explanation": "真的。章魚用含「銅」的血青蛋白（hemocyanin）運送氧氣，氧合時呈藍色；三顆心臟中，兩顆負責把血液送過鰓部充氧，另一顆再把血送往全身。",
        "source": "Smithsonian Magazine",
        "source_url": "https://www.smithsonianmag.com/science-nature/ten-wild-facts-about-octopuses-they-have-three-hearts-big-brains-and-blue-blood-7625828/",
    },
    {
        "claim": "世界上有一種動物，會拉出方塊狀的大便。",
        "verdict": 1, "category": "動物",
        "explanation": "真的，就是澳洲的袋熊（wombat）。牠腸道末段肌肉軟硬交錯，蠕動時把糞便擠壓成立方體，方便堆在石頭上做記號而不會滾走——這項研究還拿下 2019 年搞笑諾貝爾獎。",
        "source": "Science (AAAS)",
        "source_url": "https://www.science.org/content/article/wombats-make-cube-shaped-poop-thanks-unique-intestines",
    },
    {
        "claim": "海獺睡覺時會手牽手，免得漂散走失。",
        "verdict": 1, "category": "動物",
        "explanation": "真的。海獺仰躺在水面成群休息（稱為 raft），會互相牽手或裹上海帶固定位置，以免睡著後被水流沖散。",
        "source": "Discover Magazine",
        "source_url": "https://www.discovermagazine.com/sea-otters-hold-hands-while-sleeping-and-they-even-cuddle-46115",
    },
    {
        "claim": "考古學家在三千多年前的古埃及墓裡找到的蜂蜜，至今仍然可以吃。",
        "verdict": 1, "category": "食物",
        "explanation": "真的。蜂蜜含水量極低、糖分極高又偏酸，還含微量過氧化氫，細菌與黴菌幾乎無法存活，因此密封良好可保存數千年不壞。",
        "source": "History Facts",
        "source_url": "https://historyfacts.com/world-history/fact/archaeologists-have-found-3000-year-old-pots-of-honey-that-are-still-edible/",
    },
    {
        "claim": "太空是有「味道」的——太空人形容像燒焦的牛排、灼熱金屬與焊接的煙味。",
        "verdict": 1, "category": "太空",
        "explanation": "真的。太空人結束太空漫步、回到艙內脫下頭盔時，會聞到殘留在裝備上的特殊氣味，多形容為煎牛排、熱金屬與焊接煙味，可能來自附著的原子氧等粒子。",
        "source": "The Christian Science Monitor",
        "source_url": "https://www.csmonitor.com/Science/2012/0723/Space-smells-like-seared-steak-hot-metal-astronauts-report",
    },
    {
        "claim": "艾菲爾鐵塔在炎熱的夏天，會比冬天「長高」大約 15 公分。",
        "verdict": 1, "category": "建築",
        "explanation": "真的。鐵受熱會膨脹，這座 300 多公尺高的鐵塔在盛夏與寒冬之間，高度大約會差 15 公分左右。",
        "source": "Snopes",
        "source_url": "https://www.snopes.com/fact-check/eiffel-tower-grows-summer-shrinks-winter/",
    },
    {
        "claim": "史上最短的戰爭，前後只打了大約 38 分鐘。",
        "verdict": 1, "category": "歷史",
        "explanation": "真的。1896 年的「英桑戰爭」（英國對尚吉巴）大約 38 至 45 分鐘就結束，是有紀錄以來最短的戰爭。",
        "source": "Britannica",
        "source_url": "https://www.britannica.com/event/Anglo-Zanzibar-War",
    },
    {
        "claim": "在植物學上，香蕉算是「漿果（berry）」，草莓反而不算。",
        "verdict": 1, "category": "植物",
        "explanation": "真的。植物學定義的漿果，是由單一子房發育、種子包在果肉裡；香蕉符合，草莓卻是由花托膨大而成的「聚合果」，所以不算漿果。",
        "source": "Live Science",
        "source_url": "https://www.livescience.com/57477-why-are-bananas-considered-berries.html",
    },
    {
        "claim": "埃及豔后活著的年代，離人類登月比離金字塔落成還要近。",
        "verdict": 1, "category": "歷史",
        "explanation": "真的。吉薩大金字塔約在公元前 2560 年完工，埃及豔后（克麗奧佩脫拉）生於公元前 69 年，相隔約 2500 年；而她距離 1969 年登月只約 2000 年。金字塔對她而言早已是「古蹟」。",
        "source": "WorldAtlas",
        "source_url": "https://www.worldatlas.com/articles/so-cleopatra-lived-closer-in-time-to-the-first-lunar-landing-than-the-great-pyramids.html",
    },
    # ---------- 為假（迷思）的敘述 ----------
    {
        "claim": "萬里長城是太空中唯一用肉眼就能看見的人造建築。",
        "verdict": 0, "category": "太空",
        "explanation": "假的。NASA 與多位太空人（包括中國首位太空人楊利偉）都證實，在近地軌道用肉眼根本看不到長城——它雖長，最寬處也只有約 9 公尺，且顏色和周遭地表相近。",
        "source": "NASA",
        "source_url": "https://www.nasa.gov/image-article/great-wall/",
    },
    {
        "claim": "鬥牛時，公牛是被那塊布的「紅色」激怒，才會衝過去。",
        "verdict": 0, "category": "動物",
        "explanation": "假的。牛其實是紅綠色盲，看不太出紅色；真正激怒牠、引牠衝刺的是布的「揮動」。《流言終結者》實驗也證實：換成藍色、白色的布照樣衝。",
        "source": "Snopes",
        "source_url": "https://www.snopes.com/fact-check/red-triggers-bulls/",
    },
    {
        "claim": "拿破崙是個異常矮小的人。",
        "verdict": 0, "category": "歷史",
        "explanation": "假的。拿破崙身高約 168–170 公分，在當時的法國男性中屬中等甚至略高。「矮個子」印象來自英國諷刺漫畫的醜化，以及法制與英制「吋」換算的誤差。",
        "source": "Britannica",
        "source_url": "https://www.britannica.com/story/was-napoleon-short",
    },
    {
        "claim": "人類終其一生，其實只用到大腦的 10%。",
        "verdict": 0, "category": "人體",
        "explanation": "假的。fMRI、PET 等腦造影顯示，我們幾乎用到大腦的每一個部位，連睡覺時大腦也在全區運作。大腦只占體重約 2%，卻耗掉約 20% 的能量，不可能大半閒置。",
        "source": "Scientific American",
        "source_url": "https://www.scientificamerican.com/article/do-people-only-use-10-percent-of-their-brains/",
    },
    {
        "claim": "金魚的記憶只有短短 3 秒。",
        "verdict": 0, "category": "動物",
        "explanation": "假的。研究顯示金魚的記憶至少可維持好幾個月，能被訓練走迷宮、認得餵食的主人，甚至會看時間。3 秒記憶純屬都市傳說。",
        "source": "Live Science",
        "source_url": "https://www.livescience.com/goldfish-memory.html",
    },
    {
        "claim": "舌頭有分區的「味覺地圖」：舌尖嚐甜、兩側嚐酸、舌根嚐苦。",
        "verdict": 0, "category": "人體",
        "explanation": "假的。整條舌頭其實都能嚐到各種基本味覺。這張「味覺地圖」源自 1901 年一份德國研究被後人誤讀、誇大成分區圖，早已被推翻。",
        "source": "Smithsonian Magazine",
        "source_url": "https://www.smithsonianmag.com/science-nature/neat-and-tidy-map-tastes-tongue-you-learned-school-all-wrong-180963407/",
    },
    {
        "claim": "維京人打仗時，頭上戴著有角的頭盔。",
        "verdict": 0, "category": "歷史",
        "explanation": "假的。考古上找不到維京人戴角盔的證據。這個經典形象其實出自 1876 年華格納歌劇《尼伯龍根的指環》的服裝設計，之後才被畫進各種插畫流傳開來。",
        "source": "History.com",
        "source_url": "https://www.history.com/articles/did-vikings-really-wear-horned-helmets",
    },
    {
        "claim": "閃電不會打在同一個地方兩次。",
        "verdict": 0, "category": "自然",
        "explanation": "假的。閃電偏好又高又尖又突出的目標，很常重複打在同一處。光是紐約帝國大廈，平均一年就被雷擊中約 20–25 次。",
        "source": "美國國家氣象局（NWS）",
        "source_url": "https://www.weather.gov/safety/lightning-myths",
    },
    {
        "claim": "蝙蝠是瞎子，什麼都看不見。",
        "verdict": 0, "category": "動物",
        "explanation": "假的。所有蝙蝠都看得見，有些種類視力還相當好；牠們在黑暗中主要靠「回聲定位」導航，但那是聽覺的本事，不代表眼睛看不到。",
        "source": "Britannica",
        "source_url": "https://www.britannica.com/story/are-bats-really-blind",
    },
]


# ---------------------------------------------------------------------------
# 資料庫
# ---------------------------------------------------------------------------
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """首次執行自動建立資料表並灌入題庫。"""
    conn = get_db()
    cur = conn.cursor()
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS facts (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            claim       TEXT NOT NULL UNIQUE,
            verdict     INTEGER NOT NULL,
            category    TEXT NOT NULL,
            explanation TEXT NOT NULL,
            source      TEXT NOT NULL,
            source_url  TEXT NOT NULL
        )
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS answers (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            fact_id    INTEGER NOT NULL,
            guess      INTEGER NOT NULL,
            correct    INTEGER NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (fact_id) REFERENCES facts (id)
        )
        """
    )
    # 灌入題庫（以 claim 去重，重跑不會重複）
    for f in FACTS:
        cur.execute(
            """INSERT OR IGNORE INTO facts
               (claim, verdict, category, explanation, source, source_url)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (f["claim"], f["verdict"], f["category"],
             f["explanation"], f["source"], f["source_url"]),
        )
    conn.commit()
    conn.close()


def compute_stats(conn):
    """從 answers 計算整體統計、連勝、各類別答對率。"""
    cur = conn.cursor()
    rows = cur.execute(
        """SELECT a.correct, f.category
           FROM answers a JOIN facts f ON f.id = a.fact_id
           ORDER BY a.id ASC"""
    ).fetchall()

    total = len(rows)
    correct = sum(r["correct"] for r in rows)

    # 連勝：目前連勝（尾端連續答對）、最佳連勝
    current_streak = 0
    best_streak = 0
    run = 0
    for r in rows:
        if r["correct"]:
            run += 1
            best_streak = max(best_streak, run)
        else:
            run = 0
    # 尾端連續答對
    for r in reversed(rows):
        if r["correct"]:
            current_streak += 1
        else:
            break

    # 各類別
    cats = {}
    for r in rows:
        c = cats.setdefault(r["category"], {"total": 0, "correct": 0})
        c["total"] += 1
        c["correct"] += r["correct"]

    category_stats = []
    for name, d in sorted(cats.items(), key=lambda x: -x[1]["total"]):
        acc = round(d["correct"] / d["total"] * 100) if d["total"] else 0
        category_stats.append(
            {"category": name, "total": d["total"],
             "correct": d["correct"], "accuracy": acc}
        )

    # 「最容易被騙」的類別：作答數 >= 2 且答對率最低者
    fooled = None
    candidates = [c for c in category_stats if c["total"] >= 2]
    if candidates:
        worst = min(candidates, key=lambda c: (c["accuracy"], -c["total"]))
        if worst["accuracy"] < 100:
            fooled = worst["category"]

    total_facts = cur.execute("SELECT COUNT(*) n FROM facts").fetchone()["n"]
    seen_facts = cur.execute(
        "SELECT COUNT(DISTINCT fact_id) n FROM answers"
    ).fetchone()["n"]

    return {
        "total": total,
        "correct": correct,
        "accuracy": round(correct / total * 100) if total else 0,
        "current_streak": current_streak,
        "best_streak": best_streak,
        "category_stats": category_stats,
        "most_fooled": fooled,
        "total_facts": total_facts,
        "seen_facts": seen_facts,
    }


# ---------------------------------------------------------------------------
# 路由
# ---------------------------------------------------------------------------
@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/question")
def api_question():
    """抽一題：優先給作答次數最少的題目，避免和上一題重複。回傳不含答案。"""
    exclude = request.args.get("exclude", type=int) or -1
    conn = get_db()
    row = conn.execute(
        """
        SELECT f.id, f.claim, f.category
        FROM facts f
        LEFT JOIN (
            SELECT fact_id, COUNT(*) AS c FROM answers GROUP BY fact_id
        ) a ON a.fact_id = f.id
        ORDER BY (f.id = ?) ASC, COALESCE(a.c, 0) ASC, RANDOM()
        LIMIT 1
        """,
        (exclude,),
    ).fetchone()
    conn.close()
    if row is None:
        return jsonify({"error": "題庫是空的"}), 500
    return jsonify({"id": row["id"], "claim": row["claim"], "category": row["category"]})


@app.route("/api/answer", methods=["POST"])
def api_answer():
    """送出判斷：記錄作答，回傳正解、解說、來源與最新統計。"""
    data = request.get_json(silent=True) or {}
    fact_id = data.get("fact_id")
    guess = data.get("guess")
    if fact_id is None or guess not in (0, 1, True, False):
        return jsonify({"error": "參數不正確"}), 400
    guess = 1 if guess in (1, True) else 0

    conn = get_db()
    fact = conn.execute("SELECT * FROM facts WHERE id = ?", (fact_id,)).fetchone()
    if fact is None:
        conn.close()
        return jsonify({"error": "找不到這一題"}), 404

    correct = 1 if guess == fact["verdict"] else 0
    now = datetime.now(TW_TZ).isoformat(timespec="seconds")
    conn.execute(
        "INSERT INTO answers (fact_id, guess, correct, created_at) VALUES (?, ?, ?, ?)",
        (fact_id, guess, correct, now),
    )
    conn.commit()
    stats = compute_stats(conn)
    conn.close()

    return jsonify({
        "correct": bool(correct),
        "verdict": fact["verdict"],          # 1=真, 0=假
        "your_guess": guess,
        "claim": fact["claim"],
        "category": fact["category"],
        "explanation": fact["explanation"],
        "source": fact["source"],
        "source_url": fact["source_url"],
        "stats": stats,
    })


@app.route("/api/stats")
def api_stats():
    conn = get_db()
    stats = compute_stats(conn)
    conn.close()
    return jsonify(stats)


@app.route("/api/reset", methods=["POST"])
def api_reset():
    """清空作答紀錄（保留題庫），重新開始。"""
    conn = get_db()
    conn.execute("DELETE FROM answers")
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


if __name__ == "__main__":
    init_db()
    print("真偽鑑定所已開張：請用瀏覽器打開 http://localhost:5000")
    app.run(host="127.0.0.1", port=5000, debug=False)
