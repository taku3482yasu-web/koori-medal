// 画面 (描く・さわる・演出の 順番・セーブ)
// 横長・席に すわった 目線: 下 = プッシャー (遠近・立体の メダル)・上 = 液晶・左 = 氷の 塔・右 = JP ルーレットと ビックボスメダルタワー
(() => {
    const C = CONFIG, F = C.field;
    const $ = id => document.getElementById(id);
    const cv = $('stage'), g = cv.getContext('2d');
    const SAVE = 'koori-medal-save-v2';   // v2 = メダルの 物理を coin25d に した (2026-11-18)
    const params = new URLSearchParams(location.search);
    let s, P;
    let aimX = F.x + F.w / 2, holding = false, holdT = 0;
    const inflight = [];   // 入れて 落ちて いる メダル (見た目)
    const fx = [];         // 文字・つぶ
    let pending = 0;       // まだ 見せて いない 払い出し (塔・ルーレット・JP) → メダルの 数の 表示を おくらせる
    let t = 0, shake = 0, flash = 0;
    // 2026-11-18 ユーザー: 画面を すっきり。ふだんは 台と 液晶だけ。氷の 塔・ルーレットは 始まったら その 画面へ うつる
    const TOWER = { x: 340, w: 320, base: 596, stages: [500, 386, 272], top: 168 };   // 氷の 塔の 画面
    const RM = { x: 500, y: 352, rx: 360, q: 0.40 };                                  // ルーレットマシン (玉を 回して 入れる)
    const LCD = { x: 290, y: 10, w: 420, h: 152 };
    const HOLD_COL = { blue: '#3a7ae0', aqua: '#6ae8ff', gold: '#ffd75e' };
    const HOLD_X = i => LCD.x + 52 + i * 22;
    // ----- 遠近 (台の 座標 → 画面) -----
    const PCX = 500, PYB = 252, PYF = 612, PWF = 900, ZK = 0.95;
    const psc = t => 0.46 + 0.54 * t;
    const ppy = t => PYB + (PYF - PYB) * (t * 1.5) / (1 + 0.5 * t);
    const tFromY = y => { const k = Math.max(0, Math.min(1, (y - PYB) / (PYF - PYB))); return k / (1.5 - 0.5 * k); };

    // ----- セーブ -----
    function save() {
        try { localStorage.setItem(SAVE, JSON.stringify({ s, field: P.snapshot() })); } catch (e) { /* なし */ }
    }
    function load() {
        try { const v = JSON.parse(localStorage.getItem(SAVE)); return v && v.s && v.s.version === 1 ? v : null; } catch (e) { return null; }
    }
    function start() {
        const v = !params.get('fresh') && load();
        P = Coin25D.create({ side: F.side, seed: (Math.random() * 2 ** 31) | 0, R: F.medalR, T: F.medalT, RB: F.ballR });
        if (v) { s = v.s; s.shared.boss = null; P.restore(v.field); for (let i = 0; i < 40; i++) P.step(); P.take(); }
        else {
            s = Game.newState(params.get('seed') ? Number(params.get('seed')) : Math.floor(Math.random() * 2 ** 31));
            P.fill(F.startUpper, F.startLower);
            for (let i = 0; i < C.fieldBall.start; i++) P.addBall(i < C.fieldBall.startSpecial ? 'sball' : 'cball', 60 + i * 100);
            for (let i = 0; i < 90; i++) P.step(); P.take();
        }
        if (params.get('medals')) s.seats[0].medals = Number(params.get('medals'));
        if (params.get('boss')) { s.shared.gauge = C.boss.gauge.full - 1; }
        if (params.get('ball')) s.seats[0].balls += Number(params.get('ball'));
        Sound.play('normal');
        requestAnimationFrame(loop);
        setInterval(save, 4000);
        addEventListener('visibilitychange', () => { if (document.hidden) save(); });
    }
    const me = () => s.seats[0];

    // ----- 入れる -----
    function doInsert() {
        if (me().medals <= 0) { noMedals(); return; }
        const r = Game.insert(s);
        if (!r) return;
        Sound.se('insert');
        const e = Game.entry(s, aimX);
        const over = C.chakkers.find(c => Math.abs(e.x - F.x - c.x) < c.w / 2);
        inflight.push({ x: e.x, t: 0, chakker: e.chakker, over: over ? over.id : null });
        if (r.bossStart) bossSelect();
    }
    function noMedals() {
        if (inflight.length || slot.phase !== 'idle' || tw.phase !== 'idle' || rl.phase !== 'idle' || boss.phase !== 'idle') return;
        if (P.count() > 0 && me().medals <= 0 && !noMedals.asked) {
            noMedals.asked = true;
            popup(`<h2>メダルが なくなった…</h2><p>ふるカワ「こおりくん、${C.freeMedals.give} 枚 わたすよ。もう 一度 がんばって！」</p><button class="big" id="free-ok">うけとる</button>`, () => { $('free-ok').onclick = () => { me().medals += C.freeMedals.give; noMedals.asked = false; closePopup(); save(); }; });
        }
    }
    // 画面の 点 → ねらう 位置 (台の 前の 座標 F.x〜F.x+F.w)。台の 外なら null
    function aimFrom(p) {
        if (p.y < PYB - 40 || p.y > C.H) return null;
        const tt = tFromY(p.y), u = (p.x - PCX) / (PWF * psc(tt)) + 0.5;
        if (u < -0.06 || u > 1.06) return null;
        return F.x + Math.max(12, Math.min(F.w - 12, u * F.w));
    }
    // 画面の 点 → 台の 座標。縦向きの スマホで 画面ごと 90° 回して いる ときは 向きを もどす
    function toStage(e) {
        const r = cv.getBoundingClientRect();
        if (document.body.classList.contains('rot')) return { x: (e.clientY - r.top) * C.W / r.height, y: (r.right - e.clientX) * C.H / r.width };
        return { x: (e.clientX - r.left) * C.W / r.width, y: (e.clientY - r.top) * C.H / r.height };
    }
    // スマホは 横画面で 遊ぶ (2026-11-18 ユーザー)。縦向きなら 画面ごと 回す・横向きで 高さが ひくければ 左に 数字の 列
    const phone = () => params.get('phone') === '1' || (matchMedia('(pointer: coarse)').matches && Math.min(innerWidth, innerHeight) <= 820);
    function layout() {
        const ph = phone(), rot = ph && innerHeight > innerWidth;
        document.body.classList.toggle('rot', rot);
        document.body.classList.toggle('land', rot || (innerWidth > innerHeight && innerHeight <= 600));
    }
    layout();
    addEventListener('resize', layout); addEventListener('orientationchange', () => setTimeout(layout, 200));
    // Android など: 最初に さわった ときに 全画面に して 横向きに 固定 (できない ブラウザでは 画面ごと 回す まま)
    let triedFull = false;
    function goLandscape() {
        if (triedFull || !phone()) return; triedFull = true;
        const el = document.documentElement;
        if (!el.requestFullscreen) return;
        el.requestFullscreen({ navigationUI: 'hide' }).then(() => screen.orientation && screen.orientation.lock ? screen.orientation.lock('landscape') : null).catch(() => {});
    }
    cv.addEventListener('pointerdown', e => {
        goLandscape();
        const p = toStage(e);
        const a = aimFrom(p); if (a === null) return;
        aimX = a;
        holding = true; holdT = 0;
        doInsert();
        cv.setPointerCapture(e.pointerId);
    });
    cv.addEventListener('pointermove', e => { const p = toStage(e); if (holding || e.pointerType === 'mouse') { const a = aimFrom(p); if (a !== null) aimX = a; } });
    const stopHold = () => { holding = false; };
    cv.addEventListener('pointerup', stopHold); cv.addEventListener('pointercancel', stopHold);
    addEventListener('keydown', e => {
        if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) { holding = true; holdT = 0; doInsert(); } }
        if (e.code === 'ArrowLeft') aimX = Math.max(F.x + 12, aimX - 20);
        if (e.code === 'ArrowRight') aimX = Math.min(F.x + F.w - 12, aimX + 20);
    });
    addEventListener('keyup', e => { if (e.code === 'Space') holding = false; });

    // ----- 液晶スロット -----
    const slot = { phase: 'idle', sp: null, t: 0, stops: [], shown: [null, null, null], battle: 0 };
    function slotUpdate(dt) {
        if (slot.phase === 'idle') {
            if (!me().hold.length) return;
            slot.sp = Game.spin(s);
            slot.t = 0;
            const extra = slot.sp.reach ? 1200 : 0;
            slot.stops = [C.slot.spinMs, C.slot.spinMs + C.slot.stopMs, C.slot.spinMs + C.slot.stopMs * 2 + extra];
            slot.shown = [null, null, null];
            slot.phase = 'spin';
            if (slot.sp.okagappa) { say('okagappa', 'チャンス！ YO！', '#7fe0a0'); Sound.se('okagappa'); }
            return;
        }
        slot.t += dt;
        if (slot.phase === 'spin') {
            slot.stops.forEach((at, i) => { if (slot.t >= at && !slot.shown[i]) { slot.shown[i] = slot.sp.reels[i]; Sound.se('stop'); if (i === 1 && slot.sp.reels[0] === slot.sp.reels[1]) Sound.se('reach'); } });
            if (slot.t >= slot.stops[2] + 200) {
                slot.phase = 'show'; slot.t = 0;
                const r = slot.sp.result;
                if (r !== 'miss') Sound.se('hit');
                if (r === 'battle') { slot.phase = 'battle'; slot.battle = 0; Sound.se('roar'); }
                else if (r !== 'miss') say('koori', (C.slot.table.find(x => x.id === r) || {}).text || `${(C.slot.table.find(x => x.id === r) || {}).name}！`, '#ffd75e');
            }
        } else if (slot.phase === 'battle') {
            if (slot.t > 2600) { slot.phase = 'show'; slot.t = 0; if (slot.sp.battleWin) { Sound.se('win'); say('koori', 'おにおにに 勝った！ ボール ゲット！', '#ffd75e'); } else { Sound.se('lose'); say('onioni', 'がっはっは！ おれの 勝ちだ！', '#ff8a8a'); } }
        } else if (slot.phase === 'show') {
            if (slot.t > (slot.sp.result === 'miss' ? 350 : 900)) {
                const r = Game.applySpin(s, slot.sp);
                if (r.spill) { P.spill(r.spill, 0); text(`+${r.spill} 枚 放出！`, PCX, PYB + 40, '#ffd75e', 22); }
                if (r.fball) { P.addBall(r.fball); text(r.fball === 'sball' ? 'スペシャルボール 追加！' : 'こおりボール 追加！', PCX, PYB + 20, r.fball === 'sball' ? '#ffd75e' : '#8fdcff', 22); Sound.se('hit'); }
                if (r.ball) { text('ボール ゲット！', TOWER.x + TOWER.w / 2, TOWER.base - 40, '#8fdcff', 20); }
                if (r.bossStart) bossSelect();
                slot.phase = 'idle';
            }
        }
    }

    // ----- 氷の 塔 -----
    const tw = { phase: 'idle', run: null, t: 0, k: 0, cracks: 0 };
    function towerUpdate(dt) {
        if (tw.phase === 'idle') {
            if (srJp && rl.phase === 'idle') { srJp = false; tw.phase = 'wait'; rouletteStart(); return; }
            // 2026-11-18 ユーザー: ルーレットが 当たったのに 何も 出ない → スペシャルルーレットが 先 (塔の 画面に かくれて いた)
            if (me().balls <= 0 || rl.phase !== 'idle' || sr.phase !== 'idle' || sr.queue.length) return;
            tw.run = Game.tower(s);
            tw.t = 0; tw.k = -1; tw.phase = 'lift'; tw.cracks = 0;
            if (tw.run.end === 'pay') pending += tw.run.medals;
            say('okagappa', 'ボールを 塔へ はこぶぜ！', '#7fe0a0');
            return;
        }
        tw.t += dt;
        if (tw.phase === 'lift' && tw.t > 1100) { tw.phase = 'climb'; tw.t = 0; tw.k = 0; Sound.se('up'); }
        else if (tw.phase === 'climb' && tw.t > C.towerStepMs) {
            const st = tw.run.steps[tw.k];
            tw.t = 0;
            if (st.go === 'up') {
                tw.cracks++; Sound.se('crack');
                text('上へ！', TOWER.x + TOWER.w / 2, TOWER.stages[tw.k] - 46, '#8fdcff', 26);
                if (tw.k + 1 >= C.tower.length) { tw.phase = 'top'; Sound.se('hit'); say('koori', 'てっぺんだ！ JP ルーレットへ！', '#ffd75e'); }
                else { tw.k++; Sound.se('up'); if (tw.k === 1) say('onioni', 'ここから 先は 通さんぞ！', '#ff8a8a'); }
            } else if (st.go === 'pay') { tw.phase = 'end'; Sound.se('pay'); pending -= tw.run.medals; text(`+${tw.run.medals} 枚`, TOWER.x + TOWER.w / 2, TOWER.stages[tw.k] - 30, '#ffd75e', 24); }
            else { tw.phase = 'end'; Sound.se('fall'); say('onioni', 'がっはっは！ 落ちろ！', '#ff8a8a'); text('落下…', TOWER.x + TOWER.w / 2, TOWER.stages[tw.k] - 46, '#ff9a9a', 26); }
        } else if (tw.phase === 'top' && tw.t > 900) { tw.phase = 'wait'; rouletteStart(); }
        else if (tw.phase === 'end' && tw.t > 1500) tw.phase = 'idle';
        else if (tw.phase === 'wait' && rl.phase === 'idle') tw.phase = 'idle';
    }

    // ----- JP ルーレット -----
    const rl = { phase: 'idle', res: null, t: 0, ang: 0, from: 0, to: 0, ball: 0 };
    function rouletteStart() {
        rl.res = Game.roulette(s);
        if (rl.res.kind === 'medals') pending += rl.res.medals;
        if (rl.res.kind === 'jp') pending += rl.res.pay;
        rl.phase = 'spin'; rl.t = 0;
        rl.wheel = wheelNew(C.roulette.pockets.length, rl.res.idx);
        Sound.play('roulette');
    }
    function rouletteUpdate(dt) {
        if (rl.phase === 'idle') return;
        rl.t += dt;
        if (rl.phase === 'spin') {
            const k = Math.min(KL + 0.01, rl.t / C.roulette.spinMs);
            wheelTick(rl.wheel, k);
            Sound.thin(1 - k * 0.8);
            if (k >= KL + 0.01) {
                rl.phase = 'result'; rl.t = 0; Sound.thin(1);
                resultFx(rl.res, true);
                const r = rl.res;
                if (r.kind === 'jp') { jpStart(r); }
                else if (r.kind === 'again') { Sound.se('okagappa'); say('okagappa', 'もう 一回！', '#7fe0a0'); }
                else { Sound.se('pay'); pending -= r.medals; }
            }
        } else if (rl.phase === 'result') {
            wheelTick(rl.wheel, KL + 0.01 + rl.t / C.roulette.spinMs);
            if (rl.t < (rl.res.kind === 'jp' ? 7000 : RESULT_MS)) return;
            if (rl.res.kind === 'again') { rouletteStart(); return; }
            rl.phase = 'idle'; Sound.play(boss.phase === 'fight' ? 'boss' : 'normal');
        }
    }
    let jpFx = null;
    function jpStart(r) {
        Sound.play('jp'); Sound.se('jp'); shake = 30; flash = 1;
        jpFx = { t: 0, r };
        say('koori', `こおりJP！！ ${r.medals.toLocaleString()} 枚！！`, '#ffd75e');
        pending -= r.pay;
        // 塔が ぜんぶ くだけて メダルの 山に かわる (放出)
        let left = r.spill;
        const drop = () => { const n = Math.min(12, left); if (n > 0) { P.spill(n, 0); left -= n; setTimeout(drop, 120); } };
        setTimeout(drop, 1200);
    }

    // ----- 台の ボール と スペシャルルーレット -----
    const sr = { phase: 'idle', res: null, t: 0, ang: 0, from: 0, to: 0, queue: [] };
    function fieldBallDrop(kind) {
        const r = Game.fieldBall(s, kind);
        if (r.kind === 'medals' && !r.special) { Sound.se('pay'); text(`こおりボール +${r.medals} 枚`, PCX, PYF - 30, '#8fdcff', 24); say('koori', `ボールが 落ちた！ ${r.medals} 枚！`, '#8fdcff'); return; }
        if (r.medals) pending += r.medals;
        sr.queue.push(r);
        say('okagappa', 'スペシャルボール！ スペシャルルーレット だ YO！', '#ffd75e'); Sound.se('okagappa');
    }
    function srUpdate(dt) {
        if (sr.phase === 'idle') {
            if (!sr.queue.length) return;
            if (rl.phase !== 'idle' || (tw.phase !== 'idle' && tw.phase !== 'wait')) return;   // 塔・JP ルーレットの あとで
            sr.res = sr.queue.shift(); sr.phase = 'spin'; sr.t = 0;
            sr.wheel = wheelNew(C.specialRoulette.pockets.length, sr.res.idx);
            return;
        }
        sr.t += dt;
        if (sr.phase === 'spin') {
            const k = Math.min(KL + 0.01, sr.t / C.specialRoulette.spinMs);
            wheelTick(sr.wheel, k);
            if (k >= KL + 0.01) {
                sr.phase = 'result'; sr.t = 0;
                const r = sr.res;
                resultFx(r, false);
                if (r.kind === 'medals') { Sound.se('pay'); pending -= r.medals; }
                else if (r.kind === 'ball') { Sound.se('hit'); say('okagappa', '氷の 塔の ボール ゲット！', '#7fe0a0'); }
                else if (r.kind === 'boss') { Sound.se('roar'); say('furukawa', `ボスゲージ アップ！`, '#ff8a8a'); if (r.bossStart) bossSelect(); }
                else { Sound.se('hit'); say('koori', 'JP ルーレットへ 直行だ！', '#ffd75e'); }
            }
        } else if (sr.phase === 'result') {
            wheelTick(sr.wheel, KL + 0.01 + sr.t / C.specialRoulette.spinMs);
            if (sr.t < RESULT_MS) return;
            if (sr.res.kind === 'jpc') srJp = true;
            sr.phase = 'idle';
        }
    }
    let srJp = false;
    // ルーレットの 結果を 見せる 時間と 札
    const RESULT_MS = 3200;
    let resBoard = null;
    function resultFx(r, jp) {
        const v = (jp ? C.roulette.pockets : C.specialRoulette.pockets)[r.idx];
        let big, sub, col = '#ffd75e';
        if (r.kind === 'jp') { big = 'こおりJP!!'; sub = `${r.medals.toLocaleString()} 枚！`; }
        else if (r.kind === 'again') { big = 'もう 1回！'; sub = 'もう 一度 ルーレットを 回す'; col = '#7fe0a0'; }
        else if (r.kind === 'medals') { big = `+${r.medals} 枚 ゲット！`; sub = 'メダルが ふえた'; }
        else if (r.kind === 'ball') { big = '氷の 塔の ボール +1'; sub = 'このあと 氷の 塔へ (てっぺんで JP ルーレット)'; col = '#8fdcff'; }
        else if (r.kind === 'boss') { big = 'ボスゲージ アップ！'; sub = 'ゲージが いっぱいで ビックボスチャレンジ'; col = '#ff8a8a'; }
        else { big = 'JP ルーレットへ！'; sub = 'このあと JP ルーレットを 回す'; }
        resBoard = { big, sub, col, v, t: 0, jp };
        flash = Math.max(flash, 0.35);
    }
    function drawResBoard(dt) {
        if (!resBoard) return;
        resBoard.t += dt;
        const ph = resBoard.jp ? rl.phase : sr.phase;
        if (ph !== 'result') { resBoard = null; return; }
        const k = Math.min(1, resBoard.t / 220), w = 520, h = 112, x = RM.x - w / 2, y = 470;
        g.save(); g.globalAlpha = k; g.translate(RM.x, y + h / 2); g.scale(0.8 + 0.2 * k, 0.8 + 0.2 * k); g.translate(-RM.x, -(y + h / 2));
        g.fillStyle = 'rgba(0,0,0,0.78)'; rr(x, y, w, h, 18); g.fill();
        g.strokeStyle = resBoard.col; g.lineWidth = 4; rr(x, y, w, h, 18); g.stroke();
        g.textAlign = 'center'; g.font = '44px "DotGothic16", monospace'; g.strokeStyle = '#000'; g.lineWidth = 7;
        g.fillStyle = Math.floor(t / 200) % 2 ? resBoard.col : '#ffffff'; g.strokeText(resBoard.big, RM.x, y + 54); g.fillText(resBoard.big, RM.x, y + 54);
        g.font = 'bold 16px "M PLUS Rounded 1c", sans-serif'; g.fillStyle = '#ffffff'; g.fillText(resBoard.sub, RM.x, y + 90);
        g.restore();
    }   // スペシャルルーレットの「JP ルーレットへ」(塔と ルーレットが あいたら 回す)
    // ===== ルーレットマシン (カジノの ように 玉を 回して ポケットに 入れる) =====
    // 結果 (idx) は 先に きまって いる。円盤は 右回り・玉は 左回りで まわり、だんだん 内がわへ 落ちて idx に 入る
    const KL = 0.78;   // 玉が ポケットに 入る とき (spinMs の 割合)
    function wheelNew(n, idx) {
        const seg = Math.PI * 2 / n, w0 = Math.random() * Math.PI * 2, W = Math.PI * 2 * 1.6;
        const wAt = k => w0 + W * (1 - Math.pow(1 - Math.min(k, 1.6) / 1.6, 2));       // 円盤 (ゆっくり 止まる)
        const land = wAt(KL) + (idx + 0.5) * seg;                                       // 入る ときの ポケットの 向き
        const b0 = Math.random() * Math.PI * 2;
        let B = b0 - land; B = ((B % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) + Math.PI * 2 * 7;   // 玉は 7 周 ちょっと
        return { n, idx, seg, wAt, b0, B, w: w0, b: b0, r: 1, h: 1, last: 0, seated: false };
    }
    // k = 0〜1 (1 より 先は 止まった あと)。r = 半径の 割合 (1 = 外の みぞ)・h = 玉の 高さ
    function wheelTick(W, k) {
        W.w = W.wAt(k);
        if (k < KL) {
            const x = k / KL, e = 1 - Math.pow(1 - x, 2.2);
            W.b = W.b0 - W.B * e;
            if (x < 0.62) { W.r = 1; W.h = 1; }
            else { const y = (x - 0.62) / 0.38; W.r = 1 - 0.36 * y * y + Math.sin(y * Math.PI * 4) * (1 - y) * 0.05; W.h = Math.abs(Math.sin(y * Math.PI * 4)) * (1 - y) * 0.8; }
            const tick = Math.floor((W.b - W.w) / W.seg);
            if (x > 0.62 && tick !== W.last) Sound.se('tick');
            W.last = tick;
        } else {
            if (!W.seated) { W.seated = true; Sound.se('stop'); }
            W.b = W.w + (W.idx + 0.5) * W.seg; W.r = 0.64; W.h = 0;
        }
    }
    // 円盤の 上の 点 (a = 角度・r = 半径 px・z = 高さ px)
    const WP = (a, r, z = 0) => [RM.x + Math.cos(a) * r, RM.y + Math.sin(a) * r * RM.q - z];
    function ring(a0, a1, r0, r1, z0 = 0, z1 = z0) {
        g.beginPath();
        const st = Math.max(2, Math.ceil((a1 - a0) / 0.08));
        for (let i = 0; i <= st; i++) { const [x, y] = WP(a0 + (a1 - a0) * i / st, r1, z1); i ? g.lineTo(x, y) : g.moveTo(x, y); }
        for (let i = st; i >= 0; i--) { const [x, y] = WP(a0 + (a1 - a0) * i / st, r0, z0); g.lineTo(x, y); }
        g.closePath();
    }
    function drawWheelScene(kind) {
        const jp = kind === 'jp', W = jp ? rl.wheel : sr.wheel;
        const pockets = jp ? C.roulette.pockets : C.specialRoulette.pockets;
        if (!W) return;
        // 背景 (カジノ)
        const bg = g.createRadialGradient(RM.x, RM.y, 40, RM.x, RM.y, 620); bg.addColorStop(0, jp ? '#123a2a' : '#2a1240'); bg.addColorStop(1, '#03060a');
        g.fillStyle = bg; g.fillRect(0, 0, C.W, C.H);
        for (let i = 0; i < 5; i++) { const x = 100 + i * 200, sp = g.createRadialGradient(x, -30, 4, x, -30, 240); sp.addColorStop(0, 'rgba(255,230,160,0.16)'); sp.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = sp; g.fillRect(x - 240, 0, 480, 280); }
        // 題
        g.textAlign = 'center'; g.fillStyle = '#ffd75e'; g.font = '30px "DotGothic16", monospace';
        g.strokeStyle = '#000'; g.lineWidth = 5; const title = jp ? 'JP ルーレット' : 'スペシャルルーレット';
        g.strokeText(title, RM.x, 46); g.fillText(title, RM.x, 46);
        if (jp) { g.font = '16px "M PLUS Rounded 1c", sans-serif'; g.fillStyle = '#fff'; g.fillText(`こおりJP ${Math.floor(s.shared.jp).toLocaleString()} 枚`, RM.x, 74); }
        const R0 = RM.rx;                         // 外わく
        // 台 (木と 金の わく)
        g.fillStyle = 'rgba(0,0,0,0.5)'; g.beginPath(); g.ellipse(RM.x, RM.y + 30, R0 + 20, (R0 + 20) * RM.q, 0, 0, 7); g.fill();
        g.fillStyle = '#4a2a14'; g.beginPath(); g.ellipse(RM.x, RM.y + 16, R0, R0 * RM.q, 0, 0, 7); g.fill();
        const wood = g.createLinearGradient(0, RM.y - R0 * RM.q, 0, RM.y + R0 * RM.q); wood.addColorStop(0, '#8a5a2a'); wood.addColorStop(1, '#5a3418');
        g.fillStyle = wood; g.beginPath(); g.ellipse(RM.x, RM.y, R0, R0 * RM.q, 0, 0, 7); g.fill();
        g.strokeStyle = '#e8c050'; g.lineWidth = 3; g.beginPath(); g.ellipse(RM.x, RM.y, R0 - 6, (R0 - 6) * RM.q, 0, 0, 7); g.stroke();
        // 玉の みぞ (すりばち)
        const RT = R0 - 22, RD = R0 - 70, RP1 = R0 - 96, RP0 = R0 - 150, RL0 = R0 - 214;
        const bowl = g.createRadialGradient(RM.x, RM.y - 40, 40, RM.x, RM.y, R0); bowl.addColorStop(0, '#0e1c2c'); bowl.addColorStop(1, '#2a3a52');
        g.fillStyle = bowl; g.beginPath(); g.ellipse(RM.x, RM.y, RT, RT * RM.q, 0, 0, 7); g.fill();
        g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 1; g.beginPath(); g.ellipse(RM.x, RM.y, RT - 8, (RT - 8) * RM.q, 0, 0, 7); g.stroke();
        // ダイヤ (玉が はねる 金の かざり)
        for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 + 0.2, [x, y] = WP(a, RD + 14); g.fillStyle = '#ffe890'; g.beginPath(); g.moveTo(x, y - 5); g.lineTo(x + 9, y); g.lineTo(x, y + 5); g.lineTo(x - 9, y); g.fill(); }
        // まわる 円盤: ポケットと 文字
        const n = pockets.length, seg = Math.PI * 2 / n;
        const col = (v, i) => jp ? (v === 'jp' ? '#ffd75e' : v === 'again' ? '#1aa060' : i % 2 ? '#c02030' : '#16161e')
                                 : (v === 'jpc' ? '#ffd75e' : v === 'ball' ? '#2a7ad0' : v === 'boss' ? '#c02030' : v >= 100 ? '#e8a020' : i % 2 ? '#5a2a90' : '#16161e');
        const label = v => jp ? (v === 'jp' ? 'JP' : v === 'again' ? 'もう1回' : String(v)) : (v === 'jpc' ? 'JP' : v === 'ball' ? 'ボール' : v === 'boss' ? 'ボス' : String(v));
        pockets.forEach((v, i) => {
            const a0 = W.w + i * seg, a1 = a0 + seg;
            ring(a0, a1, RP0, RP1, 6); g.fillStyle = col(v, i); g.fill();                                     // 文字の 帯
            ring(a0, a1, RL0, RP0, 10, 6); g.fillStyle = col(v, i); g.fill(); g.fillStyle = 'rgba(0,0,0,0.35)'; g.fill();   // ポケット (くぼみ)
            const [fx1, fy1] = WP(a0, RL0, 10), [fx2, fy2] = WP(a0, RP1, 6); g.strokeStyle = '#e8c050'; g.lineWidth = 2; g.beginPath(); g.moveTo(fx1, fy1); g.lineTo(fx2, fy2); g.stroke();   // 金の しきり
            const am = a0 + seg / 2, [lx, ly] = WP(am, (RP0 + RP1) / 2, 6), front = Math.sin(am);
            g.fillStyle = (jp && v === 'jp') || (!jp && v === 'jpc') ? '#6a3a00' : '#fff';
            g.font = `bold ${Math.round((n > 16 ? 12 : 15) * (0.8 + 0.25 * front))}px "DotGothic16", monospace`; g.textAlign = 'center';
            g.fillText(label(v), lx, ly + 4);
        });
        g.strokeStyle = '#e8c050'; g.lineWidth = 2; g.beginPath(); g.ellipse(RM.x, RM.y - 6, RP1, RP1 * RM.q, 0, 0, 7); g.stroke();
        // まんなかの 塔 (こおりくん)
        const cg = g.createRadialGradient(RM.x - 20, RM.y - 30, 6, RM.x, RM.y - 10, RL0); cg.addColorStop(0, '#fff8d0'); cg.addColorStop(0.5, '#e8c050'); cg.addColorStop(1, '#8a5a10');
        g.fillStyle = cg; g.beginPath(); g.ellipse(RM.x, RM.y - 10, RL0, RL0 * RM.q, 0, 0, 7); g.fill();
        for (let i = 0; i < 4; i++) { const a = W.w * 1 + i * Math.PI / 2, [x, y] = WP(a, RL0 * 0.8, 34); g.strokeStyle = '#ffe890'; g.lineWidth = 5; g.beginPath(); g.moveTo(RM.x, RM.y - 44); g.lineTo(x, y); g.stroke(); g.fillStyle = '#ffe890'; g.beginPath(); g.arc(x, y, 6, 0, 7); g.fill(); }
        Art.draw(g, 'koori', RM.x, RM.y - 30, { height: 54, frame: Math.floor(t / 200) });
        // 玉
        const RPm = (RL0 + RP0) / 2 + 4, rr_ = W.r >= 1 ? RT - 20 : RPm + (RT - 20 - RPm) * Math.max(0, (W.r - 0.64) / 0.36), z = 6 + W.h * 26;
        const [bx, by] = WP(W.b, rr_, z);
        g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.ellipse(bx, by + z * 0.9 + 4, 10, 4, 0, 0, 7); g.fill();
        const bgd = g.createRadialGradient(bx - 4, by - 4, 1, bx, by, 11); bgd.addColorStop(0, '#ffffff'); bgd.addColorStop(0.6, '#e8eef6'); bgd.addColorStop(1, '#8a96a8');
        g.fillStyle = bgd; g.beginPath(); g.arc(bx, by, 11, 0, 7); g.fill();
        // 見て いる キャラ
        Art.draw(g, 'okagappa', 80, 600, { height: 110, frame: Math.floor(t / 160) });
        Art.draw(g, jp ? 'onioni' : 'koori', 920, 600, { height: 100, frame: Math.floor(t / 200), flip: true });
        // 結果 (札)
        drawResBoard(16);
    }
    // 氷の 塔の 画面
    function drawTowerScene() {
        const bg = g.createLinearGradient(0, 0, 0, C.H); bg.addColorStop(0, '#0a2a5a'); bg.addColorStop(1, '#04101e');
        g.fillStyle = bg; g.fillRect(0, 0, C.W, C.H);
        g.fillStyle = 'rgba(255,255,255,0.5)'; for (let i = 0; i < 50; i++) g.fillRect((i * 97 + t * 0.01 * (i % 3 + 1)) % C.W, (i * 53 + t * 0.03 * (i % 4 + 1)) % C.H, 2, 2);
        g.fillStyle = 'rgba(143,220,255,0.08)';
        for (const [x, w, h] of [[40, 70, 300], [120, 60, 220], [800, 70, 280], [880, 80, 340]]) { g.fillRect(x, C.H - h, w, h); g.beginPath(); g.moveTo(x - 4, C.H - h); g.lineTo(x + w / 2, C.H - h - 40); g.lineTo(x + w + 4, C.H - h); g.fill(); }
        g.textAlign = 'center'; g.fillStyle = '#bff0ff'; g.font = '30px "DotGothic16", monospace'; g.strokeStyle = '#000'; g.lineWidth = 5;
        g.strokeText('氷の 塔', 500, 46); g.fillText('氷の 塔', 500, 46);
        g.font = '14px "M PLUS Rounded 1c", sans-serif'; g.fillStyle = '#fff'; g.fillText('ボールが ころがって 止まった 穴で きまる。てっぺんまで 上れば JP ルーレット！', 500, 72);
        drawTower();
        drawTowerGuide();
    }

    // ----- クレーン (ボスを 倒すと ビックボスメダルタワーを 台へ はこび、爆散させる) -----
    const crane = { phase: 'idle', t: 0, n: 0, left: 0 };
    const TOWER_AT = { x: 210, y: 300 };   // 台の 上の 置き場所 (下段の まんなか)
    function craneStart(n, left) { crane.phase = 'carry'; crane.t = 0; crane.n = n; crane.left = left; Sound.se('up'); }
    function craneUpdate(dt) {
        if (crane.phase === 'idle') return;
        crane.t += dt;
        if (crane.phase === 'carry' && crane.t > 2600) {
            crane.phase = 'set'; crane.t = 0;
            P.tower(TOWER_AT.x, TOWER_AT.y, crane.n); Sound.se('stop'); shake = 8;
            say('koori', 'タワー とうちゃく！ …爆散するぞ！', '#ffd75e');
        } else if (crane.phase === 'set' && crane.t > 1200) {
            crane.phase = 'boom'; crane.t = 0;
            P.explode(TOWER_AT.x, TOWER_AT.y, 64, 320); Sound.se('boom'); shake = 34; flash = 0.8;
            let left = crane.left;
            const drop = () => { const k = Math.min(10, left); if (k > 0) { P.spill(k, 1); left -= k; setTimeout(drop, 140); } };
            setTimeout(drop, 300);
        } else if (crane.phase === 'boom' && crane.t > 1200) crane.phase = 'idle';
    }

    // ----- ビックボスチャレンジ -----
    const boss = { phase: 'idle', t: 0, res: null, shown: 0, lastHp: 0, hits: [] };
    function bossSelect() {
        if (boss.phase !== 'idle' || !s.shared.boss) return;
        boss.phase = 'select'; boss.t = 0; boss.res = null;
        Sound.play('boss'); Sound.se('roar');
        say('furukawa', 'ビックボスチャレンジ！ みんなで 強敵を 倒そう！', '#ff8a8a');
    }
    function bossUpdate(dt) {
        if (boss.phase === 'idle') { if (s.shared.boss && !s.shared.boss.started) bossSelect(); return; }
        boss.t += dt;
        const B = s.shared.boss;
        if (boss.phase === 'select') {
            if (B && B.id === 'asoboreas' && boss.t > 1800 && !boss.dark) { boss.dark = true; Sound.se('roar'); shake = 20; }
            if (boss.t > 4200) { boss.phase = 'fight'; boss.t = 0; boss.dark = false; Game.bossGo(s); boss.lastHp = B.hp; const def = C.boss.list.find(x => x.id === B.id); say(B.id === 'asoboreas' ? 'onioni' : 'koori', B.id === 'asoboreas' ? 'アソボレアス だと…！？ みんな にげろ…いや、たたかえ！' : `${def.name}が あらわれた！ ${C.boss.sec} 秒で 倒せ！`, '#ff8a8a'); }
        } else if (boss.phase === 'fight') {
            const res = Game.bossTick(s, dt / 1000);
            const B2 = s.shared.boss;
            if (B2 && B2.hp < boss.lastHp - 0.5) { if (Math.random() < 0.5) Sound.se('attack'); boss.hits.push({ t: 0, x: 500 + (Math.random() - 0.5) * 160, y: 150 + (Math.random() - 0.5) * 80, n: Math.round(boss.lastHp - B2.hp) }); boss.lastHp = B2.hp; }
            if (res) {
                boss.res = res; boss.phase = 'result'; boss.t = 0;
                const n = res.rewards[0];
                if (res.win) { Sound.se('boom'); Sound.se('win'); shake = 40; flash = 1; say('koori', `たおした！ メダルタワーが 爆散！ ${n} 枚！${res.mvp === 0 ? ' MVP で ボールも ゲット！' : ''}`, '#ffd75e'); }
                else { Sound.se('lose'); say('furukawa', `時間 切れ… 残念賞 ${n} 枚`, '#9fb8d8'); }
                if (res.win) { const tn = Math.min(32, n); craneStart(tn, n - tn); }
                else { let left = n; const drop = () => { const k = Math.min(10, left); if (k > 0) { P.spill(k, 0); left -= k; setTimeout(drop, 140); } }; setTimeout(drop, 300); }
            }
        } else if (boss.phase === 'result' && boss.t > 5000) { boss.phase = 'idle'; Sound.play('normal'); save(); }
    }

    // ----- 文字・ひとこと -----
    let talk = null;
    function say(who, msg, color) { talk = { who, msg, color, t: 0 }; }
    function text(msg, x, y, color, size = 18) { fx.push({ msg, x, y, color, size, t: 0 }); }

    // ----- まわす -----
    let last = 0, acc = 0;
    function loop(now) {
        const dt = Math.min(100, last ? now - last : 16);
        last = now; t += dt;
        acc += dt;
        let steps = 0;
        while (acc >= 1000 / 60 && steps < 4) { P.step(1000 / 60); acc -= 1000 / 60; steps++; }
        if (steps >= 4) acc = 0;
        const ev = P.take();
        if (ev.pay) { Game.payout(s, ev.pay); Sound.se('clink'); }
        for (const b of ev.special) {
            if (b.side) { P.addBall(b.kind); continue; }          // 左右の 穴に 落ちた ボールは 台に もどる
            fieldBallDrop(b.kind);
        }
        if (ev.drop) Sound.se('clink');
        if (holding) { holdT += dt; if (holdT >= C.autoMs) { holdT = 0; doInsert(); } }
        for (const m of [...inflight]) {
            m.t += dt;
            if (m.t >= 260) {
                inflight.splice(inflight.indexOf(m), 1);
                if (m.chakker) {
                    const ok = Game.chakker(s);
                    chakFlash[m.chakker] = 1;
                    if (s.shared.boss && s.shared.boss.started) Sound.se('attack');
                    chakkerFx(m.chakker, ok);
                } else if (m.over && !s.shared.boss && t - (missAt[m.over] || -1e9) > 1500) {
                    missAt[m.over] = t; text('おしい', chakkerX(m.over), P3(0, 0, P.P.HU + P.P.pushU.h)[1] + 22, 'rgba(220,235,255,0.8)', 13);
                }
                P.insert(m.x - F.x);
            }
        }
        slotUpdate(dt); towerUpdate(dt); rouletteUpdate(dt); srUpdate(dt); bossUpdate(dt); craneUpdate(dt);
        if (jpFx) { jpFx.t += dt; if (jpFx.t > 7000) jpFx = null; }
        draw(dt);
        hud();
        requestAnimationFrame(loop);
    }
    const chakFlash = {};
    // チャッカーに 入った ことを 見せる (2026-11-18 ユーザー: 保留が ふえる 原理が わかりづらい)
    // 「入賞！ 保留 +1」と 出して、光の 玉が チャッカーから 液晶の 保留ランプへ とぶ。4 個 たまって いたら「保留 MAX」
    const holdFly = [];
    const missAt = {};
    let holdTip = false;
    function chakkerX(id) { const ck = C.chakkers.find(c => c.id === id), l = PCX - PWF * psc(0) / 2, r = PCX + PWF * psc(0) / 2; return l + ck.x / F.w * (r - l); }
    function chakkerFx(id, ok) {
        const x = chakkerX(id), y = P3(0, 0, P.P.HU + P.P.pushU.h)[1] - 24;
        if (s.shared.boss) return;
        if (ok) {
            Sound.se('chakker');
            const n = me().hold.length;
            holdFly.push({ x0: x, y0: y, i: n - 1, t: 0, c: me().hold[n - 1] });
            text('入賞！ 保留 +1', x, y + 46, '#ffd75e', 16);
            if (!holdTip) { holdTip = true; say('okagappa', 'チャッカーに 入ると 保留が 1 つ ふえて、液晶の スロットが 1 回 回る YO！', '#7fe0a0'); }
        } else text('保留 MAX', x, y + 46, '#ff9a9a', 15);
    }

    function hud() {
        $('medals').textContent = Math.max(0, me().medals - pending).toLocaleString();
        $('jp').textContent = Math.floor(s.shared.jp).toLocaleString();
        $('gauge').style.width = `${s.shared.boss ? 100 : Math.min(100, s.shared.gauge / C.boss.gauge.full * 100)}%`;
    }

    // ===== 描く =====
    function draw(dt) {
        g.save();
        if (shake > 0) { g.translate((Math.random() - 0.5) * shake * 0.5, (Math.random() - 0.5) * shake * 0.5); shake *= 0.9; if (shake < 0.5) shake = 0; }
        // 画面の きりかえ: ふだんは 台。塔・ルーレットが 始まったら その 画面へ (ふわっと)
        const want = wantView();
        if (want !== view.name) {
            if (view.name !== 'field' && want !== 'field') { view.name = want; flash = Math.max(flash, 0.5); }
            else { view.k -= dt / 320; if (view.k <= 0) { view.k = 0; view.name = want; } }
        } else if (view.name !== 'field') view.k = Math.min(1, view.k + dt / 320);
        if (view.k < 1) {
            drawBack();
            drawLCD();
            drawField();
            drawInlet();
            drawCrane();
            drawChips();
            drawBoss();
        }
        if (view.name !== 'field' && view.k > 0) {
            g.save(); g.globalAlpha = view.k;
            const z = 0.92 + 0.08 * view.k; g.translate(C.W / 2 * (1 - z), C.H / 2 * (1 - z)); g.scale(z, z);
            if (view.name === 'tower') drawTowerScene(); else drawWheelScene(view.name === 'jpr' ? 'jp' : 'sp');
            g.restore();
        }
        drawFx(dt);
        drawTalk(dt);
        if (jpFx) drawJP();
        g.restore();
        if (flash > 0) { g.fillStyle = `rgba(255,255,255,${flash * 0.6})`; g.fillRect(0, 0, C.W, C.H); flash *= 0.92; if (flash < 0.02) flash = 0; }
        if (boss.dark) { g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(0, 0, C.W, C.H); }
    }
    const view = { name: 'field', k: 0 };
    function wantView() {
        if (tw.phase !== 'idle' && tw.phase !== 'wait') return 'tower';
        if (rl.phase !== 'idle') return 'jpr';
        if (sr.phase !== 'idle') return 'spr';
        return 'field';
    }
    // ふだんの 画面の 小さな 表示 (左うえ: 塔の ボール・右うえ: 台の ボール)
    function drawChips() {
        const chip = (x, y, w, label, val, c) => { g.fillStyle = 'rgba(4,12,28,0.75)'; rr(x, y, w, 30, 15); g.fill(); g.strokeStyle = c; g.lineWidth = 1.5; g.stroke(); g.fillStyle = c; g.font = '12px "M PLUS Rounded 1c", sans-serif'; g.textAlign = 'left'; g.fillText(label, x + 34, y + 20); g.font = 'bold 16px "DotGothic16", monospace'; g.textAlign = 'right'; g.fillText(val, x + w - 12, y + 21); };
        chip(14, 14, 200, '氷の塔 ボール', `×${me().balls}`, '#8fdcff'); ball3d(32, 29, 9, 'cball');
        const bs = P.balls(); chip(786, 14, 200, '台の ボール', `${bs.filter(b => b.kind === 'sball').length}★ ${bs.filter(b => b.kind === 'cball').length}●`, '#ffd75e'); ball3d(804, 29, 9, 'sball');
    }
    function rr(x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
    function drawBack() {
        const gr = g.createLinearGradient(0, 0, 0, C.H);
        gr.addColorStop(0, '#0a1a38'); gr.addColorStop(1, '#04080f');
        g.fillStyle = gr; g.fillRect(0, 0, C.W, C.H);
        // 雪
        g.fillStyle = 'rgba(255,255,255,0.5)';
        for (let i = 0; i < 40; i++) g.fillRect((i * 97 + t * 0.01 * (i % 3 + 1)) % C.W, (i * 53 + t * 0.03 * (i % 4 + 1)) % C.H, 2, 2);
    }
    // 図柄
    function sym(id, x, y, sz) {
        if (['koori', 'onioni', 'okagappa'].includes(id)) { Art.draw(g, id, x, y + sz * 0.45, { height: sz * 0.9 }); return; }
        g.save(); g.translate(x, y);
        if (id === 'ball') { const gr = g.createRadialGradient(-sz * 0.12, -sz * 0.12, 2, 0, 0, sz * 0.35); gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, '#2a8ae0'); g.fillStyle = gr; g.beginPath(); g.arc(0, 0, sz * 0.33, 0, 7); g.fill(); }
        else if (id === 'fball') { const gr = g.createRadialGradient(-sz * 0.12, -sz * 0.12, 2, 0, 0, sz * 0.35); gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.4, '#ffe070'); gr.addColorStop(1, '#b07010'); g.fillStyle = gr; g.beginPath(); g.arc(0, 0, sz * 0.33, 0, 7); g.fill(); g.fillStyle = '#fff'; g.font = `bold ${sz * 0.3}px "DotGothic16", monospace`; g.textAlign = 'center'; g.fillText('★', 0, sz * 0.1); }
        else if (id === 'boss') { g.fillStyle = '#c02030'; rr(-sz * 0.38, -sz * 0.3, sz * 0.76, sz * 0.6, 8); g.fill(); g.fillStyle = '#fff'; g.font = `bold ${sz * 0.26}px "DotGothic16", monospace`; g.textAlign = 'center'; g.fillText('BOSS', 0, sz * 0.09); }
        else if (id === 'ice') { g.fillStyle = '#bff0ff'; g.beginPath(); for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; g.lineTo(Math.cos(a) * sz * 0.34, Math.sin(a) * sz * 0.34); } g.fill(); g.fillStyle = '#4aa8e0'; g.fillRect(-2, -sz * 0.3, 4, sz * 0.6); }
        else { const n = id.slice(1); g.fillStyle = '#e8c040'; g.beginPath(); g.arc(0, 0, sz * 0.33, 0, 7); g.fill(); g.fillStyle = '#fff4b0'; g.beginPath(); g.arc(-3, -3, sz * 0.22, 0, 7); g.fill(); g.fillStyle = '#6a4a00'; g.font = `bold ${sz * 0.28}px "DotGothic16", monospace`; g.textAlign = 'center'; g.fillText(n, 0, sz * 0.1); }
        g.restore();
    }
    function drawLCD() {
        const { x, y, w, h } = LCD;
        const bz = g.createLinearGradient(0, y - 10, 0, y + h + 10); bz.addColorStop(0, '#ffe890'); bz.addColorStop(1, '#a07010');
        g.fillStyle = '#05070c'; rr(x - 10, y - 10, w + 20, h + 20, 14); g.fill();
        g.strokeStyle = bz; g.lineWidth = 3; rr(x - 10, y - 10, w + 20, h + 20, 14); g.stroke();
        const gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, '#0e2c5a'); gr.addColorStop(1, '#081830');
        g.fillStyle = gr; rr(x, y, w, h, 10); g.fill();
        // リール
        for (let i = 0; i < 3; i++) {
            const rx = x + 14 + i * 96, ry = y + 24, rw = 88, rh = 84;
            g.fillStyle = '#eaf6ff'; rr(rx, ry, rw, rh, 8); g.fill();
            g.save(); rr(rx, ry, rw, rh, 8); g.clip();
            if (slot.phase === 'spin' && !slot.shown[i]) {
                const off = (t * 0.9) % 60;
                for (let k = -1; k < 3; k++) sym(C.slot.symbols[(Math.floor(t / 66) + k + i * 3) % C.slot.symbols.length], rx + rw / 2, ry + k * 60 + off, 54);
            } else {
                const id = slot.shown[i] || (slot.sp ? slot.sp.reels[i] : ['koori', 'ice', 'okagappa'][i]);
                sym(id, rx + rw / 2, ry + rh / 2 - 6, 60);
            }
            g.restore();
            if (slot.phase === 'spin' && slot.shown[0] && slot.shown[1] && slot.shown[0] === slot.shown[1] && !slot.shown[2] && i === 2) { g.strokeStyle = `hsl(${t / 3 % 360},90%,60%)`; g.lineWidth = 4; rr(rx, ry, rw, rh, 8); g.stroke(); }
        }
        // 当たり
        if (slot.phase === 'show' && slot.sp && slot.sp.result !== 'miss') { g.strokeStyle = '#ffd75e'; g.lineWidth = 5; rr(x + 10, y + 20, 292, 92, 10); g.stroke(); }
        // 右の キャラ (通常は こおりくん・チャンスで おかがっぱ・バトルで おにおに)
        const cx = x + 360, cy = y + h - 22;
        if (slot.phase === 'battle') {
            Art.draw(g, 'koori', cx - 18, cy, { height: 40, frame: Math.floor(t / 150) });
            Art.draw(g, 'onioni', cx + 30, cy, { height: 50, frame: Math.floor(t / 120), flip: true });
            if (slot.t > 1200) { g.fillStyle = slot.sp.battleWin ? '#ffd75e' : '#ff6060'; g.font = 'bold 18px "DotGothic16", monospace'; g.textAlign = 'center'; g.fillText(slot.sp.battleWin ? 'かち！' : 'まけ…', cx + 6, y + 22); }
            else { g.fillStyle = '#fff'; g.font = '13px "DotGothic16", monospace'; g.textAlign = 'center'; g.fillText('おにおにバトル', cx + 6, y + 22); }
        } else if (slot.phase === 'spin' && slot.sp && slot.sp.okagappa) Art.draw(g, 'okagappa', cx, cy, { height: 60, frame: Math.floor(t / 120) });
        else Art.draw(g, 'koori', cx, cy, { height: 46, frame: Math.floor(t / 400) });
        // 保留 (青 → 水色 → 金)
        // 2026-11-18 ユーザー: 保留が わかりづらい → わくを 4 つ いつも 出して、何個 たまって いるかを 見せる
        const col = HOLD_COL, hy = y + h - 18, flying = holdFly.map(f => f.i);
        g.fillStyle = 'rgba(255,255,255,0.75)'; g.font = 'bold 11px "M PLUS Rounded 1c", sans-serif'; g.textAlign = 'left'; g.fillText('保留', x + 14, hy + 4);
        for (let i = 0; i < C.slot.hold; i++) {
            const hx = HOLD_X(i), c = me().hold[i];
            g.strokeStyle = 'rgba(191,240,255,0.55)'; g.lineWidth = 1.5; g.beginPath(); g.arc(hx, hy, 8, 0, 7); g.stroke();
            if (c && !flying.includes(i)) { g.fillStyle = col[c]; g.beginPath(); g.arc(hx, hy, 7, 0, 7); g.fill(); g.fillStyle = 'rgba(255,255,255,0.7)'; g.beginPath(); g.arc(hx - 2, hy - 2, 2.2, 0, 7); g.fill(); }
        }
        g.fillStyle = me().hold.length >= C.slot.hold ? '#ff9a9a' : 'rgba(255,255,255,0.75)'; g.font = 'bold 11px "DotGothic16", monospace';
        g.fillText(`${me().hold.length}/${C.slot.hold}`, HOLD_X(C.slot.hold - 1) + 14, hy + 4);
        g.fillStyle = 'rgba(191,240,255,0.6)'; g.font = '10px "M PLUS Rounded 1c", sans-serif';
        g.fillText('↓ L・CENTER・R に 入ると +1', HOLD_X(C.slot.hold - 1) + 44, hy + 4);
    }
    // ----- 台 (遠近) -----
    const FW = () => P.P.FW, LE = () => P.P.LE;
    const tOf = y => Math.max(0, (y + 10) / (LE() + 10));
    const sOf = tt => PWF * psc(tt) / FW();
    function P3(x, y, z) { const tt = tOf(y); return [PCX + (x / FW() - 0.5) * PWF * psc(tt), ppy(tt) - z * sOf(tt) * ZK]; }
    function poly(pts, fill) { g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath(); g.fillStyle = fill; g.fill(); }
    const top3 = (y0, y1, z, x0 = 0, x1 = FW()) => [P3(x0, y0, z), P3(x1, y0, z), P3(x1, y1, z), P3(x0, y1, z)];
    const face3 = (y, z0, z1) => [P3(0, y, z1), P3(FW(), y, z1), P3(FW(), y, z0), P3(0, y, z0)];
    // うしろの かべ (チャッカー)・ねらう 位置・入れた メダル
    function drawInlet() {
        // 2026-11-18 ユーザー: 保留の チャッカーが 分かりづらい → 大きく して「保留+1」と 書き、メダルが ▼ から チャッカーの 列を 通って 落ちる ように
        const wy = P3(0, 0, P.P.HU + P.P.pushU.h)[1], l = PCX - PWF * psc(0) / 2, r = PCX + PWF * psc(0) / 2;
        const cy = wy - 22;                                   // チャッカーの 列の まんなか
        g.fillStyle = '#0e2448'; g.beginPath(); g.moveTo(l - 10, wy - 44); g.lineTo(r + 10, wy - 44); g.lineTo(r, wy); g.lineTo(l, wy); g.closePath(); g.fill();
        g.strokeStyle = '#8fdcff'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(l - 10, wy - 44); g.lineTo(r + 10, wy - 44); g.stroke();
        g.fillStyle = 'rgba(191,240,255,0.85)'; g.font = 'bold 12px "M PLUS Rounded 1c", sans-serif'; g.textAlign = 'right';
        g.fillText('チャッカー →', l - 16, cy + 4);
        for (const ck of C.chakkers) {
            const x = l + ck.x / F.w * (r - l), w = ck.w / F.w * (r - l) * 1.5, f = chakFlash[ck.id] || 0, main = ck.id === 'C';
            const aimed = Math.abs(aimX - F.x - ck.x) < ck.w / 2 + C.insertJitter * 0.5;
            if (aimed && f <= 0) { g.fillStyle = `rgba(255,215,94,${0.22 + 0.14 * Math.sin(t / 120)})`; rr(x - w / 2 - 5, cy - 18, w + 10, 36, 12); g.fill(); }
            g.fillStyle = f > 0 ? `rgba(255,215,94,${0.5 + f * 0.5})` : '#02060e';
            rr(x - w / 2, cy - 14, w, 28, 10); g.fill();
            g.strokeStyle = main ? '#ffd75e' : '#8fdcff'; g.lineWidth = 2; g.stroke();
            // 穴 (メダルが 入る 口)
            g.fillStyle = f > 0 ? '#fff6c0' : '#000'; g.beginPath(); g.ellipse(x, cy - 7, w * 0.32, 3.5, 0, 0, 7); g.fill();
            g.strokeStyle = 'rgba(143,220,255,0.5)'; g.lineWidth = 1; g.stroke();
            g.textAlign = 'center'; g.fillStyle = f > 0 ? '#3a2400' : main ? '#ffd75e' : '#ffe890'; g.font = 'bold 11px "M PLUS Rounded 1c", sans-serif';
            g.fillText(`${main ? 'C' : ck.id}  保留+1`, x, cy + 9);
            if (f > 0) chakFlash[ck.id] = Math.max(0, f - 0.04);
        }
        // ねらう 位置
        const ax = l + (aimX - F.x) / F.w * (r - l);
        g.fillStyle = '#ffd75e'; g.beginPath(); g.moveTo(ax - 8, wy - 58); g.lineTo(ax + 8, wy - 58); g.lineTo(ax, wy - 46); g.fill();
        // 落ちて いる メダル: ▼ → チャッカーの 列 → (入れば 穴へ すいこまれる・入らなければ) 動く プッシャーの 上
        for (const m of inflight) {
            const k = m.t / 260, mx = l + (m.x - F.x) / F.w * (r - l);
            const [px, py] = P3(m.x - F.x, P.pushers.upper.y * 0.5, P.P.HU + P.P.pushU.h);
            if (k < 0.4) { const q = k / 0.4; medal(mx, wy - 50 + (cy - 5 - (wy - 50)) * q, 9); }
            else if (m.chakker) { const q = Math.min(1, (k - 0.4) / 0.25); if (q < 1) medal(mx, cy - 5 + q * 3, 9 * (1 - q)); }
            else { const q = (k - 0.4) / 0.6; medal(mx + (px - mx) * q, cy - 5 + (py - (cy - 5)) * q, 9 + 3 * q); }
        }
        // チャッカー → 液晶の 保留ランプへ とぶ 光
        for (const f of [...holdFly]) {
            f.t += 16; const k = Math.min(1, f.t / 420), x1 = HOLD_X(f.i), y1 = LCD.y + LCD.h - 18;
            const x = f.x0 + (x1 - f.x0) * k, y = f.y0 + (y1 - f.y0) * k - Math.sin(k * Math.PI) * 40;
            g.fillStyle = HOLD_COL[f.c] || '#ffd75e'; g.shadowColor = '#fff'; g.shadowBlur = 12; g.beginPath(); g.arc(x, y, 7, 0, 7); g.fill(); g.shadowBlur = 0;
            if (k >= 1) holdFly.splice(holdFly.indexOf(f), 1);
        }
    }
    // 平らな メダル (画面の 小物用)
    function medal(x, y, r, kind) {
        if (kind === 'ball') { ball3d(x, y, r, 'cball'); return; }
        g.fillStyle = '#5a6474'; g.beginPath(); g.ellipse(x, y + r * 0.25, r, r * 0.55, 0, 0, 7); g.fill();
        g.fillStyle = '#c8ced8'; g.beginPath(); g.ellipse(x, y, r, r * 0.55, 0, 0, 7); g.fill();
        g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 1; g.beginPath(); g.ellipse(x, y, r * 0.7, r * 0.38, 0, Math.PI, Math.PI * 1.8); g.stroke();
    }
    // 立体の メダル (厚み・ふちの ぎざぎざ・刻印・かたむき)
    // 絵は 大きさ・つぶれ具合ごとに 先に 描いて おいて 使い回す (毎回 グラデーションを 作ると おそい)
    const coinCache = new Map();
    function coinSprite(gold, r, k) {
        const rq = Math.round(r * 2) / 2, kq = Math.round(k * 20) / 20, key = `${gold ? 1 : 0}|${rq}|${kq}`;
        let sp = coinCache.get(key);
        if (sp) return sp;
        const th = P.P.T * (rq / P.P.R) * ZK + 0.6, ry = rq * kq, S = 2, pad = 4;
        const w = Math.ceil(rq * 2 + pad * 2), h = Math.ceil(ry * 2 + th + pad * 2 + 3);
        const cv2 = document.createElement('canvas'); cv2.width = w * S; cv2.height = h * S;
        const q = cv2.getContext('2d'); q.scale(S, S); q.translate(w / 2, pad + ry + th);
        const C0 = gold ? ['#fff3b0', '#e8b020', '#8a5a08', '#5a3a04'] : ['#ffffff', '#c4ccd8', '#6a7484', '#3a4250'], r_ = rq;
        q.fillStyle = 'rgba(0,0,0,0.30)'; q.beginPath(); q.ellipse(1.5, 2.6, r_ * 1.02, ry * 1.08 + 0.5, 0, 0, 7); q.fill();   // かげ
        const sg = q.createLinearGradient(-r_, 0, r_, 0); sg.addColorStop(0, C0[3]); sg.addColorStop(0.35, C0[1]); sg.addColorStop(0.6, C0[2]); sg.addColorStop(1, C0[3]);
        q.fillStyle = sg; q.beginPath(); q.ellipse(0, 0, r_, ry, 0, 0, Math.PI); q.lineTo(-r_, -th); q.ellipse(0, -th, r_, ry, 0, Math.PI, 0, true); q.closePath(); q.fill();
        if (r_ > 6) { q.strokeStyle = 'rgba(0,0,0,0.28)'; q.lineWidth = 0.8; q.beginPath(); for (let i = -6; i <= 6; i++) { const xx = r_ * Math.sin(i * 0.24), yy = ry * Math.sqrt(Math.max(0, 1 - (xx / r_) ** 2)); q.moveTo(xx, yy - th); q.lineTo(xx, yy); } q.stroke(); }
        const fg = q.createLinearGradient(-r_ * 0.7, -th - ry, r_ * 0.7, -th + ry); fg.addColorStop(0, C0[0]); fg.addColorStop(0.5, C0[1]); fg.addColorStop(1, C0[2]);
        q.fillStyle = fg; q.beginPath(); q.ellipse(0, -th, r_, ry, 0, 0, 7); q.fill();
        // ふちの 段 (内がわが 一段 低い: 上が かげ・下が ひかり)
        q.lineWidth = Math.max(0.9, r_ * 0.07);
        q.strokeStyle = gold ? 'rgba(100,55,0,0.6)' : 'rgba(40,48,62,0.55)'; q.beginPath(); q.ellipse(0, -th, r_ * 0.8, ry * 0.8, 0, Math.PI, Math.PI * 2); q.stroke();
        q.strokeStyle = 'rgba(255,255,255,0.75)'; q.beginPath(); q.ellipse(0, -th, r_ * 0.8, ry * 0.8, 0, 0, Math.PI); q.stroke();
        const inner = q.createLinearGradient(0, -th - ry * 0.8, 0, -th + ry * 0.8); inner.addColorStop(0, gold ? '#d8a020' : '#a8b2c0'); inner.addColorStop(1, gold ? '#f8d870' : '#dde3ec');
        q.fillStyle = inner; q.beginPath(); q.ellipse(0, -th, r_ * 0.76, ry * 0.76, 0, 0, 7); q.fill();
        // 刻印 (雪の 結晶・うき彫り: かげ + ひかり)
        if (r_ > 7) {
            const flake = (dx, dy, col) => { q.strokeStyle = col; q.lineWidth = Math.max(0.8, r_ * 0.08); q.lineCap = 'round'; q.beginPath(); for (let i = 0; i < 3; i++) { const a = i * Math.PI / 3, cx = Math.cos(a), sy = Math.sin(a); q.moveTo(dx - cx * r_ * 0.5, -th + dy - sy * ry * 0.5); q.lineTo(dx + cx * r_ * 0.5, -th + dy + sy * ry * 0.5); for (const sgn of [-1, 1]) { const bx = dx + sgn * cx * r_ * 0.3, by = -th + dy + sgn * sy * ry * 0.3; q.moveTo(bx, by); q.lineTo(bx + Math.cos(a + 0.7) * r_ * 0.12 * sgn, by + Math.sin(a + 0.7) * ry * 0.12 * sgn); } } q.stroke(); };
            flake(0.6, 0.8, gold ? 'rgba(110,60,0,0.45)' : 'rgba(40,48,62,0.45)');
            flake(0, 0, gold ? 'rgba(255,250,215,0.95)' : 'rgba(255,255,255,0.95)');
            q.lineCap = 'butt';
        }
        q.strokeStyle = 'rgba(255,255,255,0.9)'; q.lineWidth = Math.max(1, r_ * 0.1); q.beginPath(); q.ellipse(0, -th, r_ * 0.92, ry * 0.92, 0, Math.PI * 1.1, Math.PI * 1.5); q.stroke();
        const spec = q.createRadialGradient(-r_ * 0.35, -th - ry * 0.4, 0, -r_ * 0.35, -th - ry * 0.4, r_ * 0.7); spec.addColorStop(0, 'rgba(255,255,255,0.55)'); spec.addColorStop(1, 'rgba(255,255,255,0)');
        q.fillStyle = spec; q.beginPath(); q.ellipse(0, -th, r_, ry, 0, 0, 7); q.fill();
        sp = { cv: cv2, w, h, ox: w / 2, oy: pad + ry + th };
        coinCache.set(key, sp);
        return sp;
    }
    // 立体の メダル (厚み・ふちの ぎざぎざ・刻印・かたむき)
    function coin3d(c) {
        const tt = tOf(c.y), sc = sOf(tt), [x, y] = P3(c.x, c.y, c.z);
        let k = 0.30 + 0.24 * tt + c.ty * 0.9, rot = c.tx * 0.75;
        if (!c.on) { k = 0.3 + Math.abs(Math.sin(c.spin)) * 0.6; rot += Math.sin(c.spin * 0.7) * 0.4; }
        k = Math.max(0.1, Math.min(0.95, k));
        const sp = coinSprite(c.kind === 'gold', P.P.R * sc, k);
        if (Math.abs(rot) < 0.03) { g.drawImage(sp.cv, x - sp.ox, y - sp.oy, sp.w, sp.h); return; }
        g.save(); g.translate(x, y); g.rotate(rot); g.drawImage(sp.cv, -sp.ox, -sp.oy, sp.w, sp.h); g.restore();
    }
    // 台の ボール (こおりボール = 水色・スペシャルボール = 金)
    function ball3d(x, y, r, kind) {
        const sp = kind === 'sball';
        g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(x, y + r * 0.85, r * 0.9, r * 0.3, 0, 0, 7); g.fill();
        const gr = g.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
        gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.35, sp ? '#ffe070' : '#9ae8ff'); gr.addColorStop(1, sp ? '#b07010' : '#1a78c8');
        g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
        if (sp) { g.fillStyle = '#ffffff'; g.font = `bold ${Math.round(r)}px "DotGothic16", monospace`; g.textAlign = 'center'; g.fillText('★', x, y + r * 0.35); }
        else { g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = Math.max(1, r * 0.1); g.beginPath(); for (let i = 0; i < 3; i++) { const a = i * Math.PI / 3; g.moveTo(x - Math.cos(a) * r * 0.5, y - Math.sin(a) * r * 0.5); g.lineTo(x + Math.cos(a) * r * 0.5, y + Math.sin(a) * r * 0.5); } g.stroke(); }
    }
    function drawField() {
        const PP = P.P, pu = P.pushers.upper, pl = P.pushers.lower, hU = PP.pushU.h, hL = PP.pushL.h;
        poly(top3(PP.UE, PP.LE, 0), '#1e5aa0');                                                    // 下段の 台
        if (F.side) { poly(top3(PP.LE - 22, PP.LE, 0, 0, F.side), '#02050c'); poly(top3(PP.LE - 22, PP.LE, 0, FW() - F.side, FW()), '#02050c'); }   // 店の 穴
        poly(top3(PP.LE - 4, PP.LE, 0, F.side, FW() - F.side), 'rgba(191,240,255,0.55)');          // 手前の はし
        poly(top3(0, PP.UE, PP.HU), '#2a6ab0');                                                   // 上段の 台
        poly(top3(0, pu.y, PP.HU + hU), '#d8eeff'); poly(face3(pu.y, PP.HU, PP.HU + hU), '#7ab0e0');
        poly(face3(PP.UE, 0, PP.HU), '#123a70');                                                  // 上段の 前の かべ
        poly(top3(PP.UE, pl.y, hL), '#c0e0fa'); poly(face3(pl.y, 0, hL), '#6aa0d8');
        const list = P.coins.slice().sort((a, b) => (a.y + a.z * 1.2) - (b.y + b.z * 1.2));
        for (const c of list) {
            if (c.ball) { const tt = tOf(c.y), [x, y] = P3(c.x, c.y, c.z + c.r); ball3d(x, y, c.r * sOf(tt), c.kind); }
            else coin3d(c);
        }
        // 左右の 金の かべと LED
        for (const sd of [0, 1]) {
            const u = sd ? FW() : 0, e = sd ? C.W : 0;
            const [x0, y0] = P3(u, 0, 0), [x1, y1] = P3(u, LE(), 0);
            const gr = g.createLinearGradient(e, 0, x0, 0); gr.addColorStop(0, '#6a4a10'); gr.addColorStop(0.6, '#e8c050'); gr.addColorStop(1, '#fff0a8');
            g.fillStyle = gr; g.beginPath(); g.moveTo(x0, y0 - 40); g.lineTo(x0, y0); g.lineTo(x1, y1); g.lineTo(x1 + (sd ? 40 : -40), y1); g.lineTo(x0 + (sd ? 26 : -26), y0 - 40); g.closePath(); g.fill();
            for (let i = 0; i <= 10; i++) { const [lx, ly] = P3(u, i / 10 * LE(), 0); g.fillStyle = ['#ff5ab0', '#ffd75e', '#6ae8ff'][(i + Math.floor(t / 250)) % 3]; g.beginPath(); g.arc(lx + (sd ? 12 : -12), ly - 6, 2.4, 0, 7); g.fill(); }
        }
    }
    function drawTower() {
        const T = TOWER, cx = T.x + T.w / 2;
        // 塔の 本体 (氷)
        const gr = g.createLinearGradient(T.x, 0, T.x + T.w, 0); gr.addColorStop(0, '#5ab0e8'); gr.addColorStop(0.5, '#bff0ff'); gr.addColorStop(1, '#4a98d0');
        g.fillStyle = gr; g.beginPath(); g.moveTo(T.x + 20, T.base); g.lineTo(T.x + 50, T.top); g.lineTo(T.x + T.w - 50, T.top); g.lineTo(T.x + T.w - 20, T.base); g.fill();
        g.fillStyle = '#e8faff'; g.beginPath(); g.moveTo(T.x + 40, T.top); g.lineTo(cx, T.top - 70); g.lineTo(T.x + T.w - 40, T.top); g.fill();
        g.fillStyle = '#ffd75e'; g.font = 'bold 14px "DotGothic16", monospace'; g.textAlign = 'center'; g.fillText('JP', cx, T.top - 20);
        // 段: どの 段も 穴が 3 つ (左 = 払い出し・まんなか = 上へ・右 = 落下)
        // 2026-11-18 ユーザー: 塔で 何を して いるのか わかりづらい → 穴に 名前を 書き、ボールが どこに 止まったかを 見せる
        const now = towerNow();
        T.stages.forEach((y, k) => {
            const w = T.w - 60 - k * 20, x = cx - w / 2;
            const active = now && now.k === k;
            g.globalAlpha = now && !active ? 0.55 : 1;
            g.fillStyle = active ? '#ffffff' : '#e0f6ff'; g.fillRect(x, y, w, 10);
            for (const hItem of towerHoles(k)) {
                const lit = active && now.settled && now.go === hItem.go;
                g.fillStyle = hItem.col; rr(hItem.x - 15, y - 5, 30, 8, 3); g.fill();
                if (lit) { g.strokeStyle = '#fff'; g.lineWidth = 3; g.shadowColor = hItem.col; g.shadowBlur = 16; rr(hItem.x - 17, y - 7, 34, 12, 4); g.stroke(); g.shadowBlur = 0; }
                g.fillStyle = '#ffffff'; g.strokeStyle = '#06203e'; g.lineWidth = 3; g.font = 'bold 11px "M PLUS Rounded 1c", sans-serif'; g.textAlign = 'center';
                g.strokeText(hItem.label, hItem.x, y - 12); g.fillStyle = hItem.tx; g.fillText(hItem.label, hItem.x, y - 12);
            }
            g.fillStyle = '#13305a'; g.font = 'bold 12px "M PLUS Rounded 1c", sans-serif'; g.textAlign = 'center';
            g.fillText(`${k + 1}段目`, cx, y + 26);
            g.globalAlpha = 1;
        });
        // ひび (上った ぶん)
        if (tw.phase !== 'idle') for (let k = 0; k < tw.cracks; k++) { g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 2; const y = T.stages[k] + 34; g.beginPath(); g.moveTo(cx - 30, y); g.lineTo(cx - 10, y + 12); g.lineTo(cx + 6, y + 2); g.lineTo(cx + 26, y + 16); g.stroke(); }
        // おにおに (塔の 途中で 待ちかまえる)
        Art.draw(g, 'onioni', T.x + T.w - 18, T.stages[1] - 2, { height: 44, frame: Math.floor(t / 300), flip: true });
        // おかがっぱ (ボールリフト係)
        Art.draw(g, 'okagappa', T.x + 26, T.base, { height: 48, frame: Math.floor(t / (tw.phase === 'lift' ? 100 : 400)) });
        // ボールと こおりくん
        if (tw.phase !== 'idle' && tw.phase !== 'wait') {
            let bx = cx, by = T.base - 20;
            if (tw.phase === 'lift') { const k = tw.t / 1100; bx = T.x + 40 + (cx - T.x - 40) * k; by = T.base - 20 - k * (T.base - 20 - T.stages[0] + 14); }
            else if (tw.phase === 'top') { bx = cx; by = T.top - 30 - Math.min(20, tw.t / 20); }
            else {
                const k = Math.min(tw.k, 2), y = T.stages[k] - 13, w = T.w - 60 - k * 20, st = tw.run.steps[tw.k];
                const target = towerHoles(k).find(h => h.go === (st ? st.go : 'up')).x;
                if (tw.phase === 'climb') {
                    // ころがって (左右に ゆれて)、だんだん 止まる 穴へ
                    const kr = Math.min(1, tw.t / (C.towerStepMs * 0.7)), amp = (w / 2 - 22) * (1 - kr);
                    bx = target + (cx - target) * (1 - kr) + Math.sin(kr * Math.PI * 4) * amp;
                    bx = Math.max(cx - w / 2 + 12, Math.min(cx + w / 2 - 12, bx));
                    by = y - Math.abs(Math.sin(kr * Math.PI * 4)) * 6 * (1 - kr) + (kr >= 1 ? 8 : 0);
                } else { bx = target; by = y + 8 + Math.min(st && st.go === 'fall' ? 120 : 14, tw.t / 8); }
            }
            medal(bx, by, F.ballR, 'ball');
            Art.draw(g, 'koori', bx + 22, by + 12, { height: 30, frame: Math.floor(t / 150) });
        }
    }
    // 段の 穴の 位置と 名前
    function towerHoles(k) {
        const T = TOWER, cx = T.x + T.w / 2, w = T.w - 60 - k * 20, st = C.tower[k];
        return [
            { go: 'pay', x: cx - w / 2 + 22, col: '#ffd75e', tx: '#ffe890', label: `払い出し ${st.medals}枚` },
            { go: 'up', x: cx, col: '#3aa8ff', tx: '#bff0ff', label: k + 1 >= C.tower.length ? '↑ てっぺん' : '↑ 上へ' },
            { go: 'fall', x: cx + w / 2 - 22, col: '#0a1830', tx: '#ffb0b0', label: '落下' }
        ];
    }
    // いま どの 段で 何を して いるか
    function towerNow() {
        if (tw.phase === 'climb' || tw.phase === 'end') {
            const st = tw.run.steps[tw.k];
            return { k: Math.min(tw.k, 2), go: st ? st.go : 'up', settled: tw.phase === 'end' || tw.t >= C.towerStepMs * 0.7 };
        }
        return null;
    }
    // 塔の 画面の 説明 (右: 段の 表・左: いま して いる こと と 穴の 見かた)
    function drawTowerGuide() {
        const n = C.tower.length;
        const gx = 720, gw = 250;
        g.fillStyle = 'rgba(4,12,28,0.7)'; rr(gx, 110, gw, 50 + (n + 1) * 44, 12); g.fill(); g.strokeStyle = '#2b4c80'; g.lineWidth = 1.5; g.stroke();
        g.fillStyle = '#bff0ff'; g.font = 'bold 14px "M PLUS Rounded 1c", sans-serif'; g.textAlign = 'left'; g.fillText('塔の すすみ', gx + 14, 134);
        const cur = tw.phase === 'top' ? n : tw.phase === 'lift' ? -1 : Math.min(tw.k, n - 1);
        for (let i = n; i >= 0; i--) {
            const y = 146 + (n - i) * 44, on = i === cur, done = i < cur;
            g.fillStyle = on ? 'rgba(255,215,94,0.25)' : 'rgba(255,255,255,0.05)'; rr(gx + 10, y, gw - 20, 36, 8); g.fill();
            if (on) { g.strokeStyle = '#ffd75e'; g.lineWidth = 2; g.stroke(); }
            g.fillStyle = on ? '#ffd75e' : done ? '#8fdcff' : 'rgba(255,255,255,0.7)'; g.font = 'bold 13px "M PLUS Rounded 1c", sans-serif'; g.textAlign = 'left';
            g.fillText(i === n ? 'てっぺん → JP ルーレット' : `${i + 1}段目  払い出しは ${C.tower[i].medals}枚`, gx + 22, y + 23);
            if (done) { g.textAlign = 'right'; g.fillText('✔', gx + gw - 22, y + 23); }
        }
        let msg = '', sub = '';
        const now = towerNow();
        if (tw.phase === 'lift') { msg = 'ボールを 塔へ はこぶ'; sub = 'スロットで もらった ボールを おかがっぱが 1段目へ'; }
        else if (now && !now.settled) { msg = `${now.k + 1}段目: ころころ…`; sub = 'ボールが どの 穴に 入るかな？'; }
        else if (now) {
            const st = C.tower[now.k];
            if (now.go === 'up') { msg = now.k + 1 >= n ? 'てっぺんへ！' : `上へ！ ${now.k + 2}段目へ`; sub = '上の 段ほど 払い出しが ふえる'; }
            else if (now.go === 'pay') { msg = `払い出し +${st.medals}枚`; sub = 'ここで おしまい。メダル ゲット！'; }
            else { msg = '落下… ざんねん'; sub = 'ボールは 塔の 下へ 落ちた'; }
        } else if (tw.phase === 'top') { msg = 'てっぺん！'; sub = 'JP ルーレットへ！'; }
        g.fillStyle = 'rgba(4,12,28,0.7)'; rr(30, 110, 280, 84, 12); g.fill(); g.strokeStyle = '#2b4c80'; g.lineWidth = 1.5; g.stroke();
        g.textAlign = 'left'; g.fillStyle = '#ffd75e'; g.font = 'bold 20px "M PLUS Rounded 1c", sans-serif'; g.fillText(msg, 46, 144);
        g.fillStyle = '#d8eeff'; g.font = '12px "M PLUS Rounded 1c", sans-serif'; g.fillText(sub, 46, 172);
        g.fillStyle = 'rgba(4,12,28,0.6)'; rr(30, 210, 280, 104, 12); g.fill();
        g.fillStyle = '#bff0ff'; g.font = 'bold 12px "M PLUS Rounded 1c", sans-serif'; g.fillText('穴の 見かた', 46, 228);
        [['#ffd75e', '払い出し', 'その 段の 枚数を もらって おわり'], ['#3aa8ff', '上へ', 'つぎの 段へ (てっぺんで JP)'], ['#0a1830', '落下', 'なにも なしで おわり']].forEach(([c, a, b], i) => {
            const y = 252 + i * 22;
            g.fillStyle = c; rr(46, y - 8, 26, 8, 3); g.fill(); if (c === '#0a1830') { g.strokeStyle = '#8fdcff'; g.lineWidth = 1; g.stroke(); }
            g.fillStyle = '#fff'; g.font = 'bold 12px "M PLUS Rounded 1c", sans-serif'; g.fillText(a, 82, y); g.fillStyle = '#bcd4ee'; g.font = '11px "M PLUS Rounded 1c", sans-serif'; g.fillText(b, 142, y);
        });
    }
    // ビックボスメダルタワー (右うえ・ゲージで 積み上がる)。ボスを 倒すと クレーンで 台へ はこぶ
    function stack(x, y, n, r) {
        for (let i = 0; i < n; i++) {
            const yy = y - i * r * 0.32, gold = i % 6 === 5;
            g.fillStyle = gold ? '#8a5a08' : '#4a5260'; g.beginPath(); g.ellipse(x, yy + r * 0.12, r, r * 0.3, 0, 0, 7); g.fill();
            const gr = g.createLinearGradient(x - r, 0, x + r, 0); gr.addColorStop(0, gold ? '#fff0a0' : '#ffffff'); gr.addColorStop(0.5, gold ? '#e0a820' : '#b8c0cc'); gr.addColorStop(1, gold ? '#8a5a08' : '#5a6474');
            g.fillStyle = gr; g.beginPath(); g.ellipse(x, yy, r, r * 0.3, 0, 0, 7); g.fill();
        }
    }
    function drawCrane() {
        // クレーン
        if (crane.phase === 'idle') return;
        const [fx, fy] = P3(TOWER_AT.x, TOWER_AT.y, 0);
        let x = fx, y = fy, hold = true;
        if (crane.phase === 'carry') { const e = Math.min(1, crane.t / 2400), ee = e * e * (3 - 2 * e); x = fx; y = -60 + (fy + 60) * ee; }   // 天井から おりて くる
        else hold = crane.phase === 'set' && crane.t < 300;
        const sc = sOf(tOf(TOWER_AT.y)), r = P.P.R * sc, top = y - crane.n * r * 0.32 - 16;
        const hy = hold ? top : Math.max(14, top - (crane.t - 300) * 0.3);
        // レール
        g.fillStyle = '#3a3a44'; g.fillRect(0, 0, C.W, 12);
        for (let i = 0; i < 26; i++) { g.fillStyle = i % 2 ? '#ffd030' : '#1a1a1a'; g.beginPath(); g.moveTo(i * 40, 12); g.lineTo(i * 40 + 20, 0); g.lineTo(i * 40 + 40, 0); g.lineTo(i * 40 + 20, 12); g.fill(); }
        g.strokeStyle = '#c8d0dc'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(x - 5, 12); g.lineTo(x - 5, hy - 14); g.moveTo(x + 5, 12); g.lineTo(x + 5, hy - 14); g.stroke();
        g.fillStyle = '#ffd030'; rr(x - 22, hy - 24, 44, 18, 5); g.fill(); g.strokeStyle = '#1a1a1a'; g.lineWidth = 1.5; rr(x - 22, hy - 24, 44, 18, 5); g.stroke();
        if (crane.phase === 'carry') stack(x, y, crane.n, r);
        g.strokeStyle = '#ffd030'; g.lineWidth = 4; g.lineCap = 'round';
        const open = hold ? 0 : 8;
        g.beginPath(); g.moveTo(x - 14, hy - 8); g.lineTo(x - r - 8 - open, hy + 4); g.lineTo(x - r - 6 - open, hy + 20); g.stroke();
        g.beginPath(); g.moveTo(x + 14, hy - 8); g.lineTo(x + r + 8 + open, hy + 4); g.lineTo(x + r + 6 + open, hy + 20); g.stroke();
        g.lineCap = 'butt';
        if (crane.phase === 'carry' && crane.t > 1600) { g.strokeStyle = '#ffd75e'; g.lineWidth = 2; g.setLineDash([6, 5]); g.beginPath(); g.ellipse(fx, fy, r * 2.4, r * 0.8, 0, 0, 7); g.stroke(); g.setLineDash([]); }
    }
    function drawBoss() {
        if (boss.phase === 'idle') return;
        const B = s.shared.boss;
        // 上の 半分を おおう (液晶の まわり)
        g.fillStyle = 'rgba(30,0,10,0.78)'; g.fillRect(0, 0, C.W, 250);
        const BX = 500;
        if (boss.phase === 'select') {
            const list = C.boss.list, sp = Math.max(60, 400 - boss.t * 0.09);
            const idx = boss.t > 3400 && B ? list.findIndex(x => x.id === B.id) : Math.floor(boss.t / sp) % list.length;
            const b = list[idx];
            g.fillStyle = '#ff8a8a'; g.font = '26px "DotGothic16", monospace'; g.textAlign = 'center'; g.fillText('ビックボスチャレンジ', BX, 34);
            g.fillStyle = '#fff'; g.font = '13px "M PLUS Rounded 1c", sans-serif'; g.fillText('強敵 ルーレット', BX, 54);
            drawBossArt(b.id, BX, 252, 180);
            g.fillStyle = '#ffd75e'; g.font = '22px "DotGothic16", monospace'; g.textAlign = 'left'; g.fillText(b.name, 640, 140);
            g.fillStyle = '#fff'; g.font = '14px "M PLUS Rounded 1c", sans-serif'; g.fillText(`報酬 (全席) ${b.reward} 枚`, 640, 166); g.fillText(`HP ${b.hp}`, 640, 186);
            return;
        }
        if (!B && boss.phase === 'fight') return;
        const id = B ? B.id : boss.res.id, def = C.boss.list.find(x => x.id === id);
        const hp = B ? B.hp : 0, max = B ? B.max : def.hp;
        const hurt = boss.hits.length && boss.hits[boss.hits.length - 1].t < 120;
        if (!(boss.phase === 'result' && boss.res.win && boss.t > 600)) drawBossArt(id, BX + (hurt ? (Math.random() - 0.5) * 8 : 0), 256, 190);
        g.fillStyle = '#fff'; g.font = '18px "DotGothic16", monospace'; g.textAlign = 'center'; g.fillText(def.name, BX, 26);
        // HP と 時間
        g.fillStyle = '#300'; rr(310, 36, 380, 18, 9); g.fill();
        g.fillStyle = '#ff4050'; rr(310, 36, 380 * Math.max(0, hp) / max, 18, 9); g.fill();
        g.fillStyle = '#fff'; g.font = '12px "DotGothic16", monospace'; g.fillText(`HP ${Math.ceil(hp)} / ${max}`, BX, 50);
        if (B) { g.fillStyle = B.left < 10 ? '#ff6060' : '#ffd75e'; g.font = '34px "DotGothic16", monospace'; g.fillText(`${Math.ceil(B.left)}`, 760, 52); g.font = '11px "M PLUS Rounded 1c", sans-serif'; g.fillText('のこり 秒', 760, 68); }
        // 仲間 (CPU) と 自分
        const allies = [['koori', 'あなた'], ['dake', 'CPU'], ['yamamou', 'CPU'], ['ikekimu', 'CPU']];
        allies.forEach(([a, nm], i) => { const x = 50 + i * 60, y = 244; Art.draw(g, a, x, y - 10 + (boss.phase === 'fight' && Math.floor(t / 200 + i) % 3 === 0 ? -4 : 0), { height: 40, frame: Math.floor(t / 200 + i) }); g.fillStyle = i ? '#9fb8d8' : '#ffd75e'; g.font = '10px "M PLUS Rounded 1c", sans-serif'; g.textAlign = 'center'; g.fillText(nm, x, y + 4); });
        if (B) { const tot = B.dmg[0] + B.cpu; g.fillStyle = '#fff'; g.font = '13px "M PLUS Rounded 1c", sans-serif'; g.textAlign = 'left'; g.fillText(`あなたの ダメージ ${Math.round(B.dmg[0])} (${tot ? Math.round(B.dmg[0] / tot * 100) : 0}%)`, 640, 210); g.fillText('メダルを 入れる・チャッカー入賞で 攻撃！', 640, 234); }
        for (const h of boss.hits) { h.t += 16; g.globalAlpha = Math.max(0, 1 - h.t / 600); g.fillStyle = '#ffd75e'; g.font = 'bold 16px "DotGothic16", monospace'; g.textAlign = 'center'; g.fillText(`-${h.n}`, h.x, h.y - h.t * 0.05); g.globalAlpha = 1; }
        boss.hits = boss.hits.filter(h => h.t < 600);
        if (boss.phase === 'result') {
            g.fillStyle = boss.res.win ? '#ffd75e' : '#9fb8d8'; g.font = '34px "DotGothic16", monospace'; g.textAlign = 'center';
            g.fillText(boss.res.win ? '撃破！！' : 'タイムアップ…', BX, 130);
            g.font = '18px "M PLUS Rounded 1c", sans-serif'; g.fillText(`+${boss.res.rewards[0]} 枚 ${boss.res.mvp === 0 ? '・MVP ボール' : ''}`, BX, 162);
            if (boss.res.win) { g.font = '14px "M PLUS Rounded 1c", sans-serif'; g.fillText('ビックボスメダルタワーが クレーンで 台へ！', BX, 188); }
        }
    }
    function drawBossArt(id, x, y, h) {
        Art.draw(g, id, x, y, { height: h, frame: Math.floor(t / 300) });
        // アソボレアスの 背中の 麻生マーク
        if (id === 'asoboreas') { const sc = h / 56; g.fillStyle = '#fff'; g.font = `bold ${Math.round(5 * sc)}px "DotGothic16", serif`; g.textAlign = 'center'; g.fillText('麻生', x, y - h + 20.5 * sc); }
    }
    function drawFx(dt) {
        for (const f of fx) {
            f.t += dt;
            if (f.coin) { medal(f.x, f.y + f.t * 0.08, 8); continue; }
            g.globalAlpha = Math.max(0, 1 - f.t / 1500);
            g.fillStyle = f.color; g.font = `bold ${f.size}px "DotGothic16", monospace`; g.textAlign = 'center';
            g.strokeStyle = '#000'; g.lineWidth = 3; g.strokeText(f.msg, f.x, f.y - f.t * 0.03); g.fillText(f.msg, f.x, f.y - f.t * 0.03);
            g.globalAlpha = 1;
        }
        for (let i = fx.length - 1; i >= 0; i--) if (fx[i].t > (fx[i].coin ? 400 : 1500)) fx.splice(i, 1);
    }
    function drawTalk(dt) {
        if (!talk) return;
        talk.t += dt;
        if (talk.t > 3200) { talk = null; return; }
        const ev = view.name !== 'field' && view.k > 0.5;
        const x = 10, y = ev ? 470 : boss.phase !== 'idle' ? 262 : 56, w = 270, h = 70;
        g.globalAlpha = Math.min(1, (3200 - talk.t) / 300);
        g.fillStyle = 'rgba(8,20,40,0.88)'; rr(x, y, w, h, 12); g.fill();
        g.strokeStyle = talk.color || '#fff'; g.lineWidth = 2; g.stroke();
        Art.draw(g, talk.who, x + 32, y + h - 4, { height: 48 });
        g.fillStyle = '#fff'; g.font = '14px "M PLUS Rounded 1c", sans-serif'; g.textAlign = 'left';
        const L = 13, lines = []; for (let i = 0; i < talk.msg.length; i += L) lines.push(talk.msg.slice(i, i + L));
        lines.slice(0, 3).forEach((ln, i) => g.fillText(ln, x + 64, y + 22 + i * 19 - (lines.length > 2 ? 6 : 0)));
        g.globalAlpha = 1;
    }
    function drawJP() {
        const k = jpFx.t;
        // 塔が くだけて メダルの 山に
        for (let i = 0; i < 60; i++) { const a = i * 0.7, d = k * 0.18 * (0.4 + (i % 7) / 7); g.fillStyle = i % 3 ? '#bff0ff' : '#ffd75e'; g.fillRect(TOWER.x + TOWER.w / 2 + Math.cos(a) * d, 300 + Math.sin(a) * d + k * k * 0.00004 * (i % 5 + 1), 6, 6); }
        g.fillStyle = `hsl(${k / 4 % 360},90%,65%)`; g.font = '64px "DotGothic16", monospace'; g.textAlign = 'center';
        g.strokeStyle = '#000'; g.lineWidth = 6; g.strokeText('こおりJP!!', 500, 260); g.fillText('こおりJP!!', 500, 260);
        g.fillStyle = '#ffd75e'; g.font = '40px "DotGothic16", monospace'; g.strokeText(`${jpFx.r.medals.toLocaleString()} 枚`, 500, 320); g.fillText(`${jpFx.r.medals.toLocaleString()} 枚`, 500, 320);
        Art.draw(g, 'koori', 500, 440, { height: 100, frame: Math.floor(k / 120) });
    }

    // ----- ポップアップ・設定 -----
    function popup(html, after) { $('modal-box').innerHTML = html; $('modal').hidden = false; if (after) after(); }
    function closePopup() { $('modal').hidden = true; }
    $('help-btn').addEventListener('click', () => popup(`<h2>遊び方</h2><ul>
        <li>スマホは 横画面で 遊ぶ。縦向きの ままなら 画面ごと 横に なるので、スマホを 左に たおして 遊んでね。</li>
        <li>プッシャーの 上を タップ (クリック) すると、その 位置に メダルを 入れる。長押しで 連射。▼ が ねらう 位置。メダルは いちばん 上の 動く プッシャーの 上に 落ちて、前へ こぼれて いく。</li>
        <li>入れた メダルが 上の チャッカー (L・CENTER・R の 穴) を 通ると、入る ことが ある。入ると 保留が 1 つ ふえ、保留 1 つで 液晶スロットが 1 回 回る (保留は 4 個 まで。青 → 水色 → 金 で 期待度 アップ)。▼ が チャッカーの 上に あると 穴が 光る。</li>
        <li>スロットで ボールが 出ると、おかがっぱが ボールを 氷の 塔へ。どの 段にも 穴が 3 つ (払い出し・上へ・落下) あり、ボールが ころがって 止まった 穴で きまる。「上へ」なら つぎの 段へ、てっぺんまで 行くと JP ルーレット！</li>
        <li>JP ルーレットの JP ポケットで「こおりJP」。入れた メダルで プールが ふえる。</li>
        <li>ボスゲージが たまるか、スロットで ボス図柄が そろうと「ビックボスチャレンジ」。${C.boss.sec} 秒 以内に みんなで 強敵を 倒すと、ビックボスメダルタワーが 爆散して メダルが ふる！</li>
        <li>手前から 落ちた メダルが 払い出し。左右の はしの 穴に 落ちると もどらない。</li>
        <li>メダルと JP は この ブラウザに 保存される。</li>
    </ul><button class="big" id="help-close">とじる</button>`, () => { $('help-close').onclick = closePopup; }));
    $('modal').addEventListener('click', e => { if (e.target.id === 'modal') closePopup(); });
    $('snd-vol').value = Math.round(Sound.vol * 100);
    $('snd-mute').checked = Sound.mute;
    const sndIcon = () => { $('snd-btn').textContent = Sound.mute || !Sound.vol ? '🔇' : '🔊'; };
    sndIcon();
    $('snd-btn').addEventListener('click', e => { e.stopPropagation(); $('snd-panel').hidden = !$('snd-panel').hidden; });
    $('snd-vol').addEventListener('input', e => { Sound.setVol(Number(e.target.value) / 100); sndIcon(); });
    $('snd-mute').addEventListener('change', e => { Sound.setMute(e.target.checked); sndIcon(); });
    document.addEventListener('click', e => { if (!e.target.closest('#snd-panel') && e.target.id !== 'snd-btn') $('snd-panel').hidden = true; });

    start();
    // 画面確認用: ?fresh=1&medals=500&ball=1&boss=1&crane=40&sr=1&jpr=1
    if (params.get('auto')) { holding = true; aimX = F.x + Number(params.get('auto')); }
    if (params.get('jpr')) rouletteStart();   // 画面の 確認用: JP ルーレット
    if (params.get('crane')) craneStart(Number(params.get('crane')) || 40, 0);   // 画面の 確認用
    if (params.get('sr')) { const r = Game.specialRoulette(s); if (r.medals) pending += r.medals; sr.queue.push(r); }
})();
