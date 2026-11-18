// テスト (node tools/test.js): ゲームの きまり・物理・払い出しの 割合
const Game = require('../js/game.js');
const C = Game.C;
const { simulate } = require('./rtp.js');
let ok = 0, ng = 0;
function check(name, cond, info = '') { if (cond) ok++; else { ng++; console.log(`✗ ${name} ${info}`); } }

// おなじ たねなら おなじ 結果
{
    const run = seed => {
        const s = Game.newState(seed);
        for (let i = 0; i < 2000; i++) {
            Game.insert(s);
            const e = Game.entry(s, C.field.x + 210);
            if (e.chakker) Game.chakker(s);
            const sp = Game.spin(s);
            if (sp) Game.applySpin(s, sp);
            if (s.seats[0].balls) { const t = Game.tower(s); if (t.end === 'roulette') Game.roulette(s); }
        }
        return JSON.stringify(s.seats[0]) + s.rs;
    };
    check('おなじ たねで おなじ 結果', run(7) === run(7));
}
// 入れる・保留
{
    const s = Game.newState(1);
    const m0 = s.seats[0].medals;
    Game.insert(s);
    check('入れると メダルが 1 枚 へって JP が ふえる', s.seats[0].medals === m0 - 1 && s.shared.jp > C.jp.start);
    for (let i = 0; i < 10; i++) Game.chakker(s);
    check(`保留は ${C.slot.hold} 個 まで`, s.seats[0].hold.length === C.slot.hold);
    const z = Game.newState(2); z.seats[0].medals = 0;
    check('メダルが ないと 入れられない', Game.insert(z) === null);
    let inC = 0, inEdge = 0;
    for (let i = 0; i < 4000; i++) { if (Game.entry(z, C.field.x + C.chakkers[1].x).chakker) inC++; if (Game.entry(z, C.field.x + 5).chakker) inEdge++; }
    check('中央を ねらうと チャッカーに 入りやすい', inC > 4000 * 0.15 && inEdge < inC * 0.2, `${inC} ${inEdge}`);
}
// スロット
{
    const s = Game.newState(3);
    const hits = {};
    let three = true;
    for (let i = 0; i < 20000; i++) { s.seats[0].hold = ['blue']; const sp = Game.spin(s); hits[sp.result] = (hits[sp.result] || 0) + 1; if (sp.result !== 'miss' && !(sp.reels[0] === sp.reels[1] && sp.reels[1] === sp.reels[2])) three = false; }
    check('当たりは 3 つ そろう', three);
    const m = C.slot.table.find(x => x.id === 'm5');
    check('当たりの 確率が 表 どおり (5 枚)', Math.abs(hits.m5 / 20000 - m.p) < m.p * 0.2, hits.m5);
    let missAll = true;
    for (let i = 0; i < 3000; i++) { s.seats[0].hold = ['blue']; const sp = Game.spin(s); if (sp.result === 'miss' && sp.reels[0] === sp.reels[1] && sp.reels[1] === sp.reels[2]) missAll = false; }
    check('はずれは 3 つ そろわない', missAll);
    let g = 0, b = 0;
    for (let i = 0; i < 20000; i++) { s.seats[0].hold = ['gold']; if (Game.spin(s).result === 'ball') g++; s.seats[0].hold = ['blue']; if (Game.spin(s).result === 'ball') b++; }
    check('金の 保留は 期待度が 高い', g > b * 2, `${g} ${b}`);
    const t = Game.newState(4);
    const r = Game.applySpin(t, { result: 'm15', medals: 15 });
    check('枚数の 当たりは フィールドに 放出', r.spill === 15);
}
// 氷の 塔と ルーレット
{
    const s = Game.newState(5);
    const ends = {};
    let payOk = true;
    for (let i = 0; i < 20000; i++) { s.seats[0].balls = 1; const t = Game.tower(s); ends[t.end] = (ends[t.end] || 0) + 1; if (t.end === 'pay' && t.medals !== C.tower[t.steps.length - 1].medals) payOk = false; }
    check('払い出しは その 段の 枚数', payOk);
    const top = C.tower.reduce((a, x) => a * x.up / (x.up + x.pay + x.fall), 1);
    check('てっぺんまで 行く 確率', Math.abs(ends.roulette / 20000 - top) < top * 0.15, `${ends.roulette} ${top}`);
    check('ボールが ないと 塔は 動かない', Game.tower(Game.newState(6)) === null);
    const r = Game.newState(7); r.shared.jp = 1234;
    let jp = null;
    for (let i = 0; i < 2000 && !jp; i++) { const x = Game.roulette(r); if (x.kind === 'jp') jp = x; else r.shared.jp = 1234; }
    check('JP で プールを ぜんぶ もらい、プールは もとに もどる', jp && jp.medals === 1234 && r.shared.jp === C.jp.start && jp.pay + jp.spill === 1234);
    check('ルーレットは 24 ポケット・JP は 1 つ', C.roulette.pockets.length === 24 && C.roulette.pockets.filter(x => x === 'jp').length === 1);
}
// ビックボスチャレンジ
{
    const s = Game.newState(8); s.shared.gauge = C.boss.gauge.full - 1;
    const r = Game.insert(s);
    check('ボスゲージが 満タンで ボスが 出る', r.bossStart && s.shared.boss && s.shared.gauge === 0);
    const picks = {};
    for (let i = 0; i < 20000; i++) { const x = Game.newState(i); Game.startBoss(x, 'test'); picks[x.shared.boss.id] = (picks[x.shared.boss.id] || 0) + 1; }
    check('ボスは 表の 確率で えらばれる (アソボレアス 3%)', Math.abs(picks.asoboreas / 20000 - 0.03) < 0.01, picks.asoboreas);
    Game.bossGo(s);
    for (let i = 0; i < 2000 && s.shared.boss; i++) { Game.insert(s); Game.chakker(s); Game.bossTick(s, 0.1); }
    check('攻撃すると ボスを 倒せる', !s.shared.boss && s.stats.bossWin === 1 && s.seats[0].won.boss > 0);
    const l = Game.newState(9); Game.startBoss(l, 'test'); l.shared.boss.hp = l.shared.boss.max = 860; Game.bossGo(l);
    let res = null;
    for (let i = 0; i < 1000 && !res; i++) res = Game.bossTick(l, 0.1);
    check('攻撃しないと 時間切れで 残念賞', res && !res.win && res.rewards[0] === C.boss.consolation && l.shared.gauge === Math.round(C.boss.gauge.full * C.boss.gauge.keepOnFail));
    const w = Game.newState(10); Game.startBoss(w, 'test'); Game.bossGo(w);
    for (let i = 0; i < 2000 && w.shared.boss; i++) { Game.insert(w); Game.insert(w); Game.chakker(w); Game.bossTick(w, 0.05); }
    check('いちばん ダメージを 与えた 席は MVP で ボール', w.seats[0].balls >= C.boss.mvpBall);
    const x = Game.newState(11); Game.startBoss(x, 't'); Game.bossGo(x); Game.insert(x);
    check('ボス中は ゲージが たまらない', x.shared.gauge === 0);
}
// 物理 (js/coin25d.js): メダルが 積もる・手前から 落ちる・数が こわれない・台の ボール
{
    const Coin25D = require('../js/coin25d.js');
    const p = Coin25D.create({ side: C.field.side, seed: 3, R: C.field.medalR, T: C.field.medalT, RB: C.field.ballR });
    p.fill(C.field.startUpper, C.field.startLower);
    const n0 = p.count();
    p.addBall('cball', 100); p.addBall('sball', 300);
    let pay = 0, side = 0, nan = false, stacked = 0; const sp = [];
    for (let f = 0; f < 4000; f++) {
        if (f % 16 === 0) p.insert(60 + Math.random() * 300);
        p.step();
        const e = p.take(); pay += e.pay; side += e.side; sp.push(...e.special);
        if (f % 500 === 0) { for (const c of p.coins) if (!Number.isFinite(c.x + c.y + c.z)) nan = true; stacked = Math.max(stacked, p.coins.filter(c => c.on === 2).length); }
    }
    check('プッシャーで メダルが 手前から 落ちる', pay > 40, pay);
    check('左右の 穴にも 落ちる (店の もの)', side > 0, side);
    check('メダルが メダルの 上に 積もる', stacked > 50, stacked);
    check('メダルの 位置が こわれない', !nan);
    check('メダルは 台の はばの 中', p.coins.every(c => c.x >= 0 && c.x <= p.P.FW));
    check('台の ボールも うごいて いる', p.balls().length + sp.length === 2 && (sp.length > 0 || p.balls().some(b => b.y > 200)), JSON.stringify(p.balls().map(b => Math.round(b.y))));
    const q = Coin25D.create(); q.restore(p.snapshot());
    check('台を 保存して もどせる', q.coins.length === p.coins.length && n0 > 0);
    const c0 = p.count(); p.spill(20, 0);
    check('放出で メダルが ふえる', p.count() === c0 + 20);
    const r = Coin25D.create({ seed: 4, R: C.field.medalR, T: C.field.medalT, RB: C.field.ballR }); r.fill(40, 120); r.tower(210, 300, 30); for (let i = 0; i < 60; i++) r.step();
    check('タワー (積んだ メダル) が 立つ', Math.max(...r.coins.map(c => c.z)) > 60);
    r.explode(210, 300, 64, 320); for (let i = 0; i < 120; i++) r.step();
    check('爆散で タワーが くずれる', Math.max(...r.coins.filter(c => c.y > 160).map(c => c.z)) < 30);
}
// 台の ボールと スペシャルルーレット
{
    const s = Game.newState(21); const m0 = s.seats[0].medals;
    const r = Game.fieldBall(s, 'cball');
    check('こおりボールを 落とすと 枚数', r.medals === C.fieldBall.medals && s.seats[0].medals === m0 + r.medals);
    const kinds = new Set(); for (let i = 0; i < 400; i++) kinds.add(Game.fieldBall(s, 'sball').kind);
    check('スペシャルルーレットで 枚数・ボール・ボス・JP ルーレット', ['medals', 'ball', 'boss', 'jpc'].every(k => kinds.has(k)), [...kinds].join(','));
}
// 払い出しの 割合 (2026-11-17 ユーザー決定: 甘め 95% くらい)。物理の ρ は tools/rtp.js phys で 測った 値 (RHO)
{
    const rho = Number(process.env.RHO || C.measuredRho);
    const rnd = simulate({ inserts: 300000, seed: 3, aim: null, rho });
    const ctr = simulate({ inserts: 300000, seed: 4, aim: C.chakkers[1].x, rho });
    console.log(`RTP でたらめ ${(rnd.rtp * 100).toFixed(1)}% / 中央を ねらう ${(ctr.rtp * 100).toFixed(1)}% (ρ ${rho})・ボス ${rnd.stats.perHour.boss}/時`);
    check('でたらめに 入れて 払い出し 92〜98%', rnd.rtp > 0.92 && rnd.rtp < 0.98, rnd.rtp);
    check('中央を ねらうと 少し よい (ただし 100% は こえない)', ctr.rtp > rnd.rtp - 0.01 && ctr.rtp < 1.0, ctr.rtp);
    check('ビックボスチャレンジは 1 時間に 1〜4 回', rnd.stats.perHour.boss >= 1 && rnd.stats.perHour.boss <= 4, rnd.stats.perHour.boss);
}
console.log(`${ok} / ${ok + ng} 成功`);
process.exit(ng ? 1 : 0);
