/* ==========================================================================
 * 詞素資料庫 —— 一個詞根打開一片字
 * 自行整理，不對應任何一本具名詞典或已發表的詞表（依據見同資料夾 說明.md）。
 * 透明度 t：2＝拆開就懂　1＝要轉個彎　0＝拆得出來，但意思跑掉了
 * 成員字格式：[字, t, 中文意思, 可選的註解]
 * ========================================================================== */
var MORPH_DB = (function () {

  /* ---------- 字首（含同化變體） ---------- */
  var prefixes = [
    { f: ["in", "im", "il", "ir"], m: "向內／不", g: "碰到 p/b/m 變 im，碰到 l 變 il，碰到 r 變 ir", ex: "impossible、illegal、irregular" },
    { f: ["un"], m: "不、相反", g: "英語本土的否定字首" },
    { f: ["non"], m: "非", g: "" },
    { f: ["dis", "dif", "di"], m: "分開／否定", g: "碰到 f 變 dif", ex: "different" },
    { f: ["re"], m: "再一次／往回", g: "" },
    { f: ["de"], m: "向下／離開／去除", g: "" },
    { f: ["ex", "ef", "ec", "e"], m: "向外", g: "碰到 f 變 ef；碰到子音常縮成 e", ex: "effect、educate" },
    { f: ["pre"], m: "在……之前", g: "" },
    { f: ["pro"], m: "向前／代替", g: "" },
    { f: ["post"], m: "在……之後", g: "" },
    { f: ["fore"], m: "在前、預先", g: "" },
    { f: ["sub", "suc", "suf", "sug", "sup", "sus", "su"], m: "在下面", g: "後面接 c/f/g/p 就跟著同化，接 s 開頭的詞根縮成 su", ex: "success、suffer、support、suspect" },
    { f: ["super", "supra", "sur"], m: "在上面、超過", g: "" },
    { f: ["under"], m: "在下、不足", g: "" },
    { f: ["over"], m: "在上、過度", g: "" },
    { f: ["out"], m: "向外、超出", g: "" },
    { f: ["trans", "tran", "tra", "extro"], m: "越過、轉到另一邊", g: "碰到 s 開頭的詞根會掉一個 s", ex: "transcript" },
    { f: ["inter", "intel"], m: "在……之間", g: "碰到 l 變 intel", ex: "intelligent" },
    { f: ["intra"], m: "在內部", g: "" },
    { f: ["intro"], m: "向內", g: "" },
    { f: ["con", "com", "col", "cor", "co"], m: "一起、共同", g: "碰到 l 變 col，碰到 r 變 cor，碰到母音縮成 co", ex: "collect、correct、cooperate" },
    { f: ["ad", "ac", "af", "ag", "al", "ap", "ar", "as", "at"], m: "朝向、去做", g: "幾乎完全跟著下一個子音走，是英文同化最兇的字首", ex: "accept、affect、aggression、assist、attract" },
    { f: ["ob", "oc", "of", "op"], m: "對著、擋著", g: "碰到 c/f/p 同化", ex: "occur、oppress" },
    { f: ["abs", "ab"], m: "離開", g: "碰到 t 常變 abs", ex: "abstract" },
    { f: ["an"], m: "沒有、無", g: "希臘系否定字首（拉丁系是 in-）", ex: "anonymous" },
    { f: ["pan"], m: "全部、遍及", g: "" },
    { f: ["pseudo", "pseud"], m: "假的", g: "" },
    { f: ["homo", "hom"], m: "相同", g: "" },
    { f: ["se"], m: "分開、獨自", g: "" },
    { f: ["per"], m: "徹底、穿過", g: "" },
    { f: ["peri"], m: "周圍", g: "" },
    { f: ["circum"], m: "繞一圈", g: "" },
    { f: ["contra", "contro", "counter"], m: "相反、對抗", g: "" },
    { f: ["anti", "ant"], m: "反對", g: "" },
    { f: ["auto"], m: "自己", g: "" },
    { f: ["bene"], m: "好、善", g: "" },
    { f: ["mal", "male"], m: "壞、惡", g: "" },
    { f: ["mono", "mon"], m: "一、單一", g: "" },
    { f: ["uni"], m: "一、單一", g: "拉丁來的「一」，希臘來的是 mono" },
    { f: ["bi"], m: "二", g: "" },
    { f: ["tri"], m: "三", g: "" },
    { f: ["multi"], m: "多", g: "" },
    { f: ["poly"], m: "多", g: "" },
    { f: ["omni"], m: "全部", g: "" },
    { f: ["semi", "hemi"], m: "一半", g: "" },
    { f: ["syn", "sym", "syl", "sys"], m: "一起", g: "碰到 p/b/m 變 sym，碰到 l 變 syl", ex: "symphony、syllable" },
    { f: ["epi"], m: "在上面、附加", g: "" },
    { f: ["hyper"], m: "過度、超", g: "" },
    { f: ["hypo"], m: "在下、不足", g: "" },
    { f: ["micro"], m: "極小", g: "" },
    { f: ["macro"], m: "巨大", g: "" },
    { f: ["mega"], m: "巨大", g: "" },
    { f: ["mis"], m: "錯誤地", g: "" },
    { f: ["tele"], m: "遠距離", g: "" },
    { f: ["retro"], m: "向後、回溯", g: "" },
    { f: ["dia"], m: "穿過、之間", g: "" },
    { f: ["para"], m: "旁邊、並列", g: "" },
    { f: ["apo"], m: "離開", g: "" },
    { f: ["cata"], m: "向下、完全", g: "" },
    { f: ["ana"], m: "回頭、向上", g: "" },
    { f: ["meta"], m: "改變、超越", g: "" },
    { f: ["endo"], m: "在內部", g: "" },
    { f: ["infra"], m: "在下層", g: "" },
    { f: ["en", "em"], m: "使進入、使成為", g: "碰到 p/b/m 變 em", ex: "empathy" }
  ];

  /* ---------- 字尾 ---------- */
  var suffixes = [
    { f: ["ation", "ition", "tion", "ion", "sion"], m: "……的行為或結果（名詞）", p: "名詞" },
    { f: ["ment", "iment"], m: "……的行為或成品（名詞）", p: "名詞" },
    { f: ["ance", "ence", "ancy", "ency"], m: "……的狀態（名詞）", p: "名詞" },
    { f: ["ity", "acity", "ty"], m: "……的性質（名詞）", p: "名詞" },
    { f: ["ness"], m: "……的性質（名詞）", p: "名詞" },
    { f: ["ator", "or", "er"], m: "做這件事的人或物", p: "名詞" },
    { f: ["ist"], m: "從事……的人", p: "名詞" },
    { f: ["ism"], m: "主義、現象", p: "名詞" },
    { f: ["ure", "ture"], m: "行為或其產物（名詞）", p: "名詞" },
    { f: ["age"], m: "行為、集合（名詞）", p: "名詞" },
    { f: ["acle", "icle", "cle"], m: "小東西、器具（名詞）", p: "名詞" },
    { f: ["itude"], m: "……的程度（名詞）", p: "名詞" },
    { f: ["ary", "itory", "ory", "uary", "ury"], m: "與……有關的（形容詞／場所）", p: "形／名" },
    { f: ["arium"], m: "……的場所", p: "名詞" },
    { f: ["ience", "ient"], m: "正在……的（狀態）", p: "形／名" },
    { f: ["ive", "ative", "itive"], m: "有……傾向的", p: "形容詞" },
    { f: ["ivity", "iveness"], m: "……的性質（名詞）", p: "名詞" },
    { f: ["ous", "ious", "eous", "uous", "acious"], m: "充滿……的", p: "形容詞" },
    { f: ["able", "ible"], m: "可以被……的", p: "形容詞" },
    { f: ["al", "ial", "ual", "ural"], m: "……的", p: "形容詞" },
    { f: ["ic", "ical", "etic", "tic", "istic"], m: "……的（希臘系）", p: "形容詞" },
    { f: ["ant", "ent"], m: "正在……的（形容詞／人）", p: "形／名" },
    { f: ["ile"], m: "易於……的", p: "形容詞" },
    { f: ["ful"], m: "充滿……的", p: "形容詞" },
    { f: ["less"], m: "沒有……的", p: "形容詞" },
    { f: ["ish"], m: "略帶……的", p: "形容詞" },
    { f: ["id"], m: "……的（狀態形容詞）", p: "形容詞" },
    { f: ["ate", "iate", "uate", "ulate"], m: "使……（動詞）", p: "動詞" },
    { f: ["ify", "fy"], m: "使……化（動詞）", p: "動詞" },
    { f: ["ize", "ise"], m: "使……化（動詞）", p: "動詞" },
    { f: ["en"], m: "使變成（動詞）", p: "動詞" },
    { f: ["ly"], m: "以……的方式（副詞）", p: "副詞" },
    { f: ["y"], m: "……的／……學", p: "形／名" },
    { f: ["ular", "ar"], m: "……的（形容詞）", p: "形容詞" },
    { f: ["ician", "ian", "an"], m: "……的人／……的", p: "形／名" },
    { f: ["ique", "ane", "ula"], m: "其他借自法語／拉丁的字尾", p: "名／形" },
    { f: ["ute"], m: "被……的（動詞／形容詞）", p: "動／形" },
    { f: ["ute", "it", "ite"], m: "被……的（過去分詞化）", p: "動／形" },
    { f: ["us", "ue", "el", "ice", "oid", "ix", "ain", "ace", "eme", "sis", "osis", "ia", "estrial", "imony", "acy"], m: "其他名詞化字尾", p: "名詞" },
    { f: ["s", "es"], m: "複數／第三人稱", p: "屈折" },
    { f: ["ed"], m: "過去、被動", p: "屈折" },
    { f: ["ing"], m: "進行、動名詞", p: "屈折" },
    { f: ["est"], m: "最……（最高級）", p: "屈折" }
  ];

  /* ---------- 拒拆名單：長得像可拆、其實不是（多為日耳曼語源或同形異源） ---------- */
  var blocked = ["absence", "absent", "accent", "accents", "accident", "accidental", "accidentally", "accidents", "accuracy", "accurate", "accurately", "addison", "approval", "approve", "approved", "approves", "argentina", "argentine", "capital", "capitalism", "capitalist", "capitals", "capitol", "captain", "captains", "carnival", "center", "centered", "centers", "centre", "centres", "clever", "coincidence", "combination", "combine", "combined", "combining", "congressman", "consecrate", "consecrated", "cover", "coverage", "covered", "covering", "covers", "crater", "craters", "curiosity", "curious", "curiously", "curtain", "curtains", "decent", "decently", "demise", "discography", "discover", "discovered", "discoveries", "discovers", "discovery", "ecological", "ecologist", "ecology", "edison", "emmanuel", "empress", "even", "evening", "evenings", "ever", "every", "everybody", "everyone", "everything", "everywhere", "finely", "finer", "finest", "finland", "finnish", "foreman", "forever", "former", "formerly", "formidable", "gentleman", "grammar", "grammy", "however", "human", "humans", "incidence", "incident", "incidental", "incidents", "indianapolis", "inevitable", "inevitably", "interval", "intervals", "invitation", "invitations", "invite", "invited", "invites", "inviting", "irrigate", "irrigation", "legs", "magnet", "magnetic", "magnetism", "magnus", "man", "manner", "manners", "mansion", "manuel", "many", "men", "metropolis", "metropolitan", "miss", "missed", "misses", "missing", "mortar", "never", "often", "parson", "path", "paths", "pathway", "permanent", "permanently", "person", "personal", "personalities", "personality", "personally", "personnel", "persons", "possess", "possessed", "possession", "possessions", "postage", "potter", "pottery", "precipitation", "presence", "present", "presentation", "presented", "presenting", "presently", "presents", "programme", "programmes", "proved", "proven", "recent", "recently", "recover", "recovered", "recovery", "regain", "regained", "register", "registered", "registers", "registration", "registry", "religion", "religions", "religious", "religiously", "represent", "representation", "representative", "representing", "represents", "secular", "secure", "secured", "securely", "securities", "security", "senate", "senator", "senators", "sentence", "sentences", "several", "severe", "severely", "severity", "sister", "sisters", "son", "sons", "sophia", "spiral", "spirals", "superman", "supplied", "supplies", "supply", "tens", "tenth", "terrible", "terribly", "terrific", "terrified", "terrify", "terrifying", "terror", "terrorism", "terrorist", "travis", "unanimous", "unanimously", "uncover", "undercover", "uneven", "venice", "venus", "vivian", "whatever", "whenever", "wherever", "woman", "women"];

  /* ---------- 詞根 ---------- */
  var roots = [
    { id: "spect", f: ["spect", "spec", "spic"], m: "看", src: "拉丁 specere（看）", members: [
      ["inspect", 2, "檢查", ""], ["inspector", 2, "檢查員", ""], ["inspection", 2, "檢查", ""],
      ["respect", 1, "尊敬", "「再看一眼」→ 看重"], ["spectator", 2, "觀眾", ""],
      ["prospect", 1, "前景", "「往前看」→ 展望"], ["suspect", 1, "懷疑", "「從下面偷看」"],
      ["spectacle", 2, "奇觀", ""], ["perspective", 1, "觀點", "「穿過去看」"],
      ["retrospect", 2, "回顧", ""], ["circumspect", 1, "謹慎的", "「環顧四周才動」"],
      ["introspection", 2, "內省", ""], ["conspicuous", 1, "顯眼的", "「大家一起看得到」"]
    ]},
    { id: "dict", f: ["dict", "dic"], m: "說", src: "拉丁 dicere（說）", members: [
      ["predict", 2, "預測", ""], ["dictate", 2, "口述、命令", ""], ["dictator", 2, "獨裁者", ""],
      ["contradict", 2, "反駁", ""], ["dictionary", 2, "字典", ""], ["edict", 2, "敕令", ""],
      ["indicate", 1, "指出", "「說進去」→ 指明"], ["benediction", 2, "祝福", ""],
      ["dedicate", 1, "奉獻", "「把話說定給某人」"], ["verdict", 2, "判決", "ver（真）＋dict（說）"]
    ]},
    { id: "port", f: ["port"], m: "搬運", src: "拉丁 portare（帶）", members: [
      ["import", 2, "進口", ""], ["export", 2, "出口", ""], ["transport", 2, "運輸", ""],
      ["portable", 2, "可攜帶的", ""], ["report", 1, "報告", "「把消息搬回來」"],
      ["support", 1, "支持", "「從下面撐住」"], ["deport", 2, "驅逐出境", ""], ["porter", 2, "搬運工", ""]
    ]},
    { id: "duc", f: ["duct", "duc"], m: "引導", src: "拉丁 ducere（引導）", members: [
      ["introduce", 1, "介紹", "「把人引進來」"], ["conduct", 2, "引導、指揮", ""],
      ["produce", 1, "生產", "「向前引出來」"], ["reduce", 1, "減少", "「引回去」"],
      ["educate", 1, "教育", "「把裡面的東西引出來」"], ["deduct", 2, "扣除", ""],
      ["abduct", 2, "綁架", ""], ["induce", 2, "誘發", ""], ["conductor", 2, "指揮、導體", ""]
    ]},
    { id: "fer", f: ["fer"], m: "帶來", src: "拉丁 ferre（帶）", members: [
      ["transfer", 2, "轉移", ""], ["refer", 1, "參照", "「把注意力帶回去」"],
      ["prefer", 1, "偏好", "「帶到前面」"], ["differ", 1, "不同", "「分開帶走」"],
      ["offer", 1, "提供", "「帶到面前」"], ["suffer", 0, "受苦", "「從下面承受」——現代意思幾乎看不出詞根"],
      ["infer", 1, "推論", "「帶進來」"], ["conference", 2, "會議", ""], ["circumference", 2, "圓周", ""]
    ]},
    { id: "mit", f: ["miss", "mit"], m: "送出", src: "拉丁 mittere（送）", members: [
      ["submit", 1, "提交", "「送到下面」"], ["transmit", 2, "傳送", ""],
      ["permit", 1, "允許", "「讓它整個通過」"], ["admit", 1, "承認、准入", "「讓它送進來」→ 放進門／認了"],
      ["emit", 2, "發出", ""], ["dismiss", 2, "解散、駁回", ""], ["mission", 2, "任務", ""],
      ["missile", 2, "飛彈", ""], ["commit", 1, "託付、犯下", "「一起送出去」→ 交付；犯罪那個意思是後來長出來的"], ["submission", 2, "提交、順從", ""]
    ]},
    { id: "scrib", f: ["script", "scrib"], m: "寫", src: "拉丁 scribere（寫）", members: [
      ["describe", 1, "描述", "「把它寫下來」"], ["prescribe", 2, "開處方", ""],
      ["subscribe", 1, "訂閱", "「在下面簽名」"], ["inscription", 2, "銘文", ""],
      ["manuscript", 2, "手稿", "manu（手）＋script（寫）"], ["transcript", 2, "謄本", ""],
      ["scripture", 2, "經文", ""], ["postscript", 2, "附註", ""], ["transcribe", 2, "轉寫、聽打", ""]
    ]},
    { id: "vid", f: ["vis", "vid"], m: "看見", src: "拉丁 videre（看見）", members: [
      ["evident", 2, "明顯的", ""], ["provide", 1, "提供", "「事先看好」→ 預備"],
      ["vision", 2, "視力、願景", ""], ["visible", 2, "看得見的", ""], ["invisible", 2, "看不見的", ""],
      ["revise", 1, "修訂", "「再看一遍」"], ["supervise", 2, "監督", ""],
      ["television", 2, "電視", "tele（遠）＋vis（看）"], ["visual", 2, "視覺的", ""]
    ]},
    { id: "aud", f: ["aud"], m: "聽", src: "拉丁 audire（聽）", members: [
      ["audience", 2, "聽眾", ""], ["audible", 2, "聽得見的", ""], ["inaudible", 2, "聽不見的", ""],
      ["audition", 2, "試音", ""], ["auditory", 2, "聽覺的", ""]
    ]},
    { id: "tract", f: ["tract"], m: "拉", src: "拉丁 trahere（拉）", members: [
      ["attract", 2, "吸引", ""], ["subtract", 2, "減去", ""], ["extract", 2, "萃取", ""],
      ["contract", 1, "合約、收縮", "「一起拉緊」"], ["distract", 2, "使分心", ""],
      ["abstract", 1, "抽象的", "「抽離出來的」"], ["tractor", 2, "曳引機", ""],
      ["retract", 2, "收回", ""], ["traction", 2, "牽引力", ""]
    ]},
    { id: "ject", f: ["ject"], m: "丟", src: "拉丁 jacere（投）", members: [
      ["inject", 2, "注射", ""], ["reject", 1, "拒絕", "「丟回去」"],
      ["project", 1, "計畫、投射", "「向前丟出去」"], ["eject", 2, "彈出", ""],
      ["object", 0, "物體、反對", "「丟在你面前的東西」——現代兩個意思都跟「丟」脫節"],
      ["subject", 0, "主題、科目", "「被丟到下面的」→ 臣屬 → 題目"],
      ["interject", 2, "插話", ""], ["injection", 2, "注射", ""], ["trajectory", 2, "軌跡", ""]
    ]},
    { id: "pos", f: ["posit", "pos", "pon"], m: "放置", src: "拉丁 ponere（放）", members: [
      ["compose", 2, "組成", ""], ["expose", 2, "暴露", ""], ["impose", 1, "強加", "「放到別人身上」"],
      ["deposit", 2, "存放", ""], ["opponent", 2, "對手", "「放在對面的人」"],
      ["postpone", 2, "延後", ""], ["proposal", 2, "提案", ""], ["position", 2, "位置", ""],
      ["component", 2, "零件", ""], ["dispose", 1, "處置", "「分開放好」"]
    ]},
    { id: "ced", f: ["ceed", "cess", "ced"], m: "走、讓", src: "拉丁 cedere（走、讓步）", members: [
      ["proceed", 2, "進行", ""], ["precede", 2, "先於", ""], ["exceed", 2, "超過", ""],
      ["recede", 2, "後退", ""], ["access", 2, "接近、存取", ""], ["process", 2, "過程", ""],
      ["succeed", 1, "成功、繼任", "「跟在後面走上去」"], ["concede", 1, "讓步", "「一起往後走一步」"], ["recession", 2, "衰退", ""]
    ]},
    { id: "cap", f: ["ceiv", "cept", "cip", "cap"], m: "拿、抓", src: "拉丁 capere（拿）", members: [
      ["accept", 2, "接受", ""], ["except", 1, "除外", "「拿出去」"], ["capture", 2, "捕捉", ""],
      ["receive", 2, "收到", ""], ["concept", 1, "概念", "「一起抓住的東西」"],
      ["intercept", 2, "攔截", ""], ["recipient", 2, "接受者", ""], ["capable", 2, "有能力的", ""],
      ["deceive", 1, "欺騙", "「從人手上拿走」"], ["participate", 2, "參與", "part（部分）＋cip（拿）"]
    ]},
    { id: "fac", f: ["fact", "fect", "fic"], m: "做、製造", src: "拉丁 facere（做）", members: [
      ["factory", 2, "工廠", ""], ["manufacture", 2, "製造", "manu（手）＋fact（做）"],
      ["affect", 1, "影響", "「對它做點什麼」"], ["effect", 1, "效果", "「做出來的結果」"],
      ["perfect", 1, "完美的", "「徹底做完的」"], ["defect", 1, "缺陷", "「做壞掉的地方」"],
      ["fiction", 1, "小說", "「被做出來的東西」"], ["efficient", 2, "有效率的", ""],
      ["factor", 2, "因素", ""], ["beneficial", 2, "有益的", ""]
    ]},
    { id: "struct", f: ["struct", "stru"], m: "建造、堆疊", src: "拉丁 struere（堆）", members: [
      ["construct", 2, "建造", ""], ["instruct", 1, "教導", "「在心裡蓋起來」"],
      ["destruction", 2, "破壞", ""], ["structure", 2, "結構", ""], ["obstruct", 2, "阻礙", ""],
      ["instrument", 1, "工具、樂器", "「用來蓋東西的」"], ["reconstruct", 2, "重建", ""]
    ]},
    { id: "gress", f: ["gress", "grad", "gred"], m: "走、步", src: "拉丁 gradi（走）", members: [
      ["progress", 2, "前進、進步", ""], ["aggressive", 1, "侵略的", "「一直往人身上走」"],
      ["congress", 1, "國會", "「大家走到一起」"], ["regress", 2, "退步", ""],
      ["digress", 2, "離題", ""], ["gradual", 2, "逐漸的", ""], ["degrade", 1, "降級", "「往下走一階」"],
      ["ingredient", 0, "成分", "「走進去的東西」——現代意思完全看不出腳步"], ["transgress", 2, "越界", ""]
    ]},
    { id: "flu", f: ["flux", "flu"], m: "流", src: "拉丁 fluere（流）", members: [
      ["fluid", 2, "流體", ""], ["fluent", 2, "流利的", ""],
      ["influence", 1, "影響", "「流進來的東西」——原指星象流下來的力量"],
      ["affluent", 1, "富裕的", "「一直流過來」"], ["influx", 2, "湧入", ""],
      ["superfluous", 1, "多餘的", "「滿出來流掉的」"]
    ]},
    { id: "rupt", f: ["rupt"], m: "破裂", src: "拉丁 rumpere（破）", members: [
      ["interrupt", 2, "打斷", ""], ["erupt", 2, "爆發", ""],
      ["corrupt", 1, "腐敗的", "「整個一起壞掉」"], ["disrupt", 2, "擾亂", ""],
      ["abrupt", 1, "突然的", "「斷掉似的」"], ["rupture", 2, "破裂", ""], ["eruption", 2, "噴發", ""]
    ]},
    { id: "sect", f: ["sect", "sec"], m: "切", src: "拉丁 secare（切）", members: [
      ["section", 2, "部分、切面", ""], ["insect", 0, "昆蟲", "「身上被切成幾段的」——沒人這樣想過昆蟲"],
      ["intersect", 2, "交叉", ""], ["dissect", 2, "解剖", ""], ["bisect", 2, "二等分", ""], ["sector", 2, "部門、扇形", ""]
    ]},
    { id: "ven", f: ["vent", "ven"], m: "來", src: "拉丁 venire（來）", members: [
      ["convene", 2, "召集", ""], ["invent", 1, "發明", "「碰上、找到」"],
      ["prevent", 1, "預防", "「先一步來擋住」"], ["event", 1, "事件", "「發生出來的事」"],
      ["adventure", 1, "冒險", "「即將到來的事」"], ["convention", 2, "大會、慣例", ""], ["intervene", 2, "介入", ""]
    ]},
    { id: "voc", f: ["voc", "vok"], m: "叫、聲音", src: "拉丁 vocare（呼叫）", members: [
      ["vocal", 2, "聲音的", ""], ["advocate", 1, "倡議", "「為它發聲」"],
      ["provoke", 1, "挑釁", "「把人叫出來」"], ["invoke", 2, "喚起、援引", ""],
      ["revoke", 2, "撤銷", "「把話叫回來」"], ["evoke", 2, "喚起", ""],
      ["vocation", 1, "天職", "「被召喚去做的事」"]
    ]},
    { id: "tact", f: ["tact", "tang", "tag"], m: "觸碰", src: "拉丁 tangere（碰）", members: [
      ["contact", 2, "接觸", ""], ["tangible", 2, "摸得到的、實在的", ""],
      ["intact", 1, "完好的", "「沒被碰過的」"], ["tactile", 2, "觸覺的", ""], ["contagious", 1, "傳染的", "「碰到就中」"]
    ]},
    { id: "cred", f: ["cred"], m: "相信", src: "拉丁 credere（相信）", members: [
      ["credit", 2, "信用", ""], ["credible", 2, "可信的", ""], ["incredible", 2, "難以置信的", ""],
      ["credential", 2, "憑證", ""], ["discredit", 2, "使人不信", ""]
    ]},
    { id: "leg", f: ["lect", "lig", "leg"], m: "選、讀、法", src: "拉丁 legere（挑選、讀）／lex（法）", members: [
      ["elect", 2, "選舉", ""], ["select", 2, "挑選", ""], ["collect", 2, "收集", ""],
      ["lecture", 1, "講課", "「讀給大家聽」"], ["intelligent", 1, "聰明的", "「能在之間挑出來」"],
      ["eligible", 2, "有資格被選的", ""], ["legible", 2, "字跡清楚可讀的", ""],
      ["legal", 2, "法律的", ""], ["illegal", 2, "非法的", ""], ["delegate", 1, "代表、委派", "「挑出來派去」"]
    ]},
    { id: "reg", f: ["rect", "reg", "rig"], m: "統治、拉直", src: "拉丁 regere（統治、導正）", members: [
      ["regular", 2, "規律的", ""], ["irregular", 2, "不規則的", ""], ["regulate", 2, "規範", ""],
      ["direct", 2, "指引、直接的", ""], ["correct", 1, "正確的", "「一起拉直」"],
      ["erect", 2, "豎立", ""], ["rectify", 2, "改正", ""], ["region", 1, "區域", "「被統治的一塊」"],
      ["corrective", 2, "矯正的", ""]
    ]},
    { id: "cur", f: ["curs", "curr", "cur"], m: "跑、流動", src: "拉丁 currere（跑）", members: [
      ["current", 1, "水流、當前的", "「正在跑的」"], ["occur", 1, "發生", "「跑到面前來」"],
      ["recur", 2, "再度發生", ""], ["excursion", 2, "遠足", ""], ["concur", 1, "意見一致", "「一起跑」"],
      ["incur", 1, "招致", "「跑進去撞上」"], ["cursor", 2, "游標", ""], ["precursor", 2, "先驅", ""]
    ]},
    { id: "pel", f: ["puls", "pel"], m: "推、打", src: "拉丁 pellere（驅趕）", members: [
      ["expel", 2, "驅逐", ""], ["repel", 2, "排斥", ""], ["compel", 1, "強迫", "「一起推著你走」"],
      ["propel", 2, "推進", ""], ["impulse", 1, "衝動", "「往裡面推的一下」"],
      ["pulse", 2, "脈搏", ""], ["expulsion", 2, "開除", ""], ["dispel", 2, "驅散", ""]
    ]},
    { id: "tend", f: ["tens", "tent", "tend"], m: "伸展、拉緊", src: "拉丁 tendere（伸）", members: [
      ["extend", 2, "延伸", ""], ["intend", 1, "打算", "「把心伸向那裡」"],
      ["pretend", 0, "假裝", "「在前面張開一塊布」——現代意思跟「伸」沒關係了"],
      ["tension", 2, "張力", ""], ["attend", 1, "出席、注意", "「把注意力伸過去」"],
      ["extensive", 2, "廣泛的", ""], ["intense", 2, "強烈的", ""], ["contend", 1, "爭辯", "「互相拉扯」"]
    ]},
    { id: "spir", f: ["spir"], m: "呼吸", src: "拉丁 spirare（呼吸）", members: [
      ["inspire", 1, "啟發", "「把氣吹進去」"], ["inspiration", 2, "靈感", "「被吹進來的東西」"],
      ["respiration", 2, "呼吸作用", ""], ["conspire", 0, "密謀", "「湊在一起呼吸」——字面完全猜不到"],
      ["perspire", 2, "流汗", "「氣穿過皮膚」"], ["spirit", 1, "精神", "「氣」"]
    ]},
    { id: "sens", f: ["sens", "sent"], m: "感覺", src: "拉丁 sentire（感覺）", members: [
      ["sensation", 2, "感覺", ""], ["sensitive", 2, "敏感的", ""],
      ["consent", 1, "同意", "「一起有同樣的感覺」"], ["dissent", 2, "異議", ""],
      ["resent", 0, "怨恨", "「一再回味那個感覺」——現代只剩負面"], ["sentiment", 2, "情感", ""],
      ["nonsense", 2, "胡說", ""], ["sensible", 2, "明智的", ""]
    ]},
    { id: "mot", f: ["mot", "mov", "mob"], m: "移動", src: "拉丁 movere（移動）", members: [
      ["motion", 2, "運動", ""], ["promote", 1, "升遷、推廣", "「往前移」"],
      ["remote", 1, "遙遠的", "「被移開的」"], ["emotion", 1, "情緒", "「往外動的東西」"],
      ["motor", 2, "馬達", ""], ["remove", 2, "移除", ""], ["mobile", 2, "可移動的", ""],
      ["motive", 2, "動機", ""], ["demote", 2, "降職", ""]
    ]},
    { id: "nov", f: ["nov"], m: "新", src: "拉丁 novus（新）", members: [
      ["novel", 1, "小說、新奇的", "「新東西」→ 新故事"], ["innovate", 2, "創新", ""],
      ["renovate", 2, "翻新", ""], ["novice", 2, "新手", ""], ["novelty", 2, "新奇", ""], ["innovation", 2, "創新", ""]
    ]},
    { id: "gen", f: ["gener", "gen"], m: "生、種", src: "拉丁 genus／gignere（生）", members: [
      ["generate", 2, "產生", ""], ["generation", 2, "世代", ""], ["genetic", 2, "基因的", ""],
      ["gene", 2, "基因", ""], ["general", 1, "一般的、將軍", "「整個種類的」"],
      ["degenerate", 2, "退化", ""], ["regenerate", 2, "再生", ""]
    ]},
    { id: "bio", f: ["bio"], m: "生命", src: "希臘 bios（生命）", members: [
      ["biology", 2, "生物學", ""], ["biography", 2, "傳記", "「寫下一個人的生命」"],
      ["antibiotic", 2, "抗生素", "「對抗生命（細菌）的」"], ["symbiosis", 2, "共生", ""], ["biosphere", 2, "生物圈", ""]
    ]},
    { id: "graph", f: ["graph", "gram"], m: "寫、畫", src: "希臘 graphein（寫）", members: [
      ["photograph", 2, "照片", "phot（光）＋graph（畫）"], ["autograph", 2, "親筆簽名", ""],
      ["telegram", 2, "電報", ""], ["diagram", 2, "圖表", ""], ["paragraph", 2, "段落", ""],
      ["graphic", 2, "圖像的", ""], ["program", 1, "節目、程式", "「事先寫好的東西」"]
    ]},
    { id: "log", f: ["logue", "log"], m: "話語、道理、學問", src: "希臘 logos（話、理）", members: [
      ["dialogue", 2, "對話", ""], ["monologue", 2, "獨白", ""], ["logic", 2, "邏輯", ""],
      ["apology", 1, "道歉", "「說一段話把自己撇開」"], ["catalogue", 2, "目錄", ""],
      ["prologue", 2, "序幕", ""], ["epilogue", 2, "尾聲", ""]
    ]},
    { id: "phon", f: ["phon"], m: "聲音", src: "希臘 phone（聲音）", members: [
      ["telephone", 2, "電話", ""], ["symphony", 2, "交響樂", "「一起發聲」"],
      ["microphone", 2, "麥克風", ""], ["phonetic", 2, "語音的", ""], ["megaphone", 2, "大聲公", ""]
    ]},
    { id: "phot", f: ["phot"], m: "光", src: "希臘 phos／photos（光）", members: [
      ["photograph", 2, "照片", ""], ["photographer", 2, "攝影師", ""], ["photographic", 2, "攝影的", ""],
      ["photogenic", 2, "上相的", "「光生出來的」"], ["photometer", 2, "光度計", ""]
    ]},
    { id: "therm", f: ["therm"], m: "熱", src: "希臘 therme（熱）", members: [
      ["thermometer", 2, "溫度計", ""], ["thermal", 2, "熱的", ""], ["thermostat", 2, "恆溫器", "「讓熱站住」"],
      ["hypothermia", 2, "體溫過低", ""], ["thermodynamic", 2, "熱力學的", ""]
    ]},
    { id: "chron", f: ["chron"], m: "時間", src: "希臘 chronos（時間）", members: [
      ["chronic", 2, "慢性的", "「跟時間耗的」"], ["chronology", 2, "年表", ""],
      ["synchronize", 2, "同步", "「時間對在一起」"], ["anachronism", 2, "時代錯置", ""],
      ["chronicle", 2, "編年史", ""], ["chronometer", 2, "精密計時器", ""]
    ]},
    { id: "path", f: ["path"], m: "感受、痛苦、病", src: "希臘 pathos（感受、受苦）", members: [
      ["sympathy", 2, "同情", "「一起感受」"], ["empathy", 2, "同理心", "「感受進去」"],
      ["pathology", 2, "病理學", ""], ["pathetic", 1, "可憐的、糟糕的", "「引人感受的」→ 現代偏貶義"],
      ["telepathy", 2, "心電感應", ""], ["psychopath", 2, "心理病態者", ""]
    ]},
    { id: "psych", f: ["psych"], m: "心靈", src: "希臘 psyche（靈魂）", members: [
      ["psychology", 2, "心理學", ""], ["psychic", 2, "通靈的", ""], ["psychopath", 2, "心理病態者", ""],
      ["psychological", 2, "心理的", ""], ["psychometric", 2, "心理測量的", ""]
    ]},
    { id: "morph", f: ["morph"], m: "形狀", src: "希臘 morphe（形）", members: [
      ["morphology", 2, "構詞學、形態學", ""], ["morpheme", 2, "詞素", ""],
      ["metamorphosis", 2, "變態、蛻變", "「形狀改變」"], ["polymorphic", 2, "多型的", ""],
      ["anthropomorphic", 2, "擬人化的", ""]
    ]},
    { id: "anthrop", f: ["anthrop"], m: "人", src: "希臘 anthropos（人）", members: [
      ["anthropology", 2, "人類學", ""], ["anthropomorphic", 2, "擬人化的", ""],
      ["philanthropy", 2, "慈善", "「愛人」"], ["misanthrope", 2, "厭世者", "「討厭人的人」"],
      ["anthropocentric", 2, "以人為中心的", ""]
    ]},
    { id: "phil", f: ["phil"], m: "愛、喜好", src: "希臘 philein（愛）", members: [
      ["philosophy", 2, "哲學", "「愛智慧」"], ["philosopher", 2, "哲學家", ""],
      ["philosophical", 2, "哲學的", ""], ["philanthropy", 2, "慈善", ""], ["philanthropist", 2, "慈善家", ""]
    ]},
    { id: "soph", f: ["soph"], m: "智慧", src: "希臘 sophia（智慧）", members: [
      ["philosophy", 2, "哲學", ""], ["philosopher", 2, "哲學家", ""], ["philosophical", 2, "哲學的", ""],
      ["sophist", 2, "詭辯家", ""], ["sophism", 2, "詭辯", ""]
    ]},
    { id: "meter", f: ["meter", "metr"], m: "測量", src: "希臘 metron（尺度）", members: [
      ["thermometer", 2, "溫度計", ""], ["chronometer", 2, "計時器", ""],
      ["symmetry", 2, "對稱", "「量起來一樣」"], ["geometry", 2, "幾何", "「量地」"],
      ["diameter", 2, "直徑", "「量穿過去」"], ["perimeter", 2, "周長", ""], ["metric", 2, "度量的", ""]
    ]},
    { id: "scop", f: ["scope", "scop"], m: "看、觀察", src: "希臘 skopein（看）", members: [
      ["microscope", 2, "顯微鏡", ""], ["telescope", 2, "望遠鏡", ""], ["periscope", 2, "潛望鏡", ""],
      ["endoscope", 2, "內視鏡", ""], ["scope", 1, "範圍", "「看得到的範圍」"]
    ]},
    { id: "geo", f: ["geo"], m: "地球、土地", src: "希臘 ge（大地）", members: [
      ["geography", 2, "地理", "「畫下大地」"], ["geology", 2, "地質學", ""],
      ["geometry", 2, "幾何", ""], ["geothermal", 2, "地熱的", ""], ["geopolitical", 2, "地緣政治的", ""]
    ]},
    { id: "polit", f: ["polit", "polis"], m: "城邦、政治", src: "希臘 polis（城邦）", members: [
      ["political", 2, "政治的", ""], ["politics", 2, "政治", ""], ["politician", 2, "政治人物", ""],
      ["geopolitical", 2, "地緣政治的", ""], ["politically", 2, "在政治上", ""]
    ]},
    { id: "hydr", f: ["hydr"], m: "水", src: "希臘 hydor（水）", members: [
      ["hydrogen", 2, "氫", "「生出水的東西」"], ["dehydrate", 2, "脫水", ""],
      ["hydration", 2, "補水", ""], ["hydrology", 2, "水文學", ""], ["hydrate", 2, "水合、補水", ""]
    ]},
    { id: "spher", f: ["spher"], m: "球", src: "希臘 sphaira（球）", members: [
      ["sphere", 2, "球體", ""], ["hemisphere", 2, "半球", ""], ["biosphere", 2, "生物圈", ""],
      ["spherical", 2, "球形的", ""], ["spheroid", 2, "類球體", ""]
    ]},
    { id: "dynam", f: ["dynam"], m: "力量", src: "希臘 dynamis（力）", members: [
      ["dynamic", 2, "動態的", ""], ["dynamite", 2, "炸藥", ""], ["thermodynamic", 2, "熱力學的", ""],
      ["dynamism", 2, "活力", ""], ["dynamics", 2, "動力學", ""]
    ]},
    { id: "centr", f: ["centr"], m: "中心", src: "希臘 kentron（中心）", members: [
      ["central", 2, "中央的", ""], ["concentrate", 2, "集中", "「一起往中心」"],
      ["eccentric", 1, "古怪的", "「離開中心的」"], ["anthropocentric", 2, "以人為中心的", ""],
      ["centralize", 2, "集中化", ""]
    ]},
    { id: "anim", f: ["anim"], m: "生命、心神", src: "拉丁 anima（氣息、靈魂）", members: [
      ["animal", 1, "動物", "「有氣息的東西」"], ["animate", 2, "使有生命、動畫化", ""],
      ["animation", 2, "動畫", ""], ["inanimate", 2, "無生命的", ""],
      ["magnanimous", 2, "寬宏大量的", "magn（大）＋anim（心）"]
    ]},
    { id: "corp", f: ["corpor", "corps", "corp"], m: "身體", src: "拉丁 corpus（身體）", members: [
      ["corporation", 1, "公司", "「被當成一個身體的組織」"], ["incorporate", 2, "併入、法人化", ""],
      ["corporal", 2, "肉體的", ""], ["corporate", 2, "公司的", ""], ["corpse", 2, "屍體", ""]
    ]},
    { id: "man", f: ["manu", "man"], m: "手", src: "拉丁 manus（手）", members: [
      ["manual", 2, "手動的、手冊", ""], ["manufacture", 1, "製造", "「用手做」——工業革命後意思反過來了"],
      ["manuscript", 2, "手稿", ""], ["manage", 1, "管理", "「用手駕馭（馬）」"], ["manacle", 2, "手銬", ""]
    ]},
    { id: "ped", f: ["ped"], m: "腳", src: "拉丁 pes／pedis（腳）", members: [
      ["pedal", 2, "踏板", ""], ["impede", 1, "阻礙", "「絆住腳」"], ["expedite", 1, "加快", "「把腳解出來」"],
      ["centipede", 2, "蜈蚣", "「一百隻腳」"], ["biped", 2, "兩足動物", ""]
    ]},
    { id: "cent", f: ["cent"], m: "一百", src: "拉丁 centum（一百）", members: [
      ["century", 2, "世紀", ""], ["percent", 2, "百分比", ""], ["centipede", 2, "蜈蚣", ""],
      ["centimeter", 2, "公分", ""], ["centigrade", 2, "攝氏", "「一百階」"]
    ]},
    { id: "viv", f: ["viv", "vit"], m: "活、生命", src: "拉丁 vivere（活）", members: [
      ["vital", 2, "生命的、關鍵的", ""], ["survive", 1, "存活", "「活過去」"],
      ["revive", 2, "復活", ""], ["vivid", 2, "生動的", ""], ["revival", 2, "復甦", ""], ["vivacious", 2, "活潑的", ""]
    ]},
    { id: "mort", f: ["mort"], m: "死", src: "拉丁 mors／mortis（死）", members: [
      ["mortal", 2, "會死的、致命的", ""], ["immortal", 2, "不朽的", ""], ["mortality", 2, "死亡率", ""],
      ["mortuary", 2, "太平間", ""], ["mortify", 1, "羞辱", "「讓人想死」"]
    ]},
    { id: "terr", f: ["terr"], m: "土地", src: "拉丁 terra（土地）", members: [
      ["territory", 2, "領土", ""], ["terrain", 2, "地形", ""], ["terrace", 2, "露臺、梯田", ""],
      ["terrarium", 2, "生態瓶", ""], ["terrestrial", 2, "陸生的", ""]
    ]},
    { id: "luc", f: ["lumin", "luc"], m: "光", src: "拉丁 lux／lumen（光）", members: [
      ["lucid", 2, "清晰的", "「亮的」"], ["translucent", 2, "半透明的", "「光穿得過去」"],
      ["illuminate", 2, "照亮", ""], ["luminous", 2, "發光的", ""], ["elucidate", 1, "闡明", "「把它照出來」"]
    ]},
    { id: "ver", f: ["ver"], m: "真", src: "拉丁 verus（真）", members: [
      ["verify", 2, "查證", ""], ["verdict", 2, "判決", "「說真話」"], ["verification", 2, "驗證", ""],
      ["veracity", 2, "真實性", ""], ["very", 0, "非常", "本來是「真的」，現在只剩強調語氣"]
    ]},
    { id: "fin", f: ["fin"], m: "結束、界限", src: "拉丁 finis（終點、界線）", members: [
      ["final", 2, "最後的", ""], ["finish", 2, "完成", ""], ["infinite", 2, "無限的", ""],
      ["define", 1, "定義", "「畫出界線」"], ["confine", 2, "限制", ""], ["definite", 2, "明確的", ""], ["finance", 0, "金融", "「把帳結清」→ 現代意思完全脫離"]
    ]},
    { id: "form", f: ["form"], m: "形狀", src: "拉丁 forma（形）", members: [
      ["uniform", 2, "制服、一致的", "「同一個形狀」"], ["transform", 2, "轉變", ""],
      ["reform", 2, "改革", "「重新塑形」"], ["formal", 2, "正式的", ""], ["formula", 2, "公式", ""],
      ["conform", 2, "順從", "「跟大家同形」"], ["deform", 2, "變形", ""]
    ]},
    { id: "equ", f: ["equ"], m: "相等", src: "拉丁 aequus（平等）", members: [
      ["equal", 2, "相等的", ""], ["equation", 2, "方程式", ""], ["adequate", 1, "足夠的", "「配得上的」"],
      ["equator", 2, "赤道", "「把地球分成相等兩半的線」"], ["equity", 2, "公平、股權", ""], ["equivalent", 2, "等值的", ""]
    ]},
    { id: "val", f: ["val"], m: "價值、強壯", src: "拉丁 valere（值、強）", members: [
      ["value", 2, "價值", ""], ["valid", 2, "有效的", ""], ["invalid", 2, "無效的", ""],
      ["evaluate", 2, "評估", ""], ["equivalent", 2, "等值的", ""]
    ]},
    { id: "magn", f: ["magn"], m: "大", src: "拉丁 magnus（大）", members: [
      ["magnify", 2, "放大", ""], ["magnitude", 2, "規模、量級", ""],
      ["magnificent", 2, "壯麗的", "「做得很大」"], ["magnanimous", 2, "寬宏大量的", ""], ["magnification", 2, "放大倍率", ""]
    ]},
    { id: "simil", f: ["simul", "simil"], m: "相似", src: "拉丁 similis（相似）", members: [
      ["similar", 2, "相似的", ""], ["simile", 2, "明喻", ""], ["simulate", 2, "模擬", ""],
      ["assimilate", 2, "同化、吸收", ""], ["similarity", 2, "相似性", ""]
    ]},
    { id: "junct", f: ["junct", "jug"], m: "接合", src: "拉丁 jungere（連接）", members: [
      ["junction", 2, "交會點", ""], ["conjunction", 2, "連接詞、結合", ""], ["adjunct", 2, "附屬物", ""],
      ["injunction", 1, "禁制令", "「把命令綁上去」"], ["conjugal", 2, "婚姻的", "「綁在一起的」"], ["subjugate", 1, "征服", "「套上軛」"]
    ]},
    { id: "sta", f: ["stant", "stat", "sist", "stit"], m: "站立", src: "拉丁 stare（站）", members: [
      ["station", 2, "車站、站點", ""], ["status", 2, "狀態、地位", ""], ["constant", 1, "恆定的", "「一直站著」"],
      ["assist", 1, "協助", "「站到旁邊去」"], ["resist", 1, "抵抗", "「站回去頂住」"],
      ["consist", 1, "由……組成", "「一起站著」"], ["institute", 1, "設立、機構", "「立起來」"],
      ["substitute", 1, "替代", "「站到下面去頂替」"], ["statue", 2, "雕像", ""]
    ]},
    { id: "ten", f: ["tain", "tin", "ten"], m: "握住", src: "拉丁 tenere（握）", members: [
      ["contain", 1, "包含", "「一起握住」"], ["retain", 2, "保留", ""], ["detain", 2, "拘留", ""],
      ["obtain", 1, "取得", "「握到手」"], ["continue", 1, "繼續", "「一直握著不放」"],
      ["tenant", 2, "房客", "「持有的人」"], ["tenacious", 2, "頑強的", "「抓住不放的」"]
    ]},
    { id: "vert", f: ["vers", "vert"], m: "轉", src: "拉丁 vertere（轉）", members: [
      ["convert", 2, "轉換", ""], ["reverse", 2, "反轉", ""], ["invert", 2, "倒轉", ""],
      ["divert", 2, "轉移", ""], ["version", 1, "版本", "「換一個轉法」"],
      ["universe", 1, "宇宙", "「全部轉成一個」"], ["advertise", 0, "廣告", "「讓人把頭轉過來」——現代意思已脫節"],
      ["controversy", 1, "爭議", "「轉到相反邊」"], ["introvert", 2, "內向的人", "「往裡面轉」"], ["extrovert", 2, "外向的人", ""]
    ]},
    { id: "clud", f: ["clus", "clos", "clud"], m: "關閉", src: "拉丁 claudere（關）", members: [
      ["include", 1, "包含", "「關進來」"], ["exclude", 2, "排除", "「關在外面」"],
      ["conclude", 1, "結論", "「一起關起來」"], ["seclude", 2, "隔離", ""],
      ["inclusive", 2, "包容的", ""], ["closure", 2, "關閉、了結", ""], ["disclose", 2, "揭露", "「打開來」"], ["enclose", 2, "圍住、隨附", ""]
    ]},
    { id: "fid", f: ["fid"], m: "信任", src: "拉丁 fides（信）", members: [
      ["confide", 2, "吐露、信賴", ""], ["confident", 2, "有信心的", ""], ["confidence", 2, "信心", ""],
      ["infidel", 2, "異教徒", "「不信的人」"], ["diffident", 2, "缺乏自信的", "「不太信（自己）」"], ["perfidy", 2, "背信", ""]
    ]},
    { id: "nat", f: ["nasc", "nat"], m: "出生", src: "拉丁 nasci（出生）", members: [
      ["native", 2, "原生的", ""], ["nation", 1, "國家", "「一起出生的一群人」"], ["natural", 1, "自然的", "「天生的」"],
      ["innate", 2, "與生俱來的", ""], ["prenatal", 2, "產前的", ""], ["nascent", 2, "初生的", ""]
    ]},
    { id: "pend", f: ["pens", "pend"], m: "懸掛、秤重", src: "拉丁 pendere（掛、稱）", members: [
      ["depend", 1, "依賴", "「掛在下面」"], ["suspend", 2, "暫停、懸吊", ""], ["pendant", 2, "墜飾", ""],
      ["expensive", 1, "昂貴的", "「要秤出很多錢」"], ["compensate", 1, "補償", "「一起秤平」"], ["pension", 1, "退休金", "「秤出來付的錢」"]
    ]},
    { id: "plic", f: ["plic", "plex", "ply"], m: "摺疊", src: "拉丁 plicare（摺）", members: [
      ["complicate", 1, "使複雜", "「摺在一起」"], ["implicate", 1, "牽連", "「摺進去」"],
      ["explicit", 1, "明確的", "「攤開來的」"], ["complex", 1, "複雜的", "「摺在一起的」"],
      ["perplex", 2, "使困惑", ""], ["replicate", 2, "複製", "「再摺一次」"], ["multiply", 1, "相乘", "「摺很多層」"]
    ]},
    { id: "press", f: ["press"], m: "壓", src: "拉丁 premere（壓）", members: [
      ["compress", 2, "壓縮", ""], ["express", 1, "表達", "「把想法擠出來」"], ["impress", 1, "留下印象", "「壓進去」"],
      ["depress", 2, "壓低、使沮喪", ""], ["suppress", 2, "壓制", ""], ["oppress", 2, "壓迫", ""], ["pressure", 2, "壓力", ""]
    ]},
    { id: "quir", f: ["quest", "quis", "quir"], m: "尋求、問", src: "拉丁 quaerere（尋找）", members: [
      ["inquire", 2, "詢問", ""], ["require", 1, "要求", "「一再地求」"], ["acquire", 2, "取得", ""],
      ["exquisite", 0, "精緻的", "「被找出來的」——現代意思跟「找」完全脫節"],
      ["inquisitive", 2, "好奇的", ""], ["request", 2, "請求", ""], ["conquest", 2, "征服", ""]
    ]},
    { id: "sequ", f: ["secut", "sequ"], m: "跟隨", src: "拉丁 sequi（跟隨）", members: [
      ["sequence", 2, "順序", ""], ["consequence", 1, "後果", "「跟著來的東西」"],
      ["subsequent", 2, "後續的", ""], ["consecutive", 2, "連續的", ""],
      ["persecute", 1, "迫害", "「一路追著跑」"], ["prosecute", 1, "起訴", "「一路追下去」"]
    ]},
    { id: "serv", f: ["serv"], m: "保存、服務", src: "拉丁 servare（保存）／servire（服務）", members: [
      ["preserve", 2, "保存", ""], ["conserve", 2, "保育", ""], ["reserve", 2, "保留、預訂", ""],
      ["observe", 1, "觀察", "「盯著保住」"], ["service", 2, "服務", ""], ["servant", 2, "僕人", ""], ["deserve", 1, "值得", "「盡心服務換來的」"]
    ]},
    { id: "solv", f: ["solut", "solv"], m: "鬆開、解開", src: "拉丁 solvere（鬆開）", members: [
      ["solve", 2, "解決", ""], ["resolve", 2, "決心、解決", ""], ["dissolve", 2, "溶解", "「散開」"],
      ["solution", 2, "解答、溶液", ""], ["absolute", 1, "絕對的", "「完全鬆開、不受限的」"], ["resolution", 2, "決議、解析度", ""]
    ]},
    { id: "spond", f: ["spons", "spond"], m: "承諾、回應", src: "拉丁 spondere（許諾）", members: [
      ["respond", 2, "回應", ""], ["response", 2, "回應", ""], ["sponsor", 1, "贊助者", "「作保的人」"],
      ["correspond", 2, "通信、相符", ""], ["responsible", 2, "負責的", "「回應得了的」"], ["despondent", 1, "沮喪的", "「放棄承諾」"]
    ]},
    { id: "test", f: ["test"], m: "見證", src: "拉丁 testis（證人）", members: [
      ["testify", 2, "作證", ""], ["testimony", 2, "證詞", ""], ["protest", 1, "抗議", "「當眾作證」"],
      ["contest", 1, "競賽、質疑", "「互相對質」"], ["detest", 0, "厭惡", "「指著神發誓不要」——完全脫節"], ["attest", 2, "證明", ""]
    ]},
    { id: "vor", f: ["vour", "vor"], m: "吃、吞", src: "拉丁 vorare（吞）", members: [
      ["omnivore", 2, "雜食動物", ""], ["voracious", 2, "貪吃的、貪婪的", ""], ["devour", 2, "狼吞虎嚥", ""],
      ["carnivore", 2, "肉食動物", ""], ["carnivorous", 2, "肉食性的", ""]
    ]},
    { id: "carn", f: ["carn"], m: "肉", src: "拉丁 caro／carnis（肉）", members: [
      ["carnivore", 2, "肉食動物", ""], ["carnivorous", 2, "肉食性的", ""], ["carnal", 2, "肉體的", ""],
      ["incarnate", 2, "化身的", "「進入肉身」"], ["reincarnation", 2, "輪迴轉世", ""]
    ]},
    { id: "son", f: ["son"], m: "聲音", src: "拉丁 sonus（聲）", members: [
      ["sonic", 2, "聲音的", ""], ["resonate", 2, "共鳴", ""], ["consonant", 2, "子音", "「跟著別的音一起響」"],
      ["dissonance", 2, "不協和", ""], ["unison", 2, "齊聲", "「一個聲音」"], ["supersonic", 2, "超音速的", ""]
    ]},
    { id: "lingu", f: ["lingu"], m: "舌頭、語言", src: "拉丁 lingua（舌、語言）", members: [
      ["bilingual", 2, "雙語的", ""], ["linguistic", 2, "語言學的", ""], ["multilingual", 2, "多語的", ""],
      ["monolingual", 2, "單語的", ""], ["linguist", 2, "語言學家", ""]
    ]},
    { id: "cid", f: ["cis", "cid"], m: "切、斬", src: "拉丁 caedere（切、殺）", members: [
      ["decide", 0, "決定", "「把其他選項砍掉」——現代完全看不出刀"], ["precise", 1, "精確的", "「切得剛剛好」"],
      ["incision", 2, "切口", ""], ["concise", 1, "簡潔的", "「切乾淨」"], ["excise", 2, "切除", ""], ["decision", 1, "決定", "跟 decide 一樣，那把刀已經看不見了"]
    ]},
    { id: "part", f: ["part"], m: "部分", src: "拉丁 pars／partis（部分）", members: [
      ["participate", 2, "參與", "「拿一部分」"], ["particle", 2, "微粒", "「小小的一部分」"],
      ["partial", 2, "部分的、偏袒的", ""], ["impartial", 2, "公正的", "「不偏任何一部分」"],
      ["department", 1, "部門", "「分出去的一部分」"], ["partition", 2, "分隔", ""]
    ]},
    { id: "pot", f: ["poss", "pot"], m: "能力", src: "拉丁 posse／potis（能）", members: [
      ["possible", 2, "可能的", ""], ["impossible", 2, "不可能的", ""], ["potent", 2, "強效的", ""],
      ["impotent", 2, "無力的", ""], ["potential", 2, "潛力", ""], ["omnipotent", 2, "全能的", ""]
    ]},
    { id: "dem", f: ["dem"], m: "人民", src: "希臘 demos（人民）", members: [
      ["democracy", 2, "民主", "dem（人民）＋crat（統治）"], ["democratic", 2, "民主的", ""],
      ["demography", 2, "人口學", ""], ["epidemic", 2, "流行病", "「降在人民身上的」"], ["pandemic", 2, "大流行", "「所有人民」"]
    ]},
    { id: "crat", f: ["cracy", "crat"], m: "統治、力量", src: "希臘 kratos（權力）", members: [
      ["democracy", 2, "民主", ""], ["democratic", 2, "民主的", ""], ["autocracy", 2, "獨裁", "「自己說了算」"],
      ["technocracy", 2, "技術官僚體制", ""], ["autocrat", 2, "獨裁者", ""], ["democrat", 2, "民主派人士", ""]
    ]},
    { id: "loc", f: ["loc"], m: "地方", src: "拉丁 locus（地方）", members: [
      ["local", 2, "當地的", ""], ["locate", 2, "定位", ""], ["allocate", 2, "分配", "「放到各自的位置」"],
      ["dislocate", 2, "脫臼、錯位", ""], ["location", 2, "位置", ""], ["relocate", 2, "遷移", ""]
    ]},
    { id: "urb", f: ["urb"], m: "城市", src: "拉丁 urbs（城市）", members: [
      ["urban", 2, "都市的", ""], ["suburb", 2, "郊區", "「城市下面／旁邊」"], ["suburban", 2, "郊區的", ""],
      ["urbanize", 2, "都市化", ""], ["urbane", 1, "溫文有禮的", "「有城裡人樣子的」"]
    ]},
    { id: "nym", f: ["onym", "nym"], m: "名字", src: "希臘 onoma（名字）", members: [
      ["anonymous", 2, "匿名的", "「沒有名字」"], ["synonym", 2, "同義詞", "「一起的名字」"],
      ["antonym", 2, "反義詞", ""], ["pseudonym", 2, "筆名", "「假名字」"], ["homonym", 2, "同音異義詞", ""]
    ]},
    { id: "techn", f: ["techn"], m: "技藝", src: "希臘 techne（技藝）", members: [
      ["technology", 2, "科技", ""], ["technique", 2, "技巧", ""], ["technical", 2, "技術的", ""],
      ["technician", 2, "技師", ""], ["technocrat", 2, "技術官僚", ""]
    ]}
  ];

  return { prefixes: prefixes, suffixes: suffixes, roots: roots, blocked: blocked, links: ["o", "i", "e", "u"] };
})();
if (typeof module !== "undefined" && module.exports) module.exports = MORPH_DB;
