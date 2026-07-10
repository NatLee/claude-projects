#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
費米的餐巾紙 — 費米估算練習場
後端：Flask + SQLite（純標準函式庫，依賴只有 Flask）

啟動：
    python app.py
然後用瀏覽器打開 http://localhost:5000
"""

import os
import math
import random
import sqlite3
from datetime import datetime

from flask import Flask, request, jsonify, render_template

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
# 預設把資料庫放在 app.py 旁邊；若該資料夾是 OneDrive 同步夾而遇到鎖定問題，
# 可設定環境變數 FERMI_DB 指向本機路徑（例如 C:\Temp\fermi.db）。
DB_PATH = os.environ.get("FERMI_DB") or os.path.join(BASE_DIR, "fermi.db")

app = Flask(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# 題庫：所有數值皆經查證或可直接計算（見 說明.md 的資料來源）
#   answer 一律以「題目單位」的數值表示
# ─────────────────────────────────────────────────────────────────────────────
QUESTIONS = [
    {
        "prompt": "一年大約有多少秒？",
        "answer": 31_557_600, "unit": "秒", "category": "時間量級",
        "explanation": "365.25 天 × 24 時 × 60 分 × 60 秒 ≈ 3.16×10⁷。物理學家的口訣是「π×10⁷ 秒 ≈ 一年」，誤差不到 0.5%，超好記。",
        "source": "基本換算",
    },
    {
        "prompt": "一個成年人的身體大約由多少個細胞組成？",
        "answer": 3.72e13, "unit": "個", "category": "人體尺度",
        "explanation": "把各器官、各類細胞分別估算再加總。Bianconi 等人 2013 年得到約 3.72×10¹³（37.2 兆）個，其中超過 7 成是紅血球。",
        "source": "Bianconi et al., 2013, Annals of Human Biology",
    },
    {
        "prompt": "人類大腦大約有多少個神經元（neuron）？",
        "answer": 8.6e10, "unit": "個", "category": "人體尺度",
        "explanation": "Herculano-Houzel 用「腦湯」法（把腦組織均質化後數細胞核）算出約 860 億個，遠少於過去常說的「一兆」。",
        "source": "Herculano-Houzel, 2009",
    },
    {
        "prompt": "地球到月球的平均距離大約是多少公里？",
        "answer": 384_400, "unit": "公里", "category": "天文距離",
        "explanation": "約 38.4 萬公里 ≈ 地球直徑的 30 倍。光來回約 2.56 秒，這正是阿波羅任務地月通訊的延遲。",
        "source": "天文常數",
    },
    {
        "prompt": "陽光從太陽到地球，大約要走多少秒？",
        "answer": 499, "unit": "秒", "category": "天文距離",
        "explanation": "1 天文單位 ÷ 光速 = 1.5×10⁸ km ÷ 3×10⁵ km/s ≈ 500 秒 ≈ 8 分 20 秒。你看到的太陽，是 8 分鐘前的它。",
        "source": "天文常數",
    },
    {
        "prompt": "台灣四大超商（7-11、全家、萊爾富、OK）合計大約有多少家門市？",
        "answer": 14_000, "unit": "家", "category": "生活密度",
        "explanation": "約 2,300 萬人口、每約 1,600 人就有一家超商，密度世界數一數二。四大合計逾 1.4 萬家（7-11 約 8,300、全家約 4,500）。",
        "source": "台灣連鎖暨加盟協會 / 經濟日報，2025",
    },
    {
        "prompt": "一個人活到 80 歲，一生大約眨眼幾次？",
        "answer": 4.2e8, "unit": "次", "category": "費米經典",
        "explanation": "每分鐘約 15 次 × 清醒 16 時 × 60 分 × 365 天 × 80 年 ≈ 4×10⁸。這是費米估算的經典：拆成可估的小步驟連乘。",
        "source": "估算鏈（眨眼頻率 15 次/分）",
    },
    {
        "prompt": "聖母峰（珠穆朗瑪峰）的高度大約是多少公尺？",
        "answer": 8849, "unit": "公尺", "category": "地球尺度",
        "explanation": "8,849 公尺（2020 年中尼聯合測量值），約是台北 101（508 公尺）的 17 倍高。",
        "source": "2020 中尼聯測",
    },
    {
        "prompt": "台北 101 的高度（含尖頂）大約是多少公尺？",
        "answer": 508, "unit": "公尺", "category": "地球尺度",
        "explanation": "508 公尺，2004–2010 年間曾是世界最高樓。內部的 660 公噸調諧質量阻尼器是抗風神器。",
        "source": "建築公開資料",
    },
    {
        "prompt": "地球赤道一圈的周長大約是多少公里？",
        "answer": 40_075, "unit": "公里", "category": "地球尺度",
        "explanation": "40,075 公里。當年「公尺」被定義成『赤道到北極距離的千萬分之一』，所以周長≈4×10⁷ 公尺並非巧合。",
        "source": "大地測量",
    },
    {
        "prompt": "空中巴士 A380（全球最大客機）最大起飛重量大約多少公噸？",
        "answer": 575, "unit": "公噸", "category": "工程量級",
        "explanation": "約 575 公噸，相當於約 100 頭非洲象。能裝下 800 多位乘客還飛得起來，本身就是工程奇蹟。",
        "source": "Airbus 規格",
    },
    {
        "prompt": "全世界現存、已被描述命名的鳥類大約有多少種？",
        "answer": 11_000, "unit": "種", "category": "自然萬象",
        "explanation": "依不同名錄約 10,800–11,000 種（IOC 約 10,800、Clements 約 10,990），幾乎是哺乳類（約 6,500 種）的兩倍。",
        "source": "IOC World Bird List / Clements Checklist, 2024",
    },
    {
        "prompt": "1 公升的水大約含有多少個水分子？",
        "answer": 3.34e25, "unit": "個", "category": "微觀世界",
        "explanation": "1000 克 ÷ 18 克/莫耳 × 6.022×10²³ ≈ 3.34×10²⁵ 個。一杯水裡的分子數，比全宇宙的星星還多得多。",
        "source": "亞佛加厥常數計算",
    },
    {
        "prompt": "馬里亞納海溝最深處（挑戰者深淵）大約有多深，以公尺計？",
        "answer": 10_935, "unit": "公尺", "category": "地球尺度",
        "explanation": "約 10,935 公尺，比聖母峰還高出 2 公里多。若把聖母峰丟進去，峰頂離海面仍有 2 公里深。",
        "source": "海洋測深",
    },
    {
        "prompt": "地球的年齡大約是多少年？",
        "answer": 4.54e9, "unit": "年", "category": "天文距離",
        "explanation": "約 45.4 億年，由隕石與地球岩石的鉛同位素定年得出，誤差約 1%。",
        "source": "放射性定年",
    },
    {
        "prompt": "撒哈拉沙漠的面積大約是多少平方公里？",
        "answer": 9_200_000, "unit": "平方公里", "category": "地球尺度",
        "explanation": "約 920 萬平方公里，和整個美國面積相當，約是台灣（3.6 萬）的 250 倍。",
        "source": "地理統計",
    },
    {
        "prompt": "從台北到東京的直線距離大約是多少公里？",
        "answer": 2100, "unit": "公里", "category": "生活密度",
        "explanation": "直線約 2,100 公里，搭飛機約 3 小時。比直覺想的遠——東京其實沒那麼近。",
        "source": "大圓距離計算",
    },
    {
        "prompt": "一隻家貓平均一天大約睡多少小時？",
        "answer": 15, "unit": "小時", "category": "自然萬象",
        "explanation": "平均 12–16 小時，幼貓與老貓更多。貓是『兼職掠食者』，沒事就省電待機。",
        "source": "動物行為學",
    },
]


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """首次執行自動建立資料庫並灌入題庫。"""
    conn = get_db()
    c = conn.cursor()
    c.execute(
        """CREATE TABLE IF NOT EXISTS questions(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            prompt TEXT, answer REAL, unit TEXT, category TEXT,
            explanation TEXT, source TEXT)"""
    )
    c.execute(
        """CREATE TABLE IF NOT EXISTS attempts(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            question_id INTEGER, guess REAL, answer REAL,
            log_error REAL, within_order INTEGER, created_at TEXT)"""
    )
    c.execute("SELECT COUNT(*) AS n FROM questions")
    if c.fetchone()["n"] == 0:
        for q in QUESTIONS:
            c.execute(
                "INSERT INTO questions(prompt,answer,unit,category,explanation,source)"
                " VALUES(?,?,?,?,?,?)",
                (q["prompt"], q["answer"], q["unit"], q["category"],
                 q["explanation"], q["source"]),
            )
    conn.commit()
    conn.close()


def verdict_for(ratio):
    """依『差幾倍』回傳評語。費米估算的金標準是『落在一個數量級內』。"""
    if ratio < 2:
        return "神準", "🎯"
    if ratio < 4:
        return "非常接近", "✨"
    if ratio < 10:
        return "同個數量級，漂亮", "👍"
    if ratio < 100:
        return "差了一兩個數量級", "🤔"
    return "差距不小，再想想", "🌀"


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/question")
def api_question():
    exclude = request.args.get("exclude", type=int)
    conn = get_db()
    rows = conn.execute(
        "SELECT id, prompt, unit, category FROM questions").fetchall()
    conn.close()
    total = len(rows)
    candidates = [r for r in rows if r["id"] != exclude] or rows
    q = random.choice(candidates)
    return jsonify({
        "id": q["id"], "prompt": q["prompt"],
        "unit": q["unit"], "category": q["category"], "total": total,
    })


@app.route("/api/guess", methods=["POST"])
def api_guess():
    data = request.get_json(force=True, silent=True) or {}
    try:
        qid = int(data["id"])
        guess = float(data["guess"])
    except (KeyError, TypeError, ValueError):
        return jsonify({"error": "參數錯誤"}), 400

    conn = get_db()
    q = conn.execute("SELECT * FROM questions WHERE id=?", (qid,)).fetchone()
    if not q:
        conn.close()
        return jsonify({"error": "找不到題目"}), 404

    answer = q["answer"]
    if guess <= 0:
        guess = 1e-12  # 防呆，避免 log 爆掉

    ratio = max(guess / answer, answer / guess)
    log_error = abs(math.log10(guess / answer))
    within_order = 1 if ratio < 10 else 0
    verdict, emoji = verdict_for(ratio)

    conn.execute(
        "INSERT INTO attempts(question_id,guess,answer,log_error,within_order,created_at)"
        " VALUES(?,?,?,?,?,?)",
        (qid, guess, answer, log_error, within_order,
         datetime.now().isoformat(timespec="seconds")),
    )
    conn.commit()
    conn.close()

    return jsonify({
        "id": qid, "prompt": q["prompt"], "unit": q["unit"],
        "answer": answer, "guess": guess,
        "ratio": ratio, "orders": round(log_error, 2),
        "within_order": within_order, "verdict": verdict, "emoji": emoji,
        "explanation": q["explanation"], "source": q["source"],
    })


@app.route("/api/stats")
def api_stats():
    conn = get_db()
    rows = conn.execute(
        "SELECT a.*, q.prompt, q.unit FROM attempts a "
        "LEFT JOIN questions q ON a.question_id=q.id ORDER BY a.id"
    ).fetchall()
    conn.close()

    total = len(rows)
    if total == 0:
        return jsonify({
            "total": 0, "hit_rate": 0, "avg_log_error": 0,
            "current_streak": 0, "best_streak": 0, "recent": [],
        })

    hits = sum(r["within_order"] for r in rows)
    hit_rate = round(100 * hits / total)
    avg_log_error = round(sum(r["log_error"] for r in rows) / total, 2)

    best = cur = 0
    for r in rows:
        if r["within_order"]:
            cur += 1
            best = max(best, cur)
        else:
            cur = 0
    current_streak = cur

    recent = [{
        "prompt": r["prompt"], "guess": r["guess"], "answer": r["answer"],
        "within_order": r["within_order"], "log_error": round(r["log_error"], 2),
        "unit": r["unit"],
    } for r in rows[-10:]][::-1]

    return jsonify({
        "total": total, "hit_rate": hit_rate, "avg_log_error": avg_log_error,
        "current_streak": current_streak, "best_streak": best, "recent": recent,
    })


@app.route("/api/reset", methods=["POST"])
def api_reset():
    conn = get_db()
    conn.execute("DELETE FROM attempts")
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


# 在 import 時就確保資料庫就緒（python app.py 或 flask run 皆適用）
init_db()

if __name__ == "__main__":
    print("費米的餐巾紙已啟動 → 請打開 http://localhost:5000")
    app.run(host="127.0.0.1", port=5000, debug=False)
