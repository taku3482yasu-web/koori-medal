// ゲームの きまり (抽選・氷の 塔・JP ルーレット・ビックボスチャレンジ)。画面と 物理に ふれない (node でも うごく)
// 乱数は state.rs に もつ (セーブから 同じ 続き)。結果は 先に きめて、画面は それを 見せる だけ
// 複数人 対応の ために「席ごとの 状態」(seat) と「台 ぜんたい」(shared) を 分けて もつ (企画書: まず 1 人用・あとで 席を ふやせる 作り)
(function (root) {
    const C = typeof module !== 'undefined' ? require('./config.js') : root.CONFIG;

    function rand(s) {
        s.rs = (s.rs + 0x6D2B79F5) | 0;
        let t = s.rs;
        t = Math.imul(t ^ (t >>> 15), 1 | t);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    const pickW = (s, list, key = 'p') => { const tot = list.reduce((a, x) => a + x[key], 0); let r = rand(s) * tot; for (const x of list) { r -= x[key]; if (r < 0) return x; } return list[list.length - 1]; };

    function newSeat(medals) {
        return { medals, hold: [], balls: 0, inserted: 0, paid: 0, won: { slot: 0, tower: 0, roulette: 0, jp: 0, boss: 0 }, jpCount: 0, bossDmg: 0 };
    }
    function newState(seed) {
        return {
            version: 1, rs: seed | 0,
            seats: [newSeat(C.startMedals)],          // いまは 1 席 (将来 席を ふやす)
            shared: { jp: C.jp.start, gauge: 0, boss: null, bossWins: {} },
            stats: { spins: 0, hits: {}, towerTop: 0, jps: 0, bosses: 0, bossWin: 0 }
        };
    }
    const seat = (s, i = 0) => s.seats[i];

    // メダルを 入れる: JP プールと ボスゲージが たまる。ボス中は 攻撃に なる
    function insert(s, i = 0) {
        const me = seat(s, i);
        if (me.medals <= 0) return null;
        me.medals--; me.inserted++;
        s.shared.jp += C.jp.perInsert;
        const out = { bossStart: null };
        if (s.shared.boss) { bossHit(s, i, C.boss.insertDmg); }
        else {
            s.shared.gauge += C.boss.gauge.perInsert;
            if (s.shared.gauge >= C.boss.gauge.full) out.bossStart = startBoss(s, 'gauge');
        }
        return out;
    }
    // チャッカーに 入った: 保留 (最大 hold)。ボス中は 大きな 攻撃
    function chakker(s, i = 0) {
        const me = seat(s, i);
        if (s.shared.boss) bossHit(s, i, C.boss.chakkerDmg);
        if (me.hold.length >= C.slot.hold) return false;
        me.hold.push(holdColor(s));
        return true;
    }
    // 保留の 色 (先読み): 青 → 水色 → 金。いまは 見た目 だけ (結果は 回す ときに きまる) ★
    function holdColor(s) { const r = rand(s); return r < 0.06 ? 'gold' : r < 0.25 ? 'aqua' : 'blue'; }

    // 入れた メダルが 転がって どこに 落ちるか・チャッカーに 入るか (x = ねらった 位置)
    function entry(s, x) {
        const F = C.field, j = C.insertJitter;
        const fx = Math.max(F.x + F.medalR + 1, Math.min(F.x + F.w - F.medalR - 1, x + (rand(s) * 2 - 1) * j));
        const ck = C.chakkers.find(c => Math.abs(fx - c.x - F.x) < c.w / 2);
        return { x: fx, chakker: ck && rand(s) < ck.rate ? ck.id : null };
    }
    // 液晶スロットを 1 回 回す (保留を 1 つ つかう)。結果と リールの 目を かえす
    function spin(s, i = 0) {
        const me = seat(s, i);
        if (!me.hold.length) return null;
        const color = me.hold.shift();
        // 保留の 色で 期待度が 少し 上がる (ハズレの 確率を へらす) ★
        const boost = color === 'gold' ? 4 : color === 'aqua' ? 1.6 : 1;
        const table = C.slot.table.map(x => ({ ...x, p: x.p * (['ball', 'battle', 'boss', 'm30'].includes(x.id) ? boost : 1) }));
        const hitP = table.reduce((a, x) => a + x.p, 0);
        const scale = hitP > 0.95 ? 0.95 / hitP : 1;
        let r = rand(s), res = null;
        for (const x of table) { r -= x.p * scale; if (r < 0) { res = C.slot.table.find(y => y.id === x.id); break; } }
        s.stats.spins++;
        const out = { color, result: res ? res.id : 'miss', reels: null, reach: false, okagappa: false, battleWin: null, medals: res && res.medals || 0 };
        if (res) {
            s.stats.hits[res.id] = (s.stats.hits[res.id] || 0) + 1;
            out.reels = [res.sym, res.sym, res.sym];
            out.reach = true;
            out.okagappa = ['ball', 'battle', 'boss'].includes(res.id) && rand(s) < C.slot.okagappaUp;
            if (res.id === 'battle') out.battleWin = rand(s) < C.slot.battleWin;
        } else {
            const syms = C.slot.symbols;
            const a = syms[Math.floor(rand(s) * syms.length)];
            if (rand(s) < C.slot.reach) { let b; do { b = syms[Math.floor(rand(s) * syms.length)]; } while (b === a); out.reels = [a, a, b]; out.reach = true; }
            else { let b, c; do { b = syms[Math.floor(rand(s) * syms.length)]; c = syms[Math.floor(rand(s) * syms.length)]; } while (b === a && c === a); out.reels = [a, b, c]; }
            out.okagappa = rand(s) < 0.05;
        }
        return out;
    }
    // 回した 結果を 反映する。画面は アニメの あとに よぶ。かえり値 = 起きた こと
    function applySpin(s, sp, i = 0) {
        const me = seat(s, i);
        const out = { spill: 0, ball: 0, bossStart: null };
        if (sp.result === 'ball' || (sp.result === 'battle' && sp.battleWin)) { me.balls++; out.ball = 1; }
        else if (sp.medals) { out.spill = sp.medals; me.won.slot += sp.medals; }
        else if (sp.result === 'boss' && !s.shared.boss) out.bossStart = startBoss(s, 'slot');
        return out;
    }

    // ----- 氷の 塔: ボール 1 つ ぶんの 道すじを きめる -----
    // steps = [{ stage, go: 'up'|'pay'|'fall' }]、end = 'pay'|'fall'|'roulette'、medals = 払い出し
    function tower(s, i = 0) {
        const me = seat(s, i);
        if (me.balls <= 0) return null;
        me.balls--;
        const steps = [];
        for (let k = 0; k < C.tower.length; k++) {
            const st = C.tower[k];
            const r = rand(s) * (st.up + st.pay + st.fall);
            const go = r < st.up ? 'up' : r < st.up + st.pay ? 'pay' : 'fall';
            steps.push({ stage: k, go });
            if (go === 'pay') { me.paid += st.medals; me.medals += st.medals; me.won.tower += st.medals; return { steps, end: 'pay', medals: st.medals }; }
            if (go === 'fall') return { steps, end: 'fall', medals: 0 };
        }
        s.stats.towerTop++;
        return { steps, end: 'roulette', medals: 0 };
    }
    // ----- JP ルーレット -----
    function roulette(s, i = 0) {
        const me = seat(s, i);
        const P = C.roulette.pockets;
        const idx = Math.floor(rand(s) * P.length), v = P[idx];
        if (v === 'jp') {
            const n = Math.floor(s.shared.jp);
            s.shared.jp = C.jp.start;
            s.stats.jps++; me.jpCount++;
            const spill = Math.round(n * C.jp.spill), pay = n - spill;
            me.paid += pay; me.medals += pay; me.won.jp += n;
            return { idx, kind: 'jp', medals: n, pay, spill };
        }
        if (v === 'again') return { idx, kind: 'again', medals: 0 };
        me.paid += v; me.medals += v; me.won.roulette += v;
        return { idx, kind: 'medals', medals: v };
    }

    // ----- ビックボスチャレンジ -----
    function startBoss(s, why) {
        if (s.shared.boss) return null;
        const b = pickW(s, C.boss.list);
        s.shared.boss = { id: b.id, why, hp: b.hp, max: b.hp, left: C.boss.sec, dmg: s.seats.map(() => 0), cpu: 0, started: false };
        s.shared.gauge = 0;
        s.stats.bosses++;
        return s.shared.boss;
    }
    function bossHit(s, i, n) { const B = s.shared.boss; if (!B || !B.started || B.hp <= 0) return; B.dmg[i] += n; B.hp = Math.max(0, B.hp - n); }
    // ルーレットの 演出が おわったら はじめる
    function bossGo(s) { if (s.shared.boss) s.shared.boss.started = true; }
    // 時間を すすめる (秒)。CPU の 仲間も 攻撃。おわったら 結果を かえす
    function bossTick(s, sec) {
        const B = s.shared.boss;
        if (!B || !B.started) return null;
        const cpu = Math.min(B.hp, C.boss.cpu.allies * C.boss.cpu.dps * sec * Math.max(0, 1 + (rand(s) * 2 - 1) * C.boss.cpu.swing));
        B.cpu += cpu; B.hp -= cpu;
        B.left -= sec;
        if (B.hp <= 0) return endBoss(s, true);
        if (B.left <= 0) return endBoss(s, false);
        return null;
    }
    function endBoss(s, win) {
        const B = s.shared.boss, def = C.boss.list.find(x => x.id === B.id);
        const seats = s.seats.length + C.boss.cpu.allies;
        const total = B.dmg.reduce((a, b) => a + b, 0) + B.cpu;
        const res = { id: B.id, win, rewards: [], mvp: -1 };
        if (win) {
            s.stats.bossWin++;
            s.shared.bossWins[B.id] = (s.shared.bossWins[B.id] || 0) + 1;
            // 全席 均等の 基本分 + 与えた ダメージに 応じた 貢献ボーナス。MVP には ボール
            const cpuEach = B.cpu / Math.max(1, C.boss.cpu.allies);
            const best = Math.max(...B.dmg, cpuEach);
            s.seats.forEach((me, i) => {
                const n = Math.round(def.reward * C.boss.share / seats + def.reward * (1 - C.boss.share) * (B.dmg[i] / Math.max(1, total)));
                res.rewards[i] = n;
                me.won.boss += n;
                if (B.dmg[i] >= best && B.dmg[i] > 0) { res.mvp = i; me.balls += C.boss.mvpBall; }
            });
            s.shared.gauge = 0;
        } else {
            s.seats.forEach((me, i) => { res.rewards[i] = C.boss.consolation; me.won.boss += C.boss.consolation; });
            s.shared.gauge = Math.round(C.boss.gauge.full * C.boss.gauge.keepOnFail);
        }
        s.shared.boss = null;
        return res;
    }
    // 払い出し (プッシャーの 手前から 落ちた ぶん)
    function payout(s, n, i = 0) { const me = seat(s, i); me.medals += n; me.paid += n; }

    const Game = { C, rand, entry, newState, newSeat, seat, insert, chakker, spin, applySpin, tower, roulette, startBoss, bossGo, bossTick, bossHit, endBoss, payout };
    if (typeof module !== 'undefined') module.exports = Game;
    else root.Game = Game;
})(this);
