// 払い出しの 割合 (RTP) を しらべる (node tools/rtp.js [phys])
// 1) phys: プッシャーの 物理だけ 回して、フィールドに 入った メダルの うち 手前から 落ちる 割合 (ρ) を 測る
// 2) ゲームの きまりを 時間つきで 回す (スロットの 回る 時間・保留 4 個・塔・ルーレット・ボス 60 秒)。
//    フィールドに 出た メダル (入れた ぶん + スロット・ボス・JP の 放出) は ρ の 割合で もどる と して 計算する
// RTP = (ρ × (入れた + 放出) + 直接の 払い出し (塔・ルーレット・JP)) ÷ 入れた
const Game = require('../js/game.js');
const C = Game.C;

function measurePhys(frames = 26000, warm = 6000) {
    const Pusher = require('../js/pusher.js');
    const p = Pusher.create();
    p.fill(C.field.startUpper, C.field.startLower);
    let ins = 0, pay = 0, side = 0;
    const every = Math.round(60 * C.autoMs / 1000 * 2);
    for (let f = 0; f < frames + warm; f++) {
        if (f % every === 0) { p.insert(C.field.x + 30 + Math.random() * (C.field.w - 60)); if (f >= warm) ins++; }
        p.step();
        const e = p.take();
        if (f >= warm) { pay += e.pay; side += e.side; }
    }
    return { rho: pay / (pay + side), pay, side, ins };
}

// aim: ねらう 位置 (フィールドの 左はしからの x)。null = でたらめ
function simulate({ inserts = 2e6, seed = 1, aim = null, rho = 0.84 } = {}) {
    const s = Game.newState(seed);
    const me = s.seats[0];
    me.medals = 1e12;
    const dt = C.autoMs / 1000;   // 1 枚 入れる ごとに すすむ 時間 (連射)
    let t = 0, slotBusy = 0, towerBusy = 0, spill = 0, direct0 = 0;
    let bossActive = false;
    const spinSec = (C.slot.spinMs + C.slot.stopMs * 3) / 1000 + 0.6;
    for (let n = 0; n < inserts; n++) {
        t += dt;
        const ins = Game.insert(s);
        if (ins && ins.bossStart) { Game.bossGo(s); bossActive = true; }
        const x = aim === null ? 30 + Math.random() * (C.field.w - 60) : aim;
        const e = Game.entry(s, C.field.x + x);
        if (e.chakker) Game.chakker(s);
        // スロット
        if (t >= slotBusy && me.hold.length) {
            const sp = Game.spin(s);
            slotBusy = t + spinSec + (sp.result === 'battle' ? 3 : 0) + (sp.reach ? 1 : 0);
            const r = Game.applySpin(s, sp);
            spill += r.spill;
            if (r.bossStart) { Game.bossGo(s); bossActive = true; }
        }
        // 塔と ルーレット (ボールが あれば 順に)
        if (t >= towerBusy && me.balls > 0) {
            const tw = Game.tower(s);
            let sec = tw.steps.length * C.towerStepMs / 1000 + 1;
            if (tw.end === 'roulette') {
                let rr;
                do { rr = Game.roulette(s); sec += C.roulette.spinMs / 1000 + 1.5; } while (rr.kind === 'again');
                if (rr.kind === 'jp') { spill += rr.spill; sec += 6; }
            }
            towerBusy = t + sec;
        }
        // ボス
        if (bossActive) {
            const res = Game.bossTick(s, dt);
            if (res) { bossActive = false; spill += res.rewards[0]; }
        }
    }
    const direct = me.won.tower + me.won.roulette + (me.won.jp - 0) - Math.round(me.won.jp * C.jp.spill);
    const rtp = (rho * (me.inserted + spill) + direct) / me.inserted;
    return {
        rtp, rho, inserted: me.inserted, spill, direct,
        parts: { phys: rho, slot: rho * me.won.slot / me.inserted, tower: me.won.tower / me.inserted, roulette: me.won.roulette / me.inserted, jp: me.won.jp / me.inserted, boss: rho * me.won.boss / me.inserted },
        stats: { ...s.stats, hours: (t / 3600).toFixed(1), perHour: { jp: (s.stats.jps / (t / 3600)).toFixed(2), boss: (s.stats.bosses / (t / 3600)).toFixed(2), ball: ((me.won.tower ? 1 : 0)) } },
        bossWinRate: s.stats.bosses ? (s.stats.bossWin / s.stats.bosses).toFixed(2) : '-'
    };
}

module.exports = { measurePhys, simulate };
if (require.main === module) {
    let rho = Number(process.env.RHO || 0);
    if (!rho || process.argv.includes('phys')) { const m = measurePhys(); rho = m.rho; console.log('物理: 手前から 落ちる 割合 ρ =', rho.toFixed(3), JSON.stringify(m)); }
    for (const [name, aim] of [['でたらめ', null], ['中央を ねらう', C.chakkers[1].x], ['はしを ねらう', 20]]) {
        const r = simulate({ inserts: Number(process.env.N || 1e6), aim, rho });
        const pc = v => (v * 100).toFixed(1) + '%';
        console.log(`${name.padEnd(8)} RTP ${pc(r.rtp)}  (物理 ${pc(r.parts.phys)} スロット ${pc(r.parts.slot)} 塔 ${pc(r.parts.tower)} ルーレット ${pc(r.parts.roulette)} JP ${pc(r.parts.jp)} ボス ${pc(r.parts.boss)})  ${r.stats.hours} 時間・JP ${r.stats.jps} 回 (${r.stats.perHour.jp}/時)・ボス ${r.stats.bosses} 回 (${r.stats.perHour.boss}/時・勝ち ${r.bossWinRate})・塔の てっぺん ${r.stats.towerTop}`);
    }
}
