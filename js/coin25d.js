// メダル用の 物理 (2.5D)。真上から 見た 平面 (x, y) に 高さ z を 足して、メダルが メダルの 上に 乗る・積もる・かたむく・こぼれる。
// 2 段プッシャー: 上段 (高さ HU の 台) の 手前から 落ちた メダルは 下段へ。下段の プッシャーは 上段の 下に もぐる。
// 下段の 手前 (y > LE) から 落ちた メダルが 払い出し。台の ボール (kind = 'cball' / 'sball') も いっしょに うごく。画面に ふれない (node でも うごく)。
(function (root) {
    const DEF = {
        FW: 420,                 // 台の はば
        R: 11, T: 3.2,           // メダルの 半径・厚み
        RB: 14,                  // 台の ボールの 半径
        HU: 36,                  // 上段の 台の 高さ
        UE: 150,                 // 上段の 手前の はし (y)
        LE: 430,                 // 下段の 手前の はし (y)。ここから 落ちたら 払い出し
        side: 0,                 // 下段 手前の 左右の 店の 穴 (0 = なし)
        pushU: { front: 34, stroke: 40, period: 2.6, h: 20, phase: 0 },      // 上段の プッシャー (前の はしの いちばん 奥・動く はば・1 往復の 秒・厚み)
        pushL: { front: 152, stroke: 56, period: 3.2, h: 26, phase: 2.2 },   // 下段の プッシャー (上段の 下から 出て くる)
        g: 1400,                 // 重力
        sub: 3,                  // 1 コマを 何回に わけて 計算するか
        iters: 3,                // ぶつかりの くりかえし
        table: 0.30,             // 台の まさつ (1 回で 速さを どれだけ へらすか)
        carry: 0.35,             // 下の もの (プッシャー・メダル) に ひっぱられる 強さ
        slide: 900,              // 下の メダルから はみ出した ときに すべり落ちる 強さ
        roll: 0.10               // ボールの まさつ (メダルより ころがる)
    };

    const isBall = k => k === 'cball' || k === 'sball';
    function create(opt = {}) {
        const P = Object.assign({}, DEF, opt);
        P.pushU = Object.assign({}, DEF.pushU, opt.pushU); P.pushL = Object.assign({}, DEF.pushL, opt.pushL);
        const R = P.R, T = P.T, D = R * 2;
        const coins = [];
        let t = 0, idSeq = 0;
        const ev = { pay: 0, side: 0, drop: 0, special: [] };
        const pu = { y: P.pushU.front, vy: 0 }, pl = { y: P.pushL.front, vy: 0 };
        let rs = opt.seed || 12345; const rnd = () => (rs = (rs * 16807) % 2147483647) / 2147483647;

        function add(x, y, z, kind = 'medal') {
            const ball = isBall(kind);
            const c = { id: idSeq++, x, y, z, r: ball ? P.RB : R, h: ball ? P.RB * 2 : T, im: ball ? 0.35 : 1, ball, px: x, py: y, pz: z, vx: 0, vy: 0, vz: 0, tx: 0, ty: 0, spin: 0, kind, on: 0, level: z >= P.HU - T ? 1 : 0, gone: false };
            coins.push(c); return c;
        }
        // 入れた メダル: 上段の 動く プッシャーの 上 (いちばん 上の レーン) に 落ちる。プッシャーに はこばれて 前へ こぼれる
        // (2026-11-18 ユーザー: 一番 上の 動いて いる レーンに 置かれる ように)
        function insert(x) { return add(clampX(x + (rnd() - 0.5) * 8), R * 0.6 + rnd() * Math.max(0, pu.y - R * 1.4), P.HU + P.pushU.h + 24 + rnd() * 10); }
        // フィールドに 放出。stage 0 = 上段 (前の pusher.js と 同じ)・1 = 下段
        function spill(n, stage = 0) {
            const up = stage === 0;
            for (let i = 0; i < n; i++) {
                const y = up ? P.pushU.front + P.pushU.stroke + R + rnd() * (P.UE - P.pushU.front - P.pushU.stroke - D) : P.pushL.front + P.pushL.stroke + R + rnd() * (P.LE - P.pushL.front - P.pushL.stroke - D - 30);
                add(R + rnd() * (P.FW - D), y, (up ? P.HU : 0) + 20 + rnd() * 60);
            }
        }
        // 台の ボールを 上段に 落とす
        function addBall(kind = 'cball', x) { return add(x === undefined ? P.RB + rnd() * (P.FW - P.RB * 2) : clampX(x), P.pushU.front + P.pushU.stroke + P.RB + rnd() * 20, P.HU + 40, kind); }
        // 爆散: (x, y) の まわりの メダルを はじきとばす
        function explode(x, y, rad = 60, power = 260) {
            for (const c of coins) { const dx = c.x - x, dy = c.y - y, d = Math.hypot(dx, dy); if (d > rad) continue; const a = rnd() * Math.PI * 2, k = (1 - d / rad * 0.5) * power; c.vx = Math.cos(a) * k * 0.7 + dx / (d + 1) * k * 0.4; c.vy = Math.abs(Math.sin(a)) * k * 0.6 + dy / (d + 1) * k * 0.3 + 40; c.vz = 120 + rnd() * 260 + c.z * 3; c.spin = rnd() * 6; }
        }
        // メダルの 柱 (クレーンで はこぶ タワー)。x, y に n 枚 つむ
        function tower(x, y, n, level = 0) { const base = level ? P.HU : 0; for (let k = 0; k < n; k++) add(x, y, base + k * T + 0.01, k % 6 === 5 ? 'gold' : 'medal'); }
        const clampX = (x, r = R) => Math.max(r, Math.min(P.FW - r, x));

        function movePushers(dt) {
            for (const [p, q] of [[pu, P.pushU], [pl, P.pushL]]) {
                const y = q.front + (1 - Math.cos(t * 2 * Math.PI / q.period + q.phase)) / 2 * q.stroke;
                p.vy = (y - p.y) / dt; p.y = y;
            }
        }
        // 台 (と プッシャーの 上) の 高さ。null = 下に 何も ない
        function ground(c) {
            if (c.y > P.LE) return null;
            if (c.z >= P.HU - T * 0.6 && c.y <= P.UE + R * 0.15) {         // 上段の 上
                if (c.y < pu.y && c.z >= P.HU + P.pushU.h - T * 0.6) return { z: P.HU + P.pushU.h, vy: pu.vy, push: true };
                return { z: P.HU, vy: 0 };
            }
            if (c.y < pl.y && c.z >= P.pushL.h - T * 0.6) return { z: P.pushL.h, vy: pl.vy, push: true };   // 下段の プッシャーの 上
            return { z: 0, vy: 0 };
        }

        // ご近所 さがし (マス目)
        const cell = P.RB * 2, grid = new Map();
        const key = (i, j) => i * 4096 + j;
        function buildGrid() {
            grid.clear();
            for (const c of coins) { const k = key(Math.floor(c.x / cell), Math.floor((c.y + 100) / cell)); let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(c); }
        }
        function near(c, fn) {
            const ci = Math.floor(c.x / cell), cj = Math.floor((c.y + 100) / cell);
            for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) { const a = grid.get(key(i, j)); if (a) for (const o of a) if (o !== c) fn(o); }
        }

        function substep(dt) {
            t += dt;
            movePushers(dt);
            for (const c of coins) {
                c.px = c.x; c.py = c.y; c.pz = c.z;
                c.vz -= P.g * dt;
                c.x += c.vx * dt; c.y += c.vy * dt; c.z += c.vz * dt;
            }
            buildGrid();
            for (let it = 0; it < P.iters; it++) {
                // 横の ぶつかり (同じ 高さの メダル どうし)
                for (const c of coins) near(c, o => {
                    if (o.id < c.id) return;
                    const e = T * 0.08;
                    if (!(c.z < o.z + o.h - e && o.z < c.z + c.h - e)) return;
                    const dd = c.r + o.r, dx = o.x - c.x, dy = o.y - c.y, d2 = dx * dx + dy * dy;
                    if (d2 >= dd * dd || d2 < 1e-6) return;
                    const soft = c.ball || o.ball ? 1 : 1 - Math.abs(c.z - o.z) / T * 0.6;
                    const d = Math.sqrt(d2), k = (dd - d) / d * soft / (c.im + o.im);
                    c.x -= dx * k * c.im; c.y -= dy * k * c.im; o.x += dx * k * o.im; o.y += dy * k * o.im;
                });
                // かべと プッシャー
                for (const c of coins) {
                    const r = c.r;
                    c.x = clampX(c.x, r);
                    const upper = c.z >= P.HU - T * 0.6 && c.y <= P.UE + r;
                    if (upper) {
                        if (c.y < r) c.y = r;                                                       // うしろの かべ
                        if (c.z < P.HU + P.pushU.h - T * 0.5 && c.y < pu.y + r) c.y = pu.y + r;     // 上段の プッシャーの 前
                    } else {
                        if (c.z < P.HU - 1 && c.y < P.UE + r) c.y = P.UE + r;                       // 上段の 前の かべ (下段の プッシャーの 上の メダルを かきおとす)
                        if (c.z < P.pushL.h - T * 0.5 && c.y < pl.y + r) c.y = pl.y + r;            // 下段の プッシャーの 前
                    }
                }
            }
            // 下に ある もの (台・プッシャー・メダル) に のる
            buildGrid();
            for (const c of coins) {
                const gr = ground(c);
                let fz = gr ? gr.z : -Infinity, fvx = 0, fvy = gr ? gr.vy : 0, push = gr && gr.push;
                let sx = 0, sy = 0, sn = 0, svx = 0, svy = 0;
                near(c, o => {
                    if (o.ball || o.z > c.z - T * 0.35) return;                 // ボールの 上には のらない
                    const dx = c.x - o.x, dy = c.y - o.y, d2 = dx * dx + dy * dy;
                    const lim = c.ball ? o.r + c.r * 0.45 : D * 0.93;
                    if (d2 >= lim * lim) return;
                    const top = o.z + o.h;
                    if (top >= fz - 0.4) {
                        if (top > fz + 0.4) { sx = 0; sy = 0; sn = 0; svx = 0; svy = 0; push = false; }
                        fz = Math.max(fz, top); sx += o.x; sy += o.y; sn++; svx += o.vx; svy += o.vy;
                    }
                });
                c.on = 0;
                if (c.z <= fz + 0.05) {
                    c.z = fz; if (c.vz < 0) c.vz = 0; c.on = sn ? 2 : 1;
                    if (sn) {                                   // メダルの 上: いっしょに うごく・はみ出したら すべる
                        fvx = svx / sn; fvy = svy / sn;
                        const cx = sx / sn, cy = sy / sn, ox = c.x - cx, oy = c.y - cy, od = Math.hypot(ox, oy);
                        c.ttx = ox / D * 0.9; c.tty = oy / D * 0.9;
                        if (c.ball) { c.ttx = 0; c.tty = 0; if (od > 2) { c.x += ox / od * 30 * dt; c.y += oy / od * 30 * dt; } }
                        else if (sn === 1 && od > R * 0.55) { const a = P.slide * (od / R - 0.55) * dt; c.x += ox / od * a * dt * 60; c.y += oy / od * a * dt * 60; }
                    } else { c.ttx = 0; c.tty = 0; }
                } else { c.ttx = c.tx; c.tty = c.ty; }
                c.fvx = fvx; c.fvy = fvy; c.push = push;
            }
            for (const c of coins) {
                c.vx = (c.x - c.px) / dt; c.vy = (c.y - c.py) / dt;
                if (c.z > c.pz && c.on) c.vz = 0;
                if (c.on) {                                     // まさつ
                    const k = c.on === 2 || c.push ? P.carry : c.ball ? P.roll : P.table;
                    c.vx += (c.fvx - c.vx) * k; c.vy += (c.fvy - c.vy) * k;
                    c.spin *= 0.8;
                } else { c.vx *= 0.995; c.vy *= 0.995; c.spin += (c.vy > 0 ? 1 : -1) * dt * 6; }
                const lim = 600; c.vx = Math.max(-lim, Math.min(lim, c.vx)); c.vy = Math.max(-lim, Math.min(lim, c.vy));
                // かたむき (なめらかに)
                c.tx += (c.ttx - c.tx) * 0.25; c.ty += (c.tty - c.ty) * 0.25;
                c.level = c.z >= P.HU - T * 0.6 && c.y <= P.UE + R ? 1 : 0;
                // 落ちた
                if (c.z < -80) {
                    c.gone = true;
                    const sd = !!(P.side && (c.x < P.side || c.x > P.FW - P.side));
                    if (c.ball) ev.special.push({ kind: c.kind, side: sd });
                    else if (sd) ev.side++;
                    else ev.pay++;
                }
            }
            for (let i = coins.length - 1; i >= 0; i--) if (coins[i].gone) coins.splice(i, 1);
        }
        function step(dt = 1000 / 60) { const s = dt / 1000 / P.sub; for (let i = 0; i < P.sub; i++) substep(s); }
        function take() { const e = { pay: ev.pay, side: ev.side, drop: ev.drop, special: ev.special.slice() }; ev.pay = 0; ev.side = 0; ev.drop = 0; ev.special = []; return e; }
        const count = level => coins.filter(c => !c.ball && (level === undefined || c.level === level)).length;
        const balls = () => coins.filter(c => c.ball);
        // セーブ用
        function snapshot() { return coins.map(c => [Math.round(c.x), Math.round(c.y), Math.round(c.z * 10) / 10, c.kind === 'medal' ? 0 : c.kind === 'gold' ? 1 : c.kind === 'cball' ? 2 : 3]); }
        function restore(list) { for (const [x, y, z, k] of list || []) add(x, y, z + 0.5, ['medal', 'gold', 'cball', 'sball'][k] || 'medal'); }
        // はじめの 山
        function fill(nUpper, nLower) {
            for (let i = 0; i < nUpper; i++) add(R + rnd() * (P.FW - D), P.pushU.front + P.pushU.stroke + R + rnd() * (P.UE - P.pushU.front - P.pushU.stroke - D), P.HU + 4 + i * 0.35, rnd() < 0.06 ? 'gold' : 'medal');
            for (let i = 0; i < nLower; i++) add(R + rnd() * (P.FW - D), P.pushL.front + P.pushL.stroke + R + rnd() * (P.LE - P.pushL.front - P.pushL.stroke - D - 20), 4 + i * 0.25, rnd() < 0.06 ? 'gold' : 'medal');
            for (let i = 0; i < 360; i++) step();
            take();
        }
        return { P, coins, insert, spill, tower, add, addBall, explode, step, take, fill, count, balls, snapshot, restore, pushers: { upper: pu, lower: pl }, get time() { return t; } };
    }
    const Coin25D = { create, DEF };
    if (typeof module !== 'undefined') module.exports = Coin25D;
    else root.Coin25D = Coin25D;
})(this);
