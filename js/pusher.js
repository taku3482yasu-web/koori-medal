// プッシャーの 物理 (Matter.js)。真上から 見た 2D。メダルは 円 (重力なし・台の まさつは frictionAir)
// 上段・下段の 2 段プッシャー: 上段の 手前から 落ちた メダルは 下段へ、下段の 手前から 落ちた メダルは 払い出し。
// 下段の 手前の 左右の はしは 落とし穴 (店の もの)。画面に ふれない (node でも うごく)
(function (root) {
    const Matter = typeof module !== 'undefined' ? require('./vendor/matter.min.js') : root.Matter;
    const C = typeof module !== 'undefined' ? require('./config.js') : root.CONFIG;
    const { Engine, Bodies, Body, Composite, Events } = Matter;

    function create(opts = {}) {
        const F = C.field;
        const engine = Engine.create({ gravity: { x: 0, y: 0, scale: 0 }, enableSleeping: false });
        engine.positionIterations = 8;
        engine.velocityIterations = 6;
        const world = engine.world;
        const wall = (x, y, w, h) => Bodies.rectangle(x + w / 2, y + h / 2, w, h, { isStatic: true, friction: 0.02, restitution: 0.1, label: 'wall' });
        const walls = [];
        for (const st of [F.upper, F.lower]) {
            walls.push(wall(F.x - 40, st.top - 60, 40, st.edge - st.top + 80));          // 左の かべ
            walls.push(wall(F.x + F.w, st.top - 60, 40, st.edge - st.top + 80));         // 右の かべ
        }
        // 上段の うしろ (メダルが 入る ところ) は プッシャーの 上で ふさぐ
        const pushers = [F.upper, F.lower].map((st, i) => {
            const b = Bodies.rectangle(F.x + F.w / 2, st.top + st.plate / 2, F.w + 4, st.plate, { isStatic: true, friction: 0.05, restitution: 0, label: `pusher${i}` });
            return { body: b, st, phase: i * Math.PI * 0.7 };
        });
        Composite.add(world, [...walls, ...pushers.map(p => p.body)]);
        const medals = new Set();
        let t = 0;
        const events = { pay: 0, side: 0, drop: 0, special: [] };

        function addMedal(x, y, stage, kind = 'medal') {
            const r = kind === 'ball' ? C.field.ballR : C.field.medalR;
            const b = Bodies.circle(x, y, r, { frictionAir: C.field.air, friction: 0.04, frictionStatic: 0.2, restitution: 0.15, density: kind === 'ball' ? 0.004 : 0.002, label: kind });
            b.plugin = { stage, kind };
            Composite.add(world, b);
            medals.add(b);
            return b;
        }
        // 入れた メダルが 上段に 落ちる (x = 入れた 位置)
        function insert(x) {
            const st = F.upper;
            const y = pusherFront(0) + C.field.medalR + 2 + Math.random() * 18;
            return addMedal(clampX(x + (Math.random() - 0.5) * 10), y, 0);
        }
        // フィールドに 放出 (当たり)。stage 0 = 上段
        function spill(n, stage = 0) {
            for (let i = 0; i < n; i++) {
                const y = pusherFront(stage) + C.field.medalR + 2 + Math.random() * 40;
                addMedal(F.x + C.field.medalR + Math.random() * (F.w - C.field.medalR * 2), y, stage);
            }
        }
        const clampX = x => Math.max(F.x + C.field.medalR + 1, Math.min(F.x + F.w - C.field.medalR - 1, x));
        // プッシャーの 前の はし (いまの 位置)
        function pusherFront(i) { const p = pushers[i]; return p.body.position.y + p.st.plate / 2; }
        function placePushers() {
            for (const p of pushers) {
                const off = (1 - Math.cos(t * 2 * Math.PI / p.st.period + p.phase)) / 2 * p.st.stroke;
                const y = p.st.top + p.st.plate / 2 + off;
                const vy = y - p.body.position.y;
                Body.setPosition(p.body, { x: p.body.position.x, y });
                Body.setVelocity(p.body, { x: 0, y: vy }); // 押した ときに メダルに 速さを つたえる
            }
        }
        // 1 コマ すすめる (dt ms)
        function step(dt = 1000 / 60) {
            t += dt / 1000;
            placePushers();
            Engine.update(engine, dt);
            for (const b of [...medals]) {
                const st = b.plugin.stage === 0 ? F.upper : F.lower;
                const { x, y } = b.position;
                // プッシャーの うしろに もぐった メダルは 前へ もどす (2D なので かさなり よけ)
                const pf = pusherFront(b.plugin.stage);
                if (y < pf - st.plate + 2) Body.setPosition(b, { x, y: pf + 4 });
                if (x < F.x - 30 || x > F.x + F.w + 30) Body.setPosition(b, { x: clampX(x), y });
                if (y > st.edge) {
                    Composite.remove(world, b);
                    medals.delete(b);
                    if (b.plugin.stage === 0) {
                        // 上段から 下段へ 落ちる
                        addMedal(clampX(x + (Math.random() - 0.5) * 6), pusherFront(1) + C.field.medalR + 2 + Math.random() * 14, 1, b.plugin.kind);
                        events.drop++;
                    } else if (x < F.x + F.side || x > F.x + F.w - F.side) { events.side++; if (b.plugin.kind !== 'medal') events.special.push({ kind: b.plugin.kind, side: true }); }
                    else { if (b.plugin.kind === 'medal') events.pay++; else events.special.push({ kind: b.plugin.kind, side: false }); }
                }
            }
        }
        function take() { const e = { pay: events.pay, side: events.side, drop: events.drop, special: events.special.slice() }; events.pay = 0; events.side = 0; events.drop = 0; events.special = []; return e; }
        const count = stage => [...medals].filter(b => stage === undefined || b.plugin.stage === stage).length;
        // セーブ用 (位置だけ)
        function snapshot() { return [...medals].map(b => [Math.round(b.position.x), Math.round(b.position.y), b.plugin.stage, b.plugin.kind === 'medal' ? 0 : 1]); }
        function restore(list) { for (const [x, y, st, k] of list || []) addMedal(x, y, st, k ? 'ball' : 'medal'); }
        // はじめの 山 (フィールドを メダルで うめる)
        function fill(nUpper, nLower) {
            const put = (n, stage) => {
                const st = stage === 0 ? F.upper : F.lower;
                const top = st.top + st.plate + st.stroke + 4, h = st.edge - top - 6;
                const r = C.field.medalR, cols = Math.floor(F.w / (r * 2.1));
                for (let i = 0; i < n; i++) addMedal(F.x + r + 1 + (i % cols) * (F.w - r * 2 - 2) / (cols - 1) + (Math.random() - 0.5) * 2, top + h - r - Math.floor(i / cols) * r * 1.9 + (Math.random() - 0.5) * 2, stage);
            };
            put(nUpper, 0); put(nLower, 1);
            for (let i = 0; i < 120; i++) step();
            take();
        }
        return { engine, world, medals, pushers, insert, spill, step, take, count, pusherFront, snapshot, restore, fill, addMedal, get time() { return t; } };
    }

    const Pusher = { create };
    if (typeof module !== 'undefined') module.exports = Pusher;
    else root.Pusher = Pusher;
})(this);
