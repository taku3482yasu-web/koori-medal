// こおりくんの大冒険～氷の城と大きな竜～ (メダルゲーム) — 数値は ぜんぶ ここ
// もとは ユーザーの 企画書 (2026-11-17: こおりくん大型メダルゲーム 企画書（仮）.docx)。
// 2026-11-17 ユーザー決定: タイトル「こおりくんの大冒険～氷の城と大きな竜～」・払い出しは 甘め 95% くらい・キャラの 役割は 企画書の 案どおり。
// 2026-11-18 ユーザー決定: 横画面で ゲーセンの 大型機の 席に すわった 目線 (遠近)・メダルは 厚みの ある 立体 (物理は js/coin25d.js の 2.5D)・台に ボール・ボス撃破で タワーを クレーンで はこぶ。
// 企画書で「仮」「未定」の 数値は Claude が きめた (★)。tools/rtp.js で 払い出しの 割合を たしかめる。
(function (root) {
    const CONFIG = {
        title: 'こおりくんの大冒険',
        subtitle: '～氷の城と大きな竜～',
        W: 1000, H: 620,                 // 画面 (横長・席に すわった 目線: 下 = プッシャー (遠近)・上 = 液晶・左 = 氷の 塔・右 = JP ルーレット)
        startMedals: 100,                // ★ はじめの 手持ち
        measuredRho: 0.80,               // (2026-11-19 メダル 半径 18・厚み 5.6: side 30 → 0.775・21 → 0.80) (2026-11-18 メダル 半径 15: side 40 → 0.77・33 → 0.79 を 測り、30 は その のびから 推定) プッシャーの 物理 (js/coin25d.js) で フィールドの メダルが 手前から 落ちる 割合 (node tools/rtp.js phys で 測った。side を かえたら 測りなおす)
        freeMedals: { below: 10, give: 50, hours: 0 }, // ★ 手持ちが 0 に なったら ふるカワが 50 枚 くれる (ブラウザで 1 人で 遊ぶ ので)
        autoMs: 260,                     // 長押しの 連射の 間 (ms)

        // ----- プッシャー ★ -----
        // 物理は js/coin25d.js (2.5D: 真上から 見た 平面 + 高さ。メダルが 積もる・かたむく・こぼれる)。2026-11-18 ユーザーの 希望で 立体の メダルに した
        // x, w = 入れる 位置の はんい (画面の 前の 座標の まま。台の 中では 0〜w)。side = 下段の 手前の 左右の 落とし穴 (店の もの。ここで 払い出しの 割合を 合わせる)
        field: {
            x: 40, w: 420, medalR: 18, medalT: 5.6, ballR: 22,    // 2026-11-18 ユーザー: メダルを 大きく → 2026-11-19 もっと 大きく・厚く (重厚感)
            side: 21,                                // 2026-11-19 メダルを 大きく した ので 30 → 21 (ρ を 0.80 に もどす)
            startUpper: 75, startLower: 250          // はじめの 山 (2026-11-19 ユーザー: 少し へらす。かえたら node tools/bake-start.js)
        },
        // ----- 台の ボール (2026-11-18 ユーザー: 台に ボールが あり、落とすと スペシャルルーレットや コインが もらえる) ★ -----
        // cball = こおりボール (水色。落とすと medals 枚)・sball = スペシャルボール (金。落とすと スペシャルルーレット)
        // 左右の 穴に 落ちた ボールは 台に もどる。スロットの「ボール追加」で ふえる
        fieldBall: { start: 3, startSpecial: 1, sballShare: 0.3, medals: 20, max: 6 },
        specialRoulette: {
            // 数字 = 枚数・ball = 氷の 塔の ボール・boss = ボスゲージ +gauge・jpc = JP ルーレットへ 直行
            pockets: [50, 'ball', 30, 100, 'boss', 30, 'jpc', 50, 30, 200, 'ball', 30],
            gauge: 0.15, spinMs: 6400
        },
        // チャッカー (入ると スロット抽選): 上段の 入り口に 3 つ (中央 1・左右 2)。x = フィールドの 左はしからの 中心、w = はば、rate = その 上を 通った メダルが 入る 確率 ★
        chakkers: [
            { id: 'L', x: 70, w: 46, rate: 0.28 },
            { id: 'C', x: 210, w: 46, rate: 0.40 },
            { id: 'R', x: 350, w: 46, rate: 0.28 }
        ],
        chakkerY: 150,
        insertJitter: 34,                // ★ 入れた メダルが ころがって ずれる はば (ねらっても 少し ずれる)

        // ----- 液晶スロット (3 リール・保留 4 個) ★ -----
        // 当たりの 種類と 確率 (1 回の 抽選)。medals = フィールドに 放出する 枚数
        slot: {
            hold: 4,
            spinMs: 1600, stopMs: 260,
            table: [
                { id: 'ball', p: 0.02, name: 'ボール', sym: 'ball', text: 'ボール ゲット！ 氷の 塔へ' },
                { id: 'battle', p: 0.016, name: 'おにおにバトル', sym: 'onioni', text: 'おにおにバトル！ 勝てば ボール' },
                { id: 'boss', p: 0.0012, name: 'ボス図柄', sym: 'boss', text: 'ボス図柄 そろい！ ビックボスチャレンジ' },
                { id: 'fball', p: 0.010, name: 'ボール追加', sym: 'fball', text: '台に ボールが ふって きた！' },
                { id: 'm30', p: 0.005, name: '30 枚', sym: 'm30', medals: 30 },
                { id: 'm15', p: 0.013, name: '15 枚', sym: 'm15', medals: 15 },
                { id: 'm5', p: 0.045, name: '5 枚', sym: 'm5', medals: 5 }
            ],
            symbols: ['koori', 'onioni', 'okagappa', 'ball', 'boss', 'fball', 'm5', 'm15', 'm30', 'ice'],
            reach: 0.25,                 // はずれの ときに リーチ (2 つ そろう) に なる 確率 (見せる だけ)
            battleWin: 0.5,              // おにおにバトルの 勝ち (= ボール)
            okagappaUp: 0.6              // ボール・バトル・ボスの とき おかがっぱが 出る 確率 (チャンスアップ)。はずれでも 0.05
        },

        // ----- 氷の 塔 (ステップアップ・3 段) ★ -----
        // 各段で 上へ / 払い出し / 落下。pay = その 段で 払い出し に なった ときの 枚数
        tower: [
            { up: 0.55, pay: 0.25, fall: 0.20, medals: 10 },
            { up: 0.45, pay: 0.30, fall: 0.25, medals: 20 },
            { up: 0.38, pay: 0.32, fall: 0.30, medals: 40 }
        ],
        towerStepMs: 1400,

        // ----- JP ルーレット (24 ポケット・JP 1 つ) ★ -----
        // kind: jp / medals / again (もう一回)
        roulette: {
            pockets: [
                'jp', 30, 50, 'again', 30, 40, 100, 30, 50, 'again', 30, 40,
                60, 30, 50, 'again', 30, 40, 80, 30, 50, 30, 40, 30
            ],
            spinMs: 7600      // 玉が 回って 入るまで
        },
        jp: { start: 500, perInsert: 0.03, spill: 0.3 },   // こおりJP: 初期 500 枚・投入 1 枚ごとに +0.06 枚・JP の うち spill を フィールドに 放出 (山が くずれる)

        // ----- ビックボスチャレンジ (この 台の 看板) ★ -----
        // ボスゲージ: 投入 1 枚 で gauge.perInsert、full で 発生。ボスは ルーレットで きまる。制限時間 sec 秒。投入と チャッカー入賞が 攻撃
        boss: {
            gauge: { full: 9000, perInsert: 1, keepOnFail: 0.3 },
            sec: 60,
            insertDmg: 1, chakkerDmg: 6,
            cpu: { allies: 3, dps: 1.0, swing: 1.2 },   // 1 人 プレイ: ほかの 席は CPU の 仲間 (秒あたり ダメージ。swing = ばらつき)
            share: 0.4,                     // 全席 合計の 報酬の うち 自分の 席の 基本分 (のこりは 貢献で)
            mvpBall: 1,
            consolation: 20,                // 失敗の 残念賞
            list: [
                { id: 'harukirin', name: 'ハル麒麟', p: 0.35, reward: 300, hp: 420, note: 'いちばん 倒しやすい' },
                { id: 'kongouki', name: '金剛鬼', p: 0.25, reward: 500, hp: 520 },
                { id: 'onioni', name: 'おにおに', p: 0.18, reward: 700, hp: 600, note: 'シリーズ おなじみの 敵' },
                { id: 'onioniKai', name: 'おにおに・怪', p: 0.12, reward: 1000, hp: 680, note: 'おにおにの 強化版' },
                { id: 'naitei', name: 'シーシャ・ナイテイ・ナイナイ', p: 0.07, reward: 1400, hp: 760 },
                { id: 'asoboreas', name: 'アソボレアス', p: 0.03, reward: 2000, hp: 860, note: 'この 台の オリジナル。黒い 古竜。麻生マークを 背負い、右手に メダル、左手に お金' }
            ]
        }
    };
    if (typeof module !== 'undefined') module.exports = CONFIG;
    else root.CONFIG = CONFIG;
})(this);
