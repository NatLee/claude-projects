/* ═══════════════════════════════════════════════════════════════════════
   ELIZA 1966 — 依 Weizenbaum (1966, CACM 9(1):36-45) 所述機制重新實作。
   關鍵字 / rank / 分解樣板 / 重組樣板 / 字詞代換 / 記憶堆疊 / NONE fallback。
   零外部資源、零 fetch、零 AI API。這一整台 ELIZA 就在這個檔案裡。

   腳本資料格式
     keys: { KEYWORD: { rank, sub, rules:[{ d:[...], r:[...] }] } }
       d  分解樣板：0=任意個字, n=剛好 n 個字, "字"=字面, ["*","A","B"]=擇一,
                    "/TAG"=帶該標籤的字
       r  重組樣板：字串（{n} 代表第 n 段），或 {link:"KEY"}（=KEY）、
                    {newkey:true}（NEWKEY）、{pre:"...", link:"KEY"}（PRE）
     tags:   { 字: [標籤,...] }
     memoryKey / memory / none
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ───────────────────────── 1966 DOCTOR SCRIPT（英文原始腳本） ─────────── */
  const EN = {
    id: 'en',
    sep: ' ',
    greeting: 'HOW DO YOU DO. PLEASE TELL ME YOUR PROBLEM',
    placeholder: 'Tell it something…',
    memoryKey: 'MY',
    hashMemory: true,           // 用復原的 SLIP mid-square HASH 選記憶規則
    memory: [
      { d: [0, 'YOUR', 0], r: 'LETS DISCUSS FURTHER WHY YOUR {3}' },
      { d: [0, 'YOUR', 0], r: 'EARLIER YOU SAID YOUR {3}' },
      { d: [0, 'YOUR', 0], r: 'BUT YOUR {3}' },
      { d: [0, 'YOUR', 0], r: 'DOES THAT HAVE ANYTHING TO DO WITH THE FACT THAT YOUR {3}' }
    ],
    none: [
      'I AM NOT SURE I UNDERSTAND YOU FULLY',
      'PLEASE GO ON',
      'WHAT DOES THAT SUGGEST TO YOU',
      'DO YOU FEEL STRONGLY ABOUT DISCUSSING SUCH THINGS'
    ],
    tags: {
      MOTHER: ['NOUN', 'FAMILY'], FATHER: ['NOUN', 'FAMILY'], SISTER: ['FAMILY'],
      BROTHER: ['FAMILY'], WIFE: ['FAMILY'], HUSBAND: ['FAMILY'], CHILDREN: ['FAMILY'],
      SON: ['FAMILY'], DAUGHTER: ['FAMILY'], FAMILY: ['FAMILY'],
      FEEL: ['BELIEF'], THINK: ['BELIEF'], BELIEVE: ['BELIEF'], WISH: ['BELIEF']
    },
    keys: {
      SORRY: { rank: 0, rules: [{ d: [0], r: [
        "PLEASE DON'T APOLOGIZE",
        'APOLOGIES ARE NOT NECESSARY',
        'WHAT FEELINGS DO YOU HAVE WHEN YOU APOLOGIZE',
        "I'VE TOLD YOU THAT APOLOGIES ARE NOT REQUIRED"
      ] }] },

      DONT: { rank: 0, sub: "DON'T" },
      CANT: { rank: 0, sub: "CAN'T" },
      WONT: { rank: 0, sub: "WON'T" },
      RECOLLECT: { rank: 0, sub: 'REMEMBER', rules: [{ d: [0], r: [{ link: 'REMEMBER' }] }] },

      REMEMBER: { rank: 5, rules: [
        { d: [0, 'YOU', 'REMEMBER', 0], r: [
          'DO YOU OFTEN THINK OF {4}',
          'DOES THINKING OF {4} BRING ANYTHING ELSE TO MIND',
          'WHAT ELSE DO YOU REMEMBER',
          'WHY DO YOU REMEMBER {4} JUST NOW',
          'WHAT IN THE PRESENT SITUATION REMINDS YOU OF {4}',
          'WHAT IS THE CONNECTION BETWEEN ME AND {4}'
        ] },
        { d: [0, 'DO', 'I', 'REMEMBER', 0], r: [
          'DID YOU THINK I WOULD FORGET {5}',
          'WHY DO YOU THINK I SHOULD RECALL {5} NOW',
          'WHAT ABOUT {5}',
          { link: 'WHAT' },
          'YOU MENTIONED {5}'
        ] },
        { d: [0], r: [{ newkey: true }] }
      ] },

      IF: { rank: 3, rules: [{ d: [0, 'IF', 0], r: [
        'DO YOU THINK ITS LIKELY THAT {3}',
        'DO YOU WISH THAT {3}',
        'WHAT DO YOU THINK ABOUT {3}',
        'REALLY, {2} {3}'
      ] }] },

      DREAMT: { rank: 4, rules: [
        { d: [0, 'YOU', 'DREAMT', 0], r: [
          'REALLY, {4}',
          'HAVE YOU EVER FANTASIED {4} WHILE YOU WERE AWAKE',
          'HAVE YOU DREAMT {4} BEFORE',
          { link: 'DREAM' },
          { newkey: true }
        ] },
        { d: [0], r: [{ newkey: true }] }
      ] },
      DREAMED: { rank: 4, sub: 'DREAMT', rules: [{ d: [0], r: [{ link: 'DREAMT' }] }] },
      DREAM: { rank: 3, rules: [{ d: [0], r: [
        'WHAT DOES THAT DREAM SUGGEST TO YOU',
        'DO YOU DREAM OFTEN',
        'WHAT PERSONS APPEAR IN YOUR DREAMS',
        "DON'T YOU BELIEVE THAT DREAM HAS SOMETHING TO DO WITH YOUR PROBLEM",
        { newkey: true }
      ] }] },
      DREAMS: { rank: 3, sub: 'DREAM', rules: [{ d: [0], r: [{ link: 'DREAM' }] }] },

      HOW: { rank: 0, rules: [{ d: [0], r: [{ link: 'WHAT' }] }] },
      WHEN: { rank: 0, rules: [{ d: [0], r: [{ link: 'WHAT' }] }] },
      ALIKE: { rank: 10, rules: [{ d: [0], r: [{ link: 'DIT' }] }] },
      SAME: { rank: 10, rules: [{ d: [0], r: [{ link: 'DIT' }] }] },
      CERTAINLY: { rank: 0, rules: [{ d: [0], r: [{ link: 'YES' }] }] },

      PERHAPS: { rank: 0, rules: [{ d: [0], r: [
        "YOU DON'T SEEM QUITE CERTAIN",
        'WHY THE UNCERTAIN TONE',
        "CAN'T YOU BE MORE POSITIVE",
        "YOU AREN'T SURE",
        "DON'T YOU KNOW"
      ] }] },
      MAYBE: { rank: 0, rules: [{ d: [0], r: [{ link: 'PERHAPS' }] }] },

      NAME: { rank: 15, rules: [{ d: [0], r: [
        'I AM NOT INTERESTED IN NAMES',
        "I'VE TOLD YOU BEFORE, I DON'T CARE ABOUT NAMES -- PLEASE CONTINUE"
      ] }] },

      DEUTSCH: { rank: 0, rules: [{ d: [0], r: [{ link: 'XFREMD' }] }] },
      FRANCAIS: { rank: 0, rules: [{ d: [0], r: [{ link: 'XFREMD' }] }] },
      ITALIANO: { rank: 0, rules: [{ d: [0], r: [{ link: 'XFREMD' }] }] },
      ESPANOL: { rank: 0, rules: [{ d: [0], r: [{ link: 'XFREMD' }] }] },
      XFREMD: { rank: 0, rules: [{ d: [0], r: ['I AM SORRY, I SPEAK ONLY ENGLISH'] }] },

      HELLO: { rank: 0, rules: [{ d: [0], r: ['HOW DO YOU DO. PLEASE STATE YOUR PROBLEM'] }] },

      COMPUTER: { rank: 50, rules: [{ d: [0], r: [
        'DO COMPUTERS WORRY YOU',
        'WHY DO YOU MENTION COMPUTERS',
        'WHAT DO YOU THINK MACHINES HAVE TO DO WITH YOUR PROBLEM',
        "DON'T YOU THINK COMPUTERS CAN HELP PEOPLE",
        'WHAT ABOUT MACHINES WORRIES YOU',
        'WHAT DO YOU THINK ABOUT MACHINES'
      ] }] },
      MACHINE: { rank: 50, sub: 'COMPUTER', rules: [{ d: [0], r: [{ link: 'COMPUTER' }] }] },
      MACHINES: { rank: 50, sub: 'COMPUTER', rules: [{ d: [0], r: [{ link: 'COMPUTER' }] }] },
      COMPUTERS: { rank: 50, sub: 'COMPUTER', rules: [{ d: [0], r: [{ link: 'COMPUTER' }] }] },

      AM: { rank: 0, sub: 'ARE', rules: [
        { d: [0, 'ARE', 'YOU', 0], r: [
          'DO YOU BELIEVE YOU ARE {4}',
          'WOULD YOU WANT TO BE {4}',
          'YOU WISH I WOULD TELL YOU YOU ARE {4}',
          'WHAT WOULD IT MEAN IF YOU WERE {4}',
          { link: 'WHAT' }
        ] },
        { d: [0], r: ["WHY DO YOU SAY 'AM'", "I DON'T UNDERSTAND THAT"] }
      ] },

      ARE: { rank: 0, rules: [
        { d: [0, 'ARE', 'I', 0], r: [
          'WHY ARE YOU INTERESTED IN WHETHER I AM {4} OR NOT',
          "WOULD YOU PREFER IF I WEREN'T {4}",
          'PERHAPS I AM {4} IN YOUR FANTASIES',
          'DO YOU SOMETIMES THINK I AM {4}',
          { link: 'WHAT' }
        ] },
        { d: [0, 'ARE', 0], r: [
          'DID YOU THINK THEY MIGHT NOT BE {3}',
          'WOULD YOU LIKE IT IF THEY WERE NOT {3}',
          'WHAT IF THEY WERE NOT {3}',
          'POSSIBLY THEY ARE {3}'
        ] }
      ] },

      "YOUR": { rank: 0, sub: 'MY', rules: [{ d: [0, 'MY', 0], r: [
        'WHY ARE YOU CONCERNED OVER MY {3}',
        'WHAT ABOUT YOUR OWN {3}',
        'ARE YOU WORRIED ABOUT SOMEONE ELSES {3}',
        'REALLY, MY {3}'
      ] }] },

      WAS: { rank: 2, rules: [
        { d: [0, 'WAS', 'YOU', 0], r: [
          'WHAT IF YOU WERE {4}',
          'DO YOU THINK YOU WERE {4}',
          'WERE YOU {4}',
          'WHAT WOULD IT MEAN IF YOU WERE {4}',
          "WHAT DOES ' {4} ' SUGGEST TO YOU",
          { link: 'WHAT' }
        ] },
        { d: [0, 'YOU', 'WAS', 0], r: [
          'WERE YOU REALLY',
          'WHY DO YOU TELL ME YOU WERE {4} NOW',
          'PERHAPS I ALREADY KNEW YOU WERE {4}'
        ] },
        { d: [0, 'WAS', 'I', 0], r: [
          'WOULD YOU LIKE TO BELIEVE I WAS {4}',
          'WHAT SUGGESTS THAT I WAS {4}',
          'WHAT DO YOU THINK',
          'PERHAPS I WAS {4}',
          'WHAT IF I HAD BEEN {4}'
        ] },
        { d: [0], r: [{ newkey: true }] }
      ] },

      "I'M": { rank: 0, sub: "YOU'RE", rules: [
        { d: [0, "YOU'RE", 0], r: [{ pre: 'YOU ARE {3}', link: 'I' }] }
      ] },
      "YOU'RE": { rank: 0, sub: "I'M", rules: [
        { d: [0, "I'M", 0], r: [{ pre: 'I ARE {3}', link: 'YOU' }] }
      ] },

      ME: { rank: 0, sub: 'YOU' },
      MYSELF: { rank: 0, sub: 'YOURSELF' },
      YOURSELF: { rank: 0, sub: 'MYSELF' },

      I: { rank: 0, sub: 'YOU', rules: [
        { d: [0, 'YOU', ['*', 'WANT', 'NEED'], 0], r: [
          'WHAT WOULD IT MEAN TO YOU IF YOU GOT {4}',
          'WHY DO YOU WANT {4}',
          'SUPPOSE YOU GOT {4} SOON',
          'WHAT IF YOU NEVER GOT {4}',
          'WHAT WOULD GETTING {4} MEAN TO YOU',
          'WHAT DOES WANTING {4} HAVE TO DO WITH THIS DISCUSSION'
        ] },
        { d: [0, 'YOU', 'ARE', 0, ['*', 'SAD', 'UNHAPPY', 'DEPRESSED', 'SICK'], 0], r: [
          'I AM SORRY TO HEAR YOU ARE {5}',
          'DO YOU THINK COMING HERE WILL HELP YOU NOT TO BE {5}',
          "I'M SURE ITS NOT PLEASANT TO BE {5}",
          'CAN YOU EXPLAIN WHAT MADE YOU {5}'
        ] },
        { d: [0, 'YOU', 'ARE', 0, ['*', 'HAPPY', 'ELATED', 'GLAD', 'BETTER'], 0], r: [
          'HOW HAVE I HELPED YOU TO BE {5}',
          'HAS YOUR TREATMENT MADE YOU {5}',
          'WHAT MAKES YOU {5} JUST NOW',
          'CAN YOU EXPLAIN WHY YOU ARE SUDDENLY {5}'
        ] },
        { d: [0, 'YOU', 'WAS', 0], r: [{ link: 'WAS' }] },
        { d: [0, 'YOU', '/BELIEF', 'YOU', 0], r: [
          'DO YOU REALLY THINK SO',
          'BUT YOU ARE NOT SURE YOU {5}',
          'DO YOU REALLY DOUBT YOU {5}'
        ] },
        { d: [0, 'YOU', 0, '/BELIEF', 0, 'I', 0], r: [{ link: 'YOU' }] },
        { d: [0, 'YOU', 'ARE', 0], r: [
          'IS IT BECAUSE YOU ARE {4} THAT YOU CAME TO ME',
          'HOW LONG HAVE YOU BEEN {4}',
          'DO YOU BELIEVE ITS NORMAL TO BE {4}',
          'DO YOU ENJOY BEING {4}'
        ] },
        { d: [0, 'YOU', ['*', "CAN'T", 'CANNOT'], 0], r: [
          "HOW DO YOU KNOW YOU CAN'T {4}",
          'HAVE YOU TRIED',
          'PERHAPS YOU COULD {4} NOW',
          'DO YOU REALLY WANT TO BE ABLE TO {4}'
        ] },
        { d: [0, 'YOU', "DON'T", 0], r: [
          "DON'T YOU REALLY {4}",
          "WHY DON'T YOU {4}",
          'DO YOU WISH TO BE ABLE TO {4}',
          'DOES THAT TROUBLE YOU'
        ] },
        { d: [0, 'YOU', 'FEEL', 0], r: [
          'TELL ME MORE ABOUT SUCH FEELINGS',
          'DO YOU OFTEN FEEL {4}',
          'DO YOU ENJOY FEELING {4}',
          'OF WHAT DOES FEELING {4} REMIND YOU'
        ] },
        { d: [0, 'YOU', 0, 'I', 0], r: [
          'PERHAPS IN YOUR FANTASY WE {3} EACH OTHER',
          'DO YOU WISH TO {3} ME',
          'YOU SEEM TO NEED TO {3} ME',
          'DO YOU {3} ANYONE ELSE'
        ] },
        { d: [0], r: [
          'YOU SAY {1}',
          'CAN YOU ELABORATE ON THAT',
          'DO YOU SAY {1} FOR SOME SPECIAL REASON',
          "THAT'S QUITE INTERESTING"
        ] }
      ] },

      YOU: { rank: 0, sub: 'I', rules: [
        { d: [0, 'I', 'REMIND', 'YOU', 'OF', 0], r: [{ link: 'DIT' }] },
        { d: [0, 'I', 'ARE', 0], r: [
          'WHAT MAKES YOU THINK I AM {4}',
          'DOES IT PLEASE YOU TO BELIEVE I AM {4}',
          'DO YOU SOMETIMES WISH YOU WERE {4}',
          'PERHAPS YOU WOULD LIKE TO BE {4}'
        ] },
        { d: [0, 'I', 0, 'YOU'], r: [
          'WHY DO YOU THINK I {3} YOU',
          "YOU LIKE TO THINK I {3} YOU -- DON'T YOU",
          'WHAT MAKES YOU THINK I {3} YOU',
          'REALLY, I {3} YOU',
          'DO YOU WISH TO BELIEVE I {3} YOU',
          'SUPPOSE I DID {3} YOU -- WHAT WOULD THAT MEAN',
          'DOES SOMEONE ELSE BELIEVE I {3} YOU'
        ] },
        { d: [0, 'I', 0], r: [
          'WE WERE DISCUSSING YOU -- NOT ME',
          'OH, I {3}',
          "YOU'RE NOT REALLY TALKING ABOUT ME -- ARE YOU",
          'WHAT ARE YOUR FEELINGS NOW'
        ] }
      ] },

      YES: { rank: 0, rules: [{ d: [0], r: [
        'YOU SEEM QUITE POSITIVE', 'YOU ARE SURE', 'I SEE', 'I UNDERSTAND'
      ] }] },

      NO: { rank: 0, rules: [{ d: [0], r: [
        "ARE YOU SAYING 'NO' JUST TO BE NEGATIVE",
        'YOU ARE BEING A BIT NEGATIVE',
        'WHY NOT',
        "WHY 'NO'"
      ] }] },

      MY: { rank: 2, sub: 'YOUR', rules: [
        { d: [0, 'YOUR', 0, '/FAMILY', 0], r: [
          'TELL ME MORE ABOUT YOUR FAMILY',
          'WHO ELSE IN YOUR FAMILY {5}',
          'YOUR {4}',
          'WHAT ELSE COMES TO YOUR MIND WHEN YOU THINK OF YOUR {4}'
        ] },
        { d: [0, 'YOUR', 0], r: [
          'YOUR {3}',
          'WHY DO YOU SAY YOUR {3}',
          'DOES THAT SUGGEST ANYTHING ELSE WHICH BELONGS TO YOU',
          'IS IT IMPORTANT TO YOU THAT {2} {3}'
        ] }
      ] },

      CAN: { rank: 0, rules: [
        { d: [0, 'CAN', 'I', 0], r: [
          "YOU BELIEVE I CAN {4} DON'T YOU",
          { link: 'WHAT' },
          'YOU WANT ME TO BE ABLE TO {4}',
          'PERHAPS YOU WOULD LIKE TO BE ABLE TO {4} YOURSELF'
        ] },
        { d: [0, 'CAN', 'YOU', 0], r: [
          'WHETHER OR NOT YOU CAN {4} DEPENDS ON YOU MORE THAN ON ME',
          'DO YOU WANT TO BE ABLE TO {4}',
          "PERHAPS YOU DON'T WANT TO {4}",
          { link: 'WHAT' }
        ] }
      ] },

      WHAT: { rank: 0, rules: [{ d: [0], r: [
        'WHY DO YOU ASK',
        'DOES THAT QUESTION INTEREST YOU',
        'WHAT IS IT YOU REALLY WANT TO KNOW',
        'ARE SUCH QUESTIONS MUCH ON YOUR MIND',
        'WHAT ANSWER WOULD PLEASE YOU MOST',
        'WHAT DO YOU THINK',
        'WHAT COMES TO YOUR MIND WHEN YOU ASK THAT',
        'HAVE YOU ASKED SUCH QUESTIONS BEFORE',
        'HAVE YOU ASKED ANYONE ELSE'
      ] }] },

      BECAUSE: { rank: 0, rules: [{ d: [0], r: [
        'IS THAT THE REAL REASON',
        "DON'T ANY OTHER REASONS COME TO MIND",
        'DOES THAT REASON SEEM TO EXPLAIN ANYTHING ELSE',
        'WHAT OTHER REASONS MIGHT THERE BE'
      ] }] },

      WHY: { rank: 0, rules: [
        { d: [0, 'WHY', "DON'T", 'I', 0], r: [
          "DO YOU BELIEVE I DON'T {5}",
          'PERHAPS I WILL {5} IN GOOD TIME',
          'SHOULD YOU {5} YOURSELF',
          'YOU WANT ME TO {5}',
          { link: 'WHAT' }
        ] },
        { d: [0, 'WHY', "CAN'T", 'YOU', 0], r: [
          'DO YOU THINK YOU SHOULD BE ABLE TO {5}',
          'DO YOU WANT TO BE ABLE TO {5}',
          'DO YOU BELIEVE THIS WILL HELP YOU TO {5}',
          "HAVE YOU ANY IDEA WHY YOU CAN'T {5}",
          { link: 'WHAT' }
        ] },
        { d: [0], r: [{ link: 'WHAT' }] }
      ] },

      EVERYONE: { rank: 2, rules: [
        { d: [0, ['*', 'EVERYONE', 'EVERYBODY', 'NOBODY', 'NOONE'], 0], r: [
          'REALLY, {2}',
          'SURELY NOT {2}',
          'CAN YOU THINK OF ANYONE IN PARTICULAR',
          'WHO, FOR EXAMPLE',
          'YOU ARE THINKING OF A VERY SPECIAL PERSON',
          'WHO, MAY I ASK',
          'SOMEONE SPECIAL PERHAPS',
          "YOU HAVE A PARTICULAR PERSON IN MIND, DON'T YOU",
          "WHO DO YOU THINK YOU'RE TALKING ABOUT"
        ] }
      ] },
      EVERYBODY: { rank: 2, sub: 'EVERYONE', rules: [{ d: [0], r: [{ link: 'EVERYONE' }] }] },
      NOBODY: { rank: 2, sub: 'EVERYONE', rules: [{ d: [0], r: [{ link: 'EVERYONE' }] }] },
      NOONE: { rank: 2, sub: 'EVERYONE', rules: [{ d: [0], r: [{ link: 'EVERYONE' }] }] },

      ALWAYS: { rank: 1, rules: [{ d: [0], r: [
        'CAN YOU THINK OF A SPECIFIC EXAMPLE',
        'WHEN',
        'WHAT INCIDENT ARE YOU THINKING OF',
        'REALLY, ALWAYS'
      ] }] },

      LIKE: { rank: 10, rules: [
        { d: [0, ['*', 'AM', 'IS', 'ARE', 'WAS'], 0, 'LIKE', 0], r: [{ link: 'DIT' }] },
        { d: [0], r: [{ newkey: true }] }
      ] },

      DIT: { rank: 0, rules: [{ d: [0], r: [
        'IN WHAT WAY',
        'WHAT RESEMBLANCE DO YOU SEE',
        'WHAT DOES THAT SIMILARITY SUGGEST TO YOU',
        'WHAT OTHER CONNECTIONS DO YOU SEE',
        'WHAT DO YOU SUPPOSE THAT RESEMBLANCE MEANS',
        'WHAT IS THE CONNECTION, DO YOU SUPPOSE',
        'COULD THERE REALLY BE SOME CONNECTION',
        'HOW'
      ] }] }
    }
  };

  /* ───────────────────── 中文 DOCTOR 腳本（本頁自製，非 Weizenbaum 原作） ── */
  const ZH = {
    id: 'zh',
    sep: '',
    greeting: '你好。請告訴我你的困擾。',
    placeholder: '跟它說點什麼…',
    memoryKey: '我的',
    hashMemory: false,
    memory: [
      { d: [0, '你的', 0], r: '我們再多談談你的{3}好嗎？' },
      { d: [0, '你的', 0], r: '你剛才提到你的{3}。' },
      { d: [0, '你的', 0], r: '但是你的{3}呢？' },
      { d: [0, '你的', 0], r: '這跟你說的「你的{3}」有關係嗎？' }
    ],
    none: [
      '我不太確定我完全理解你的意思。',
      '請繼續說。',
      '這讓你想到什麼？',
      '你對談這些事情有很強烈的感覺嗎？',
      '再多說一點。'
    ],
    tags: {
      媽媽: ['家人'], 母親: ['家人'], 爸爸: ['家人'], 父親: ['家人'],
      姊姊: ['家人'], 妹妹: ['家人'], 哥哥: ['家人'], 弟弟: ['家人'],
      老婆: ['家人'], 太太: ['家人'], 老公: ['家人'], 丈夫: ['家人'],
      小孩: ['家人'], 孩子: ['家人'], 兒子: ['家人'], 女兒: ['家人'],
      家人: ['家人'], 爸媽: ['家人'], 父母: ['家人'],
      難過: ['負面'], 傷心: ['負面'], 沮喪: ['負面'], 憂鬱: ['負面'],
      焦慮: ['負面'], 痛苦: ['負面'], 生氣: ['負面'], 害怕: ['負面'],
      孤單: ['負面'], 寂寞: ['負面'], 生病: ['負面'], 崩潰: ['負面'],
      開心: ['正面'], 快樂: ['正面'], 高興: ['正面'], 興奮: ['正面'],
      放鬆: ['正面'], 輕鬆: ['正面'], 好多了: ['正面'],
      覺得: ['想法'], 認為: ['想法'], 相信: ['想法'], 希望: ['想法'], 感覺: ['想法']
    },
    keys: {
      /* 高 rank：一定要蓋過其他人 */
      電腦: { rank: 50, rules: [{ d: [0], r: [
        '電腦讓你不安嗎？',
        '你為什麼提到電腦？',
        '你覺得機器跟你的問題有什麼關係？',
        '你不認為電腦可以幫助人嗎？',
        '機器有哪一點讓你擔心？'
      ] }] },
      機器: { rank: 50, sub: '電腦', rules: [{ d: [0], r: [{ link: '電腦' }] }] },
      機器人: { rank: 50, sub: '電腦', rules: [{ d: [0], r: [{ link: '電腦' }] }] },
      人工智慧: { rank: 50, sub: '電腦', rules: [{ d: [0], r: [{ link: '電腦' }] }] },
      程式: { rank: 50, sub: '電腦', rules: [{ d: [0], r: [{ link: '電腦' }] }] },

      名字: { rank: 15, rules: [{ d: [0], r: [
        '我對名字沒有興趣。',
        '我說過了，我不在意名字——請你繼續。'
      ] }] },

      一樣: { rank: 10, rules: [{ d: [0], r: [{ link: '類比' }] }] },
      相同: { rank: 10, sub: '一樣', rules: [{ d: [0], r: [{ link: '類比' }] }] },
      相似: { rank: 10, sub: '一樣', rules: [{ d: [0], r: [{ link: '類比' }] }] },
      很像: { rank: 10, rules: [{ d: [0], r: [{ link: '類比' }] }] },
      就像: { rank: 10, rules: [{ d: [0], r: [{ link: '類比' }] }] },
      類比: { rank: 0, rules: [{ d: [0], r: [
        '哪裡像呢？',
        '你看到什麼相似的地方？',
        '這個相似之處讓你想到什麼？',
        '你還看到什麼別的關聯？',
        '你覺得這個相似意味著什麼？',
        '這中間的連結是什麼，你猜？',
        '真的會有什麼關聯嗎？',
        '怎麼說？'
      ] }] },

      記得: { rank: 5, rules: [
        { d: [0, '你', '記得', 0], r: [
          '你常常想起{4}嗎？',
          '想起{4}讓你聯想到別的事嗎？',
          '你還記得什麼？',
          '你為什麼現在想起{4}？',
          '現在的處境哪裡讓你想起{4}？'
        ] },
        { d: [0, '我', '記得', 0], r: [
          '你以為我會忘記{4}嗎？',
          '你為什麼覺得我現在應該想起{4}？',
          '{4}怎麼了？'
        ] },
        { d: [0], r: [{ newkey: true }] }
      ] },
      想起: { rank: 5, sub: '記得', rules: [{ d: [0], r: [{ link: '記得' }] }] },
      忘記: { rank: 5, rules: [{ d: [0], r: [
        '你為什麼想忘記它？',
        '忘記之後會怎麼樣？',
        '你真的忘得掉嗎？'
      ] }] },

      夢到: { rank: 4, rules: [
        { d: [0, '你', '夢到', 0], r: [
          '真的嗎，{4}？',
          '你醒著的時候幻想過{4}嗎？',
          '你以前夢到過{4}嗎？',
          { link: '夢' }
        ] },
        { d: [0], r: [{ newkey: true }] }
      ] },
      夢見: { rank: 4, sub: '夢到', rules: [{ d: [0], r: [{ link: '夢到' }] }] },
      夢: { rank: 3, rules: [{ d: [0], r: [
        '那個夢讓你想到什麼？',
        '你常常做夢嗎？',
        '你的夢裡通常出現誰？',
        '你不覺得那個夢跟你的困擾有關嗎？',
        { newkey: true }
      ] }] },
      做夢: { rank: 3, sub: '夢', rules: [{ d: [0], r: [{ link: '夢' }] }] },

      如果: { rank: 3, rules: [{ d: [0, '如果', 0], r: [
        '你覺得{3}真的有可能嗎？',
        '你希望{3}嗎？',
        '你對{3}有什麼想法？',
        '真的嗎，{3}？'
      ] }] },
      假如: { rank: 3, sub: '如果', rules: [{ d: [0], r: [{ link: '如果' }] }] },

      每個人: { rank: 2, rules: [{ d: [0, ['*', '每個人', '大家', '所有人', '沒有人', '每個'], 0], r: [
        '真的嗎，{2}？',
        '不會吧，{2}？',
        '你能想到某個特定的人嗎？',
        '例如誰呢？',
        '你心裡想的是某個很特別的人。',
        '可以問是誰嗎？',
        '你心裡有個特定的人，對不對？'
      ] }] },
      大家: { rank: 2, sub: '每個人', rules: [{ d: [0], r: [{ link: '每個人' }] }] },
      所有人: { rank: 2, sub: '每個人', rules: [{ d: [0], r: [{ link: '每個人' }] }] },
      沒有人: { rank: 2, sub: '每個人', rules: [{ d: [0], r: [{ link: '每個人' }] }] },

      我的: { rank: 2, sub: '你的', rules: [
        { d: [0, '你的', 0, '/家人', 0], r: [
          '多告訴我一些你的家人吧。',
          '你家裡還有誰{5}？',
          '你的{4}。',
          '想到你的{4}，你還想到什麼？',
          '你的{4}對你來說很重要嗎？'
        ] },
        { d: [0, '你的', 0], r: [
          '你的{3}。',
          '你為什麼說你的{3}？',
          '這還讓你想到什麼屬於你的東西嗎？',
          '「你的{3}」對你來說很重要嗎？'
        ] }
      ] },

      你的: { rank: 0, sub: '我的', rules: [{ d: [0, '我的', 0], r: [
        '你為什麼在意我的{3}？',
        '那你自己的{3}呢？',
        '你會擔心別人的{3}嗎？',
        '真的嗎，我的{3}？'
      ] }] },

      總是: { rank: 1, rules: [{ d: [0], r: [
        '你能想到一個具體的例子嗎？',
        '什麼時候？',
        '你想到的是哪一次？',
        '真的嗎，總是？'
      ] }] },
      老是: { rank: 1, sub: '總是', rules: [{ d: [0], r: [{ link: '總是' }] }] },
      一直: { rank: 1, sub: '總是', rules: [{ d: [0], r: [{ link: '總是' }] }] },
      從來: { rank: 1, sub: '總是', rules: [{ d: [0], r: [{ link: '總是' }] }] },

      /* 代名詞（rank 0，但規則最豐富） */
      我: { rank: 0, sub: '你', rules: [
        { d: [0, '你', ['*', '想要', '需要', '想', '要', '希望'], 0], r: [
          '如果你真的得到了{4}，那對你來說意味著什麼？',
          '你為什麼想要{4}？',
          '假設你很快就得到了{4}呢？',
          '如果你永遠得不到{4}呢？',
          '得到{4}會改變什麼嗎？'
        ] },
        { d: [0, '你', 0, '/負面', 0], r: [
          '聽到你{4}，我覺得很遺憾。',
          '你覺得來這裡談談，會讓你不那麼{4}嗎？',
          '{4}的感覺一定不好受。',
          '你能說說是什麼讓你{4}的嗎？'
        ] },
        { d: [0, '你', 0, '/正面', 0], r: [
          '是什麼讓你現在{4}？',
          '你{4}多久了？',
          '我有幫上什麼忙嗎，讓你{4}？'
        ] },
        { d: [0, '你', ['*', '不能', '沒辦法', '無法', '不敢'], 0], r: [
          '你怎麼知道你無法{4}？',
          '你試過了嗎？',
          '也許你現在就可以{4}。',
          '你真的很想要能夠{4}嗎？'
        ] },
        { d: [0, '你', ['*', '不', '沒有', '沒'], 0], r: [
          '你為什麼不{4}？',
          '你希望自己能{4}嗎？',
          '這件事困擾你嗎？'
        ] },
        { d: [0, '你', '/想法', 0], r: [
          '多跟我說說這種感覺。',
          '你常常這樣{3}嗎？',
          '{3}{4}——那對你意味著什麼？',
          '你為什麼會{3}{4}？'
        ] },
        { d: [0, '你', 0, '我', 0], r: [
          '你想要{3}我嗎？',
          '也許在你的想像裡，我們彼此{3}。',
          '你為什麼覺得需要{3}我？',
          '你也{3}別人嗎？'
        ] },
        { d: [0, '你', 0], r: [
          '你說你{3}，可以再多說一點嗎？',
          '你為什麼會這樣說？',
          '你{3}——這件事困擾你多久了？',
          '這很有意思，請繼續。'
        ] }
      ] },

      你: { rank: 0, sub: '我', rules: [
        { d: [0, '我', ['*', '是', '很', '好'], 0], r: [
          '是什麼讓你認為我{3}{4}？',
          '你相信我{3}{4}，這讓你感覺如何？',
          '你有時候也希望自己{3}{4}嗎？',
          '也許你想要我{3}{4}。'
        ] },
        { d: [0, '我', 0, '你', 0], r: [
          '你為什麼覺得我{3}你？',
          '你喜歡這樣想——我{3}你，對不對？',
          '真的嗎，我{3}你？',
          '假設我真的{3}你，那又代表什麼？'
        ] },
        { d: [0, '我', 0], r: [
          '我們談的是你，不是我。',
          '喔，我{3}？',
          '你其實不是在說我，對吧？',
          '你現在的感覺是什麼？'
        ] }
      ] },

      是: { rank: 0, rules: [
        { d: [0, '我', '是', 0], r: [
          '你為什麼想知道我是不是{4}？',
          '如果我不是{4}，你會比較喜歡嗎？',
          '也許在你的想像裡我是{4}。'
        ] },
        { d: [0], r: [{ newkey: true }] }
      ] },

      對不起: { rank: 0, rules: [{ d: [0], r: [
        '請不要道歉。',
        '道歉是不必要的。',
        '你道歉的時候有什麼感覺？',
        '我說過了，你不需要道歉。'
      ] }] },
      抱歉: { rank: 0, sub: '對不起', rules: [{ d: [0], r: [{ link: '對不起' }] }] },

      你好: { rank: 0, rules: [{ d: [0], r: ['你好。請告訴我你的困擾。'] }] },
      哈囉: { rank: 0, sub: '你好', rules: [{ d: [0], r: [{ link: '你好' }] }] },
      嗨: { rank: 0, sub: '你好', rules: [{ d: [0], r: [{ link: '你好' }] }] },

      對: { rank: 0, rules: [{ d: [0], r: [
        '你聽起來很肯定。', '你很確定。', '我懂了。', '我明白。'
      ] }] },
      是的: { rank: 0, sub: '對', rules: [{ d: [0], r: [{ link: '對' }] }] },
      當然: { rank: 0, sub: '對', rules: [{ d: [0], r: [{ link: '對' }] }] },

      不: { rank: 0, rules: [{ d: [0], r: [
        '你說「不」，只是為了否定嗎？',
        '你有點負面喔。',
        '為什麼不？',
        '為什麼說「不」？'
      ] }] },
      不是: { rank: 0, sub: '不', rules: [{ d: [0], r: [{ link: '不' }] }] },

      也許: { rank: 0, rules: [{ d: [0], r: [
        '你聽起來不太確定。',
        '為什麼這麼猶豫？',
        '你不能再肯定一點嗎？',
        '你不確定。',
        '你不知道嗎？'
      ] }] },
      可能: { rank: 0, sub: '也許', rules: [{ d: [0], r: [{ link: '也許' }] }] },
      或許: { rank: 0, sub: '也許', rules: [{ d: [0], r: [{ link: '也許' }] }] },

      因為: { rank: 0, rules: [{ d: [0], r: [
        '這是真正的原因嗎？',
        '沒有別的原因了嗎？',
        '這個理由還能解釋別的事情嗎？',
        '還可能有什麼其他的原因？'
      ] }] },

      為什麼: { rank: 0, rules: [
        { d: [0, '為什麼', '我', '不', 0], r: [
          '你相信我不{5}嗎？',
          '也許我時候到了就會{5}。',
          '你希望我{5}嗎？'
        ] },
        { d: [0], r: [{ link: '什麼' }] }
      ] },
      怎麼: { rank: 0, rules: [{ d: [0], r: [{ link: '什麼' }] }] },
      如何: { rank: 0, sub: '怎麼', rules: [{ d: [0], r: [{ link: '什麼' }] }] },
      什麼: { rank: 0, rules: [{ d: [0], r: [
        '你為什麼這樣問？',
        '這個問題讓你感興趣嗎？',
        '你真正想知道的是什麼？',
        '這類問題常常在你心裡打轉嗎？',
        '什麼樣的答案會讓你最滿意？',
        '你自己怎麼想？',
        '問這個問題的時候，你想到了什麼？',
        '你以前問過這樣的問題嗎？',
        '你問過別人嗎？'
      ] }] },

      討厭: { rank: 0, rules: [{ d: [0], r: [
        '你討厭它多久了？',
        '討厭它讓你有什麼感覺？',
        '還有什麼是你討厭的？',
        { newkey: true }
      ] }] },
      喜歡: { rank: 0, rules: [{ d: [0], r: [
        '你喜歡它的哪一點？',
        '喜歡它對你來說意味著什麼？',
        { newkey: true }
      ] }] },
      死: { rank: 6, rules: [{ d: [0], r: [
        '這聽起來很沉重。你願意多說一點嗎？',
        '你有這種念頭多久了？',
        '（如果你正在承受痛苦，請和真正的人談談——台灣安心專線 1925。）'
      ] }] },
      自殺: { rank: 6, sub: '死', rules: [{ d: [0], r: [{ link: '死' }] }] }
    },
    /* 額外詞彙：只影響斷詞（讓句子被切成合理的詞），不觸發任何規則 */
    lexicon: [
      '我們', '你們', '他們', '她們', '自己', '我自己', '你自己',
      '女朋友', '男朋友', '朋友', '同事', '主管', '老師', '學生',
      '工作', '公司', '學校', '生活', '感情', '關係', '身體', '睡眠',
      '最近', '昨天', '今天', '明天', '以前', '後來', '常常', '有時候',
      '真的', '好像', '應該', '可以', '不會', '不想', '不敢', '知道',
      '什麼時候', '怎麼辦', '一點', '一直都', '其實', '而且', '但是',
      '所以', '然後', '因此', '沒關係', '沒事', '事情', '問題', '時候'
    ]
  };

  /* ───────────────────────── SLIP mid-square HASH（英文記憶規則選擇） ───── */
  // Hollerith / BCD 編碼（IBM 7094）。Anthony Hay 從 Weizenbaum 檔案裡的 FAP
  // 程式碼還原出 HASH(D,N) = D 平方後取中間 N 個位元。
  const BCD = {
    ' ': 0o60, '0': 0o00, '1': 0o01, '2': 0o02, '3': 0o03, '4': 0o04,
    '5': 0o05, '6': 0o06, '7': 0o07, '8': 0o10, '9': 0o11,
    A: 0o21, B: 0o22, C: 0o23, D: 0o24, E: 0o25, F: 0o26, G: 0o27, H: 0o30, I: 0o31,
    J: 0o41, K: 0o42, L: 0o43, M: 0o44, N: 0o45, O: 0o46, P: 0o47, Q: 0o50, R: 0o51,
    S: 0o62, T: 0o63, U: 0o64, V: 0o65, W: 0o66, X: 0o67, Y: 0o70, Z: 0o71,
    "'": 0o14, '-': 0o40, ',': 0o73, '.': 0o33
  };
  function hollerith(word) {
    const w = (word + '      ').slice(0, 6);
    let v = 0n;
    for (const ch of w) v = (v << 6n) | BigInt(BCD[ch] === undefined ? 0o60 : BCD[ch]);
    return v;
  }
  function slipHash(d, n) {
    d &= 0x7FFFFFFFFn;                 // 清掉「符號」位元
    d *= d;                            // 平方
    d >>= BigInt(35 - (n >> 1));       // 把中間 n 個位元移到最低位
    return Number(d & ((1n << BigInt(n)) - 1n));
  }
  function lastCell(word) {            // SLIP 一個 cell 只放 6 個字元
    if (word.length <= 6) return word;
    return word.slice(Math.floor((word.length - 1) / 6) * 6);
  }

  /* ───────────────────────── 引擎 ─────────────────────────────────────── */
  function buildLexicon(script) {
    const set = new Set();
    Object.keys(script.keys).forEach((k) => set.add(k));
    Object.keys(script.keys).forEach((k) => { if (script.keys[k].sub) set.add(script.keys[k].sub); });
    Object.keys(script.tags).forEach((k) => set.add(k));
    (script.lexicon || []).forEach((w) => set.add(w));
    // 樣板裡出現的字面字也要能被切出來
    Object.keys(script.keys).forEach((k) => {
      (script.keys[k].rules || []).forEach((rule) => {
        rule.d.forEach((p) => {
          if (typeof p === 'string' && p[0] !== '/') set.add(p);
          else if (Array.isArray(p)) p.slice(1).forEach((w) => set.add(w));
        });
      });
    });
    script.memory.forEach((m) => m.d.forEach((p) => { if (typeof p === 'string' && p[0] !== '/') set.add(p); }));
    return Array.from(set).sort((a, b) => b.length - a.length);
  }

  const DELIM = new Set([',', '.', '，', '。', '、', '？', '?', '！', '!', '；', ';']);

  class Eliza {
    constructor(script) {
      this.s = script;
      this.lex = script.sep === '' ? buildLexicon(script) : null;
      this.reset();
    }

    reset() {
      this.mem = [];
      this.memCycle = 0;
      this.limit = 0;
      this.idx = new Map();     // 每條分解規則的重組游標（重組樣板依序輪替）
    }

    cursorKey(key, ri) { return key + '#' + ri; }

    /* --- 斷詞 --- */
    tokenize(raw) {
      const s = this.s;
      let text = String(raw || '').replace(/[’‘]/g, "'").trim();
      if (s.sep === ' ') {
        text = text.toUpperCase().replace(/[^A-Z0-9',. ]/g, ' ');
        text = text.replace(/([,.])/g, ' $1 ');
        return text.split(/\s+/).filter(Boolean);
      }
      // 中文：正規化 → 最長匹配字典斷詞
      text = text.replace(/妳/g, '你').replace(/祢/g, '你').replace(/俺/g, '我');
      const out = [];
      let i = 0;
      while (i < text.length) {
        const c = text[i];
        if (/\s/.test(c)) { i++; continue; }
        if (DELIM.has(c)) { out.push(c === '?' ? '？' : c === '!' ? '！' : c); i++; continue; }
        let hit = null;
        for (const w of this.lex) {
          if (w.length <= text.length - i && text.startsWith(w, i)) { hit = w; break; }
        }
        if (hit) { out.push(hit); i += hit.length; } else { out.push(c); i++; }
      }
      return out;
    }

    /* --- 分解樣板比對（回溯） --- */
    match(pattern, words) {
      const tags = this.s.tags;
      function go(pi, wi) {
        if (pi === pattern.length) return wi === words.length ? [] : null;
        const p = pattern[pi];
        if (p === 0) {
          for (let len = 0; wi + len <= words.length; len++) {
            const rest = go(pi + 1, wi + len);
            if (rest) return [words.slice(wi, wi + len)].concat(rest);
          }
          return null;
        }
        if (typeof p === 'number') {
          if (wi + p > words.length) return null;
          const rest = go(pi + 1, wi + p);
          return rest ? [words.slice(wi, wi + p)].concat(rest) : null;
        }
        if (wi >= words.length) return null;
        const w = words[wi];
        let ok = false;
        if (typeof p === 'string') {
          if (p[0] === '/') ok = !!(tags[w] && tags[w].indexOf(p.slice(1)) >= 0);
          else ok = w === p;
        } else if (Array.isArray(p)) {
          ok = p.slice(1).indexOf(w) >= 0;
        }
        if (!ok) return null;
        const rest = go(pi + 1, wi + 1);
        return rest ? [[w]].concat(rest) : null;
      }
      return go(0, 0);
    }

    /* --- 重組 --- */
    assemble(tpl, comps) {
      const sep = this.s.sep;
      const parts = [];
      const re = /\{(\d+)\}/g;
      let last = 0, m;
      while ((m = re.exec(tpl)) !== null) {
        if (m.index > last) parts.push({ lit: tpl.slice(last, m.index) });
        parts.push({ slot: parseInt(m[1], 10) });
        last = m.index + m[0].length;
      }
      if (last < tpl.length) parts.push({ lit: tpl.slice(last) });

      const chunks = parts.map((p) => {
        if (p.lit !== undefined) return p.lit;
        const c = comps[p.slot - 1];
        return c ? c.join(sep) : '';
      });
      let out = chunks.join('');
      if (sep === ' ') out = out.replace(/\s+/g, ' ').replace(/\s+([,.])/g, '$1').trim();
      return out.trim();
    }

    /* --- 掃描：字詞代換 + 關鍵字堆疊 + 分隔符處理 --- */
    scan(raw) {
      const s = this.s;
      const toks = this.tokenize(raw);
      const words = [];
      const trace = [];
      const stack = [];   // {key, rank, at}
      let stopped = false;

      for (let i = 0; i < toks.length && !stopped; i++) {
        const t = toks[i];
        if (DELIM.has(t)) {
          if (stack.length) { stopped = true; trace.push({ w: t, cut: true }); break; }
          words.length = 0;                       // 還沒找到關鍵字 → 丟掉前面整段
          trace.forEach((x) => { x.dropped = true; });
          trace.push({ w: t, cut: true, dropped: true });
          continue;
        }
        const entry = s.keys[t];
        let word = t;
        const rec = { w: t };
        if (entry && entry.sub) { word = entry.sub; rec.sub = entry.sub; }
        if (entry && entry.rules) {
          rec.key = t; rec.rank = entry.rank || 0;
          const at = words.length;
          const rank = entry.rank || 0;
          let pos = stack.length;
          while (pos > 0 && stack[pos - 1].rank < rank) pos--;
          stack.splice(pos, 0, { key: t, rank, at });
        }
        words.push(word);
        trace.push(rec);
      }
      return { toks, words, stack, trace };
    }

    /* --- 主流程 --- */
    respond(raw) {
      const s = this.s;
      const x = {                                   // 透視紀錄
        input: raw, path: '', links: [], memoryFormed: null,
        stack: [], key: null, rank: null, dIndex: -1, d: null,
        comps: null, rTpl: null, rIndex: -1, out: '', trace: [], words: []
      };

      const scanned = this.scan(raw);
      x.trace = scanned.trace;
      x.words = scanned.words.slice();
      x.stack = scanned.stack.map((k) => ({ key: k.key, rank: k.rank }));

      const stack = scanned.stack.slice();

      // 記憶堆疊：選中的關鍵字剛好是 MEMORY 關鍵字時，偷偷把這句話存起來
      if (stack.length && stack[0].key === s.memoryKey) {
        const m = this.formMemory(scanned.words);
        if (m) { this.mem.push(m.text); if (this.mem.length > 5) this.mem.shift(); x.memoryFormed = m; }
      }

      // 沒有關鍵字 → 記憶堆疊 or NONE
      if (!stack.length) {
        this.limit = (this.limit % 4) + 1;
        if (this.mem.length) {
          x.path = 'memory';
          x.out = this.mem.shift();
          x.limit = this.limit;
          return x;
        }
        x.path = 'none';
        const ri = this.next('__NONE__', 0, s.none.length);
        x.rIndex = ri;
        x.rTpl = s.none[ri];
        x.out = s.none[ri];
        x.limit = this.limit;
        return x;
      }

      // 有關鍵字 → 走規則
      let words = scanned.words;
      let guard = 0;
      let key = stack.shift().key;
      x.path = 'keyword';

      while (guard++ < 24) {
        const entry = s.keys[key];
        if (!entry || !entry.rules) break;
        let matched = null;
        for (let i = 0; i < entry.rules.length; i++) {
          const comps = this.match(entry.rules[i].d, words);
          if (comps) { matched = { rule: entry.rules[i], i, comps }; break; }
        }
        if (!matched) {                                   // 這個關鍵字接不下去 → 換下一個
          if (stack.length) { x.links.push(key + ' ✗ 無樣板可用 → NEWKEY'); key = stack.shift().key; continue; }
          break;
        }
        const ri = this.next(key, matched.i, matched.rule.r.length);
        const tpl = matched.rule.r[ri];

        x.key = key; x.rank = (entry.rank || 0);
        x.dIndex = matched.i; x.d = matched.rule.d;
        x.comps = matched.comps; x.rIndex = ri; x.rTpl = tpl;

        if (typeof tpl === 'string') {
          const out = this.assemble(tpl, matched.comps);
          if (out) { x.out = out; return x; }
          break;
        }
        if (tpl && tpl.newkey) {
          x.links.push(key + ' → NEWKEY');
          if (stack.length) { key = stack.shift().key; continue; }
          break;
        }
        if (tpl && tpl.pre) {                              // PRE：先改寫，再交給別的關鍵字
          const rebuilt = this.assemble(tpl.pre, matched.comps);
          words = this.s.sep === ' ' ? rebuilt.split(/\s+/).filter(Boolean) : this.tokenize(rebuilt);
          x.links.push(key + ' → PRE (' + tpl.pre.replace(/\{(\d+)\}/g, '$1') + ') = ' + tpl.link);
          key = tpl.link;
          continue;
        }
        if (tpl && tpl.link) {                             // (=KEY)
          x.links.push(key + ' → =' + tpl.link);
          key = tpl.link;
          continue;
        }
        break;
      }

      // 什麼都沒生出來 → NONE（保證絕不回空字串）
      x.path = x.path === 'keyword' ? 'none-fallback' : 'none';
      const ri = this.next('__NONE__', 0, s.none.length);
      x.rIndex = ri; x.rTpl = s.none[ri];
      x.out = s.none[ri];
      return x;
    }

    next(key, ri, len) {
      const k = this.cursorKey(key, ri);
      const i = this.idx.get(k) || 0;
      this.idx.set(k, (i + 1) % len);
      return i % len;
    }

    formMemory(words) {
      const s = this.s;
      let i;
      if (s.hashMemory) {
        const last = words.length ? lastCell(words[words.length - 1]) : '';
        i = slipHash(hollerith(last), 2);
      } else {
        i = this.memCycle % s.memory.length;
        this.memCycle++;
      }
      const rule = s.memory[i];
      const comps = this.match(rule.d, words);
      if (!comps) return null;
      const text = this.assemble(rule.r, comps);
      if (!text) return null;
      return { index: i, rule, text, comps };
    }
  }

  /* Node 測試用出口（瀏覽器裡 document 一定存在，不會執行到這裡） */
  if (typeof document === 'undefined') {
    if (typeof module !== 'undefined' && module.exports) module.exports = { Eliza: Eliza, EN: EN, ZH: ZH };
    return;
  }

  /* ═══════════════════════════════ UI ═════════════════════════════════ */

  const LS = {
    lang: 'eliza.lang',
    xray: 'eliza.xray',
    log: 'eliza.log'
  };
  const get = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } };
  const set = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* 隱私模式 */ } };

  const $ = (id) => document.getElementById(id);
  const logEl = $('log'), inputEl = $('input'), formEl = $('form');
  const xrayEl = $('xray'), xrayBody = $('xrayBody'), xrayBtn = $('xrayBtn');
  const rulesEl = $('rules'), rulesList = $('rulesList'), rulesBtn = $('rulesBtn');
  const stageBody = document.querySelector('.stage-body');

  let script = get(LS.lang, 'zh') === 'en' ? EN : ZH;
  let bot = new Eliza(script);
  let xrayOn = get(LS.xray, '0') === '1';
  let transcript = [];
  let busy = false;
  let lastHit = null;

  /* --- reduced motion（matchMedia change 動態監聽） --- */
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  let reduced = mq.matches;
  const applyMotion = () => { document.body.classList.toggle('no-motion', reduced); };
  applyMotion();
  const onMq = (e) => { reduced = e.matches; applyMotion(); };
  if (mq.addEventListener) mq.addEventListener('change', onMq);
  else if (mq.addListener) mq.addListener(onMq);

  /* --- 逐字輸出（rAF 節流；分頁隱藏／離屏時暫停） --- */
  let rafId = null;
  let typing = null;
  function typeOut(el, text, done) {
    if (reduced) { el.textContent = text; if (done) done(); return; }
    typing = { el, text, i: 0, t: 0, done };
    el.textContent = '';
    const caret = document.createElement('span');
    caret.className = 'caret';
    el.appendChild(caret);
    if (rafId === null) rafId = requestAnimationFrame(tick);
  }
  function tick(ts) {
    rafId = null;
    if (!typing) return;
    if (document.hidden) {                       // 分頁隱藏 → 停 rAF，等回來再續
      typing.el.textContent = typing.text;       // 直接補完，不空轉
      const d = typing.done; typing = null; if (d) d();
      return;
    }
    if (!typing.t) typing.t = ts;
    const step = 16;                             // ~每 16ms 一個字
    while (ts - typing.t >= step && typing.i < typing.text.length) {
      typing.i++; typing.t += step;
    }
    typing.el.textContent = typing.text.slice(0, typing.i);
    if (typing.i < typing.text.length) {
      const caret = document.createElement('span');
      caret.className = 'caret';
      typing.el.appendChild(caret);
      logEl.scrollTop = logEl.scrollHeight;
      rafId = requestAnimationFrame(tick);
    } else {
      logEl.scrollTop = logEl.scrollHeight;
      const d = typing.done; typing = null; if (d) d();
    }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && rafId !== null) { cancelAnimationFrame(rafId); rafId = null; if (typing) tick(0); }
  });

  /* --- 訊息 --- */
  function line(cls, text) {
    const el = document.createElement('div');
    el.className = 'msg ' + cls;
    el.textContent = text;
    logEl.appendChild(el);
    logEl.scrollTop = logEl.scrollHeight;
    return el;
  }
  function botLine(text, cb) {
    const el = document.createElement('div');
    el.className = 'msg bot';
    logEl.appendChild(el);
    typeOut(el, text, () => { logEl.scrollTop = logEl.scrollHeight; if (cb) cb(); });
  }

  /* --- 透視面板 --- */
  const fmtPat = (d) => '(' + d.map((p) => {
    if (p === 0) return '0';
    if (typeof p === 'number') return String(p);
    if (Array.isArray(p)) return '(* ' + p.slice(1).join(' ') + ')';
    return p;
  }).join(' ') + ')';
  const fmtTpl = (t) => typeof t === 'string'
    ? '(' + t.replace(/\{(\d+)\}/g, (m, n) => (script.sep === ' ' ? n : '⟨' + n + '⟩')) + ')'
    : (t && t.link ? '(=' + t.link + ')' : '(NEWKEY)');

  function step(k, vHtml, cls) {
    return '<div class="step ' + (cls || '') + '" style="--s:' + (step.n++) + '">' +
      '<span class="k">' + k + '</span><span class="v">' + vHtml + '</span></div>';
  }
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function renderXray(x) {
    step.n = 0;
    const sp = script.sep;
    let h = '';

    // 1. 斷詞 + 代換
    const toks = x.trace.map((t) => {
      if (t.cut) return '<span class="tok dead">' + esc(t.w) + '</span>';
      let cls = 'tok';
      if (t.dropped) cls += ' dead';
      if (t.key) cls += ' key';
      let label = esc(t.w);
      if (t.sub) { cls = 'tok sub'; label = esc(t.w) + '→' + esc(t.sub); }
      return '<span class="' + cls + '">' + label + '</span>';
    }).join('');
    h += step('① 斷詞・字詞代換', toks +
      '<br><em>它只認得字典裡的字（綠色＝關鍵字，橘色＝被代換）。其他字對它來說不存在。</em>');

    // 2. keyword stack
    if (x.stack.length) {
      const ks = x.stack.map((k, i) =>
        '<span class="tok ' + (i === 0 ? 'key' : '') + '">' + esc(k.key) + ' <b class="slotn">rank ' + k.rank + '</b></span>'
      ).join('');
      h += step('② 關鍵字堆疊（依 rank 排序）', ks +
        (x.stack.length > 1 ? '<br><em>rank 最高的贏，其餘落選。</em>' : ''));
    } else {
      h += step('② 關鍵字堆疊', '<em>空的——這句話裡一個關鍵字都沒有。</em>', 'fail');
    }

    // 3. 命中的規則
    if (x.path === 'memory') {
      h += step('③ 沒有關鍵字 → 翻出記憶堆疊', '<em>它把你之前提到「' +
        esc(script.memoryKey) + '…」的那句話存了起來，現在拿出來用。它不知道那句話的意思，只知道那是一串字。</em>');
    } else if (x.path === 'none' || x.path === 'none-fallback') {
      h += step('③ 沒東西可接 → NONE（罐頭回應）',
        '<em>記憶堆疊也是空的，只好講一句什麼都沒說的話。</em>');
    } else {
      h += step('③ 選中的分解樣板', '<code>' + esc(fmtPat(x.d)) + '</code>' +
        ' <em>第 ' + (x.dIndex + 1) + ' 條</em>');
      const comps = (x.comps || []).map((c, i) =>
        '<span class="slot"><b class="slotn">' + (i + 1) + '</b> ' +
        (c.length ? esc(c.join(sp)) : '<em>（空）</em>') + '</span>'
      ).join(' ');
      h += step('④ 句子被切成幾段', comps);
      h += step('⑤ 套用的重組樣板', '<code>' + esc(fmtTpl(x.rTpl)) + '</code>' +
        ' <em>第 ' + (x.rIndex + 1) + ' 句，下次自動換下一句</em>');
    }

    if (x.links.length) {
      h += step('↳ 規則跳轉', x.links.map((l) => '<code>' + esc(l) + '</code>').join(' → '));
    }

    h += step('⑥ 輸出', esc(x.out), 'big');

    if (x.memoryFormed) {
      h += step('☰ 順手存進記憶堆疊', '<code>' + esc(fmtTpl(x.memoryFormed.rule.r)) + '</code><br>' +
        '<em>「' + esc(x.memoryFormed.text) + '」——等你哪天沒講到任何關鍵字，它就把這句翻出來。</em>');
    }

    h += '<div class="verdict">從頭到尾，ELIZA 做的事情是：<b>比對字串 → 切成幾段 → 塞回樣板</b>。' +
      '它<b>沒有查過任何一個字的意思</b>，沒有語意、沒有世界知識、沒有記憶內容——' +
      '只有一張表和一個堆疊。<br>而你剛剛，還是覺得它在回應你。</div>';

    xrayBody.innerHTML = h;
  }

  /* --- 規則表 --- */
  function renderRules() {
    const s = script;
    const keys = Object.keys(s.keys);
    let dCount = 0, rCount = 0;
    keys.forEach((k) => (s.keys[k].rules || []).forEach((r) => { dCount++; rCount += r.r.length; }));
    dCount += s.memory.length; rCount += s.memory.length + s.none.length;

    $('scriptStat').textContent =
      (s.id === 'en' ? '1966 DOCTOR' : '中文腳本') +
      ' ・ ' + keys.length + ' 關鍵字 ・ ' + dCount + ' 分解樣板 ・ ' + rCount + ' 重組樣板';
    $('ruleCount').textContent = keys.length + ' 個關鍵字，共 ' + (dCount + rCount) + ' 條規則';

    let h = '';
    // MEMORY / NONE 先放
    h += '<div class="kw" id="kw-__MEM__"><div class="kw-top"><span class="kw-name">MEMORY</span>' +
      '<span class="chip mem">記憶堆疊</span><span class="chip sub">觸發字：' + esc(s.memoryKey) + '</span></div>' +
      s.memory.map((m, i) => '<div class="d" data-mi="' + i + '">' + esc(fmtPat(m.d)) +
        ' <span class="r" data-mr="' + i + '">→ ' + esc(fmtTpl(m.r)) + '</span></div>').join('') + '</div>';
    h += '<div class="kw" id="kw-__NONE__"><div class="kw-top"><span class="kw-name">NONE</span>' +
      '<span class="chip">沒有關鍵字時的罐頭回應</span></div>' +
      s.none.map((r, i) => '<div class="r" data-nr="' + i + '">→ (' + esc(r) + ')</div>').join('') + '</div>';

    keys.forEach((k) => {
      const e = s.keys[k];
      h += '<div class="kw" id="kw-' + esc(k) + '" data-key="' + esc(k) + '">';
      h += '<div class="kw-top"><span class="kw-name">' + esc(k) + '</span>';
      if (e.rank) h += '<span class="chip rank">rank ' + e.rank + '</span>';
      if (e.sub) h += '<span class="chip sub">' + esc(k) + ' → ' + esc(e.sub) + '</span>';
      if (k === s.memoryKey) h += '<span class="chip mem">MEMORY</span>';
      h += '</div>';
      (e.rules || []).forEach((rule, di) => {
        h += '<div class="d" data-di="' + di + '">' + esc(fmtPat(rule.d)) + '</div>';
        rule.r.forEach((t, ri) => {
          h += '<div class="r" data-di="' + di + '" data-ri="' + ri + '">→ ' + esc(fmtTpl(t)) + '</div>';
        });
      });
      if (!e.rules) h += '<div class="d"><em>（只做字詞代換，不觸發規則）</em></div>';
      h += '</div>';
    });
    rulesList.innerHTML = h;
    if (lastHit) markHit(lastHit, false);
  }

  function markHit(x, scroll) {
    rulesList.querySelectorAll('.is-hit').forEach((el) => el.classList.remove('is-hit'));
    rulesList.querySelectorAll('.hit-chip').forEach((el) => el.remove());
    let card = null;
    if (x.path === 'keyword' && x.key) {
      card = rulesList.querySelector('#kw-' + CSS.escape(x.key));
      if (card) {
        const d = card.querySelector('.d[data-di="' + x.dIndex + '"]');
        const r = card.querySelector('.r[data-di="' + x.dIndex + '"][data-ri="' + x.rIndex + '"]');
        if (d) d.classList.add('is-hit');
        if (r) r.classList.add('is-hit');
      }
    } else if (x.path === 'memory') {
      card = rulesList.querySelector('#kw-__MEM__');
    } else {
      card = rulesList.querySelector('#kw-__NONE__');
      if (card && x.rIndex >= 0) {
        const r = card.querySelector('.r[data-nr="' + x.rIndex + '"]');
        if (r) r.classList.add('is-hit');
      }
    }
    if (card) {
      card.classList.add('is-hit');
      const chip = document.createElement('span');
      chip.className = 'chip hit-chip';
      chip.textContent = '命中';
      card.querySelector('.kw-top').appendChild(chip);
      if (scroll && !rulesEl.hidden) {
        card.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
      }
    }
  }

  /* --- 對話 --- */
  function say(text, cb) {
    const x = bot.respond(text);
    transcript.push({ u: text, e: x.out });
    if (transcript.length > 60) transcript.shift();
    set(LS.log, JSON.stringify({ lang: script.id, t: transcript }));
    lastHit = x;
    if (xrayOn) renderXray(x);
    markHit(x, true);
    botLine(x.out, cb);
  }

  formEl.addEventListener('submit', (e) => {
    e.preventDefault();
    if (busy) return;
    const v = inputEl.value.trim();
    if (!v) return;
    inputEl.value = '';
    line('you', v);
    busy = true;
    say(v, () => { busy = false; inputEl.focus(); });
  });

  /* --- 開場 --- */
  function boot(restore) {
    logEl.innerHTML = '';
    bot.reset();
    transcript = [];
    inputEl.placeholder = script.placeholder;
    let saved = null;
    if (restore) {
      try { saved = JSON.parse(get(LS.log, 'null')); } catch (e) { saved = null; }
    }
    if (saved && saved.lang === script.id && saved.t && saved.t.length) {
      line('sys', '── 接續上次的對話 ──');
      saved.t.forEach((p) => { line('you', p.u); line('bot', p.e); });
      transcript = saved.t;
      // 重放一次讓引擎的游標／記憶堆疊回到原本的狀態
      saved.t.forEach((p) => bot.respond(p.u));
    } else {
      botLine(script.greeting);
    }
    renderRules();
  }

  /* --- 語言切換 --- */
  function setLang(id) {
    script = id === 'en' ? EN : ZH;
    bot = new Eliza(script);
    set(LS.lang, id);
    $('langZh').classList.toggle('is-on', id === 'zh');
    $('langEn').classList.toggle('is-on', id === 'en');
    $('langZh').setAttribute('aria-pressed', String(id === 'zh'));
    $('langEn').setAttribute('aria-pressed', String(id === 'en'));
    lastHit = null;
    xrayBody.innerHTML = '<p class="xray-empty">說一句話，這裡就會攤開 ELIZA 的每一個步驟。</p>';
    boot(false);
    set(LS.log, '');
    inputEl.focus();
  }
  $('langZh').addEventListener('click', () => setLang('zh'));
  $('langEn').addEventListener('click', () => setLang('en'));

  /* --- 透視開關 --- */
  function setXray(on) {
    xrayOn = on;
    xrayEl.hidden = !on;
    stageBody.classList.toggle('has-xray', on);
    xrayBtn.setAttribute('aria-pressed', String(on));
    set(LS.xray, on ? '1' : '0');
    if (on && lastHit) renderXray(lastHit);
  }
  xrayBtn.addEventListener('click', () => setXray(!xrayOn));

  /* --- 規則表開關 --- */
  rulesBtn.addEventListener('click', () => {
    const open = rulesEl.hidden;
    rulesEl.hidden = !open;
    rulesBtn.setAttribute('aria-expanded', String(open));
    if (open) {
      rulesEl.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' });
      if (lastHit) markHit(lastHit, true);
    }
  });
  $('ruleSearch').addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    rulesList.querySelectorAll('.kw').forEach((el) => {
      el.style.display = (!q || el.textContent.toLowerCase().indexOf(q) >= 0) ? '' : 'none';
    });
  });

  /* --- 清除 --- */
  $('clearBtn').addEventListener('click', () => {
    set(LS.log, '');
    lastHit = null;
    xrayBody.innerHTML = '<p class="xray-empty">說一句話，這裡就會攤開 ELIZA 的每一個步驟。</p>';
    boot(false);
    inputEl.focus();
  });

  /* --- 重播 1966 年論文裡的那段對話 --- */
  const PAPER = [
    'Men are all alike.',
    "They're always bugging us about something or other.",
    'Well, my boyfriend made me come here.',
    "He says I'm depressed much of the time.",
    "It's true. I am unhappy",
    'I need some help, that much seems certain.',
    'Perhaps I could learn to get along with my mother.',
    'My mother takes care of me.',
    'My father.',
    'You are like my father in some ways.',
    "You are not very aggressive, but I think you don't want me to notice that.",
    "You don't argue with me.",
    'You are afraid of me.',
    'My father is afraid of everybody.',
    'Bullies.'
  ];
  $('replayBtn').addEventListener('click', () => {
    if (busy) return;
    if (script.id !== 'en') setLang('en');
    busy = true;
    logEl.innerHTML = '';
    bot.reset();
    transcript = [];
    line('sys', '── 1966 年 CACM 論文第 36 頁，那段對話 ──');
    botLine(script.greeting, () => stepReplay(0));
  });
  function stepReplay(i) {
    if (i >= PAPER.length) {
      line('sys', '── 這 15 句話，一字不差地重現了論文裡的對話 ──');
      busy = false;
      inputEl.focus();
      return;
    }
    line('you', PAPER[i]);
    setTimeout(() => say(PAPER[i], () => setTimeout(() => stepReplay(i + 1), reduced ? 0 : 420)), reduced ? 0 : 260);
  }

  /* --- go --- */
  setXray(xrayOn);
  boot(true);
})();
