// 画面 (描く・さわる・演出の 順番・セーブ)
// 左 = プッシャー (上は 液晶スロット)・右 = 氷の 塔・JP ルーレット・ビックボスメダルタワー
(() => {
    const C = CONFIG, F = C.field;
    const $ = id => document.getElementById(id);
    const cv = $('stage'), g = cv.getContext('2d');
    const SAVE = 'koori-medal-save-v1';
    const params = new URLSearchParams(location.search);
    let s, P;
    let aimX = F.x + F.w / 2, holding = false, holdT = 0;
    const inflight = [];   // 入れて 落ちて いる メダル (見た目)
    const fx = [];         // 文字・つぶ
    let pending = 0;       // まだ 見せて いない 払い出し (塔・ルーレット・JP) → メダルの 数の 表示を おくらせる
    let t = 0, shake = 0, flash = 0;
    const TOWER = { x: 520, w: 210, base: 592, stages: [480, 360, 240], top: 120 };
    const RL = { x: 870, y: 470, r: 104 };
    const BT = { x: 870, y: 300 };   // ビックボスメダルタワー

    // ----- セーブ -----
    function save() {
        try { localStorage.setItem(SAVE, JSON.stringify({ s, field: P.snapshot() })); } catch (e) { /* なし */ }
    }
    function load() {
        try { const v = JSON.parse(localStorage.getItem(SAVE)); return v && v.s && v.s.version === 1 ? v : null; } catch (e) { return null; }
    }
    function start() {
        const v = !params.get('fresh') && load();
        P = Pusher.create();
        if (v) { s = v.s; s.shared.boss = null; P.restore(v.field); for (let i = 0; i < 30; i++) P.step(); P.take(); }
        else { s = Game.newState(params.get('seed') ? Number(params.get('seed')) : Math.floor(Math.random() * 2 ** 31)); P.fill(F.startUpper, F.startLower); }
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
        inflight.push({ x: e.x, t: 0, chakker: e.chakker });
        if (r.bossStart) bossSelect();
    }
    function noMedals() {
        if (inflight.length || slot.phase !== 'idle' || tw.phase !== 'idle' || rl.phase !== 'idle' || boss.phase !== 'idle') return;
        if (P.count() > 0 && me().medals <= 0 && !noMedals.asked) {
            noMedals.asked = true;
            popup(`<h2>メダルが なくなった…</h2><p>ふるカワ「こおりくん、${C.freeMedals.give} 枚 わたすよ。もう 一度 がんばって！」</p><button class="big" id="free-ok">うけとる</button>`, () => { $('free-ok').onclick = () => { me().medals += C.freeMedals.give; noMedals.asked = false; closePopup(); save(); }; });
        }
    }
    function fieldAt(x, y) { return x >= F.x - 10 && x <= F.x + F.w + 10 && y >= 0 && y <= F.lower.edge + 30; }
    function toStage(e) { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * C.W / r.width, y: (e.clientY - r.top) * C.H / r.height }; }
    cv.addEventListener('pointerdown', e => {
        const p = toStage(e);
        if (!fieldAt(p.x, p.y)) return;
        aimX = Math.max(F.x + 12, Math.min(F.x + F.w - 12, p.x));
        holding = true; holdT = 0;
        doInsert();
        cv.setPointerCapture(e.pointerId);
    });
    cv.addEventListener('pointermove', e => { const p = toStage(e); if (holding || e.pointerType === 'mouse') { if (p.x >= F.x - 10 && p.x <= F.x + F.w + 10) aimX = Math.max(F.x + 12, Math.min(F.x + F.w - 12, p.x)); } });
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
                if (r.spill) { P.spill(r.spill, 0); text(`+${r.spill} 枚 放出！`, F.x + F.w / 2, F.upper.top + 60, '#ffd75e', 22); }
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
            if (me().balls <= 0 || rl.phase !== 'idle') return;
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
                if (tw.k + 1 >= C.tower.length) { tw.phase = 'top'; Sound.se('hit'); say('koori', 'てっぺんだ！ JP ルーレットへ！', '#ffd75e'); }
                else { tw.k++; Sound.se('up'); if (tw.k === 1) say('onioni', 'ここから 先は 通さんぞ！', '#ff8a8a'); }
            } else if (st.go === 'pay') { tw.phase = 'end'; Sound.se('pay'); pending -= tw.run.medals; text(`+${tw.run.medals} 枚`, TOWER.x + TOWER.w / 2, TOWER.stages[tw.k] - 30, '#ffd75e', 24); }
            else { tw.phase = 'end'; Sound.se('fall'); say('onioni', 'がっはっは！ 落ちろ！', '#ff8a8a'); }
        } else if (tw.phase === 'top' && tw.t > 900) { tw.phase = 'wait'; rouletteStart(); }
        else if (tw.phase === 'end' && tw.t > 900) tw.phase = 'idle';
        else if (tw.phase === 'wait' && rl.phase === 'idle') tw.phase = 'idle';
    }

    // ----- JP ルーレット -----
    const rl = { phase: 'idle', res: null, t: 0, ang: 0, from: 0, to: 0, ball: 0 };
    function rouletteStart() {
        rl.res = Game.roulette(s);
        if (rl.res.kind === 'medals') pending += rl.res.medals;
        if (rl.res.kind === 'jp') pending += rl.res.pay;
        rl.phase = 'spin'; rl.t = 0;
        const n = C.roulette.pockets.length, seg = Math.PI * 2 / n;
        rl.from = rl.ang % (Math.PI * 2);
        // ボールは 上 (−90°) で 止まる: 円盤を まわして ポケット idx を 上に
        const target = -Math.PI / 2 - (rl.res.idx + 0.5) * seg;
        rl.to = target - Math.PI * 2 * 6 - ((target - rl.from) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) + Math.PI * 2;
        while (rl.to > rl.from - Math.PI * 2 * 5) rl.to -= Math.PI * 2;
        Sound.play('roulette');
    }
    function rouletteUpdate(dt) {
        if (rl.phase === 'idle') return;
        rl.t += dt;
        if (rl.phase === 'spin') {
            const k = Math.min(1, rl.t / C.roulette.spinMs), e = 1 - Math.pow(1 - k, 3.2);
            const prev = rl.ang;
            rl.ang = rl.from + (rl.to - rl.from) * e;
            const seg = Math.PI * 2 / C.roulette.pockets.length;
            if (Math.floor(prev / seg) !== Math.floor(rl.ang / seg)) Sound.se('tick');
            Sound.thin(1 - k * 0.8);
            if (k >= 1) {
                rl.phase = 'result'; rl.t = 0; Sound.thin(1);
                const r = rl.res;
                if (r.kind === 'jp') { jpStart(r); }
                else if (r.kind === 'again') { Sound.se('okagappa'); say('okagappa', 'もう 一回！', '#7fe0a0'); }
                else { Sound.se('pay'); pending -= r.medals; text(`+${r.medals} 枚`, RL.x, RL.y - RL.r - 20, '#ffd75e', 26); }
            }
        } else if (rl.phase === 'result' && rl.t > (rl.res.kind === 'jp' ? 7000 : 1300)) {
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
            if (B2 && B2.hp < boss.lastHp - 0.5) { if (Math.random() < 0.5) Sound.se('attack'); boss.hits.push({ t: 0, x: BT.x + (Math.random() - 0.5) * 120, y: BT.y - 40 + (Math.random() - 0.5) * 80, n: Math.round(boss.lastHp - B2.hp) }); boss.lastHp = B2.hp; }
            if (res) {
                boss.res = res; boss.phase = 'result'; boss.t = 0;
                const n = res.rewards[0];
                if (res.win) { Sound.se('boom'); Sound.se('win'); shake = 40; flash = 1; say('koori', `たおした！ メダルタワーが 爆散！ ${n} 枚！${res.mvp === 0 ? ' MVP で ボールも ゲット！' : ''}`, '#ffd75e'); }
                else { Sound.se('lose'); say('furukawa', `時間 切れ… 残念賞 ${n} 枚`, '#9fb8d8'); }
                let left = n;
                const drop = () => { const k = Math.min(10, left); if (k > 0) { P.spill(k, 0); left -= k; setTimeout(drop, 140); } };
                setTimeout(drop, res.win ? 900 : 300);
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
        if (ev.pay) { Game.payout(s, ev.pay); Sound.se('clink'); for (let i = 0; i < Math.min(ev.pay, 3); i++) fx.push({ coin: true, x: F.x + F.side + Math.random() * (F.w - F.side * 2), y: F.lower.edge, t: 0 }); }
        if (ev.drop) Sound.se('clink');
        if (holding) { holdT += dt; if (holdT >= C.autoMs) { holdT = 0; doInsert(); } }
        for (const m of [...inflight]) {
            m.t += dt;
            if (m.t >= 260) {
                inflight.splice(inflight.indexOf(m), 1);
                if (m.chakker) { if (Game.chakker(s)) { Sound.se('chakker'); } chakFlash[m.chakker] = 1; if (s.shared.boss && s.shared.boss.started) Sound.se('attack'); }
                P.insert(m.x);
            }
        }
        slotUpdate(dt); towerUpdate(dt); rouletteUpdate(dt); bossUpdate(dt);
        if (jpFx) { jpFx.t += dt; if (jpFx.t > 7000) jpFx = null; }
        draw(dt);
        hud();
        requestAnimationFrame(loop);
    }
    const chakFlash = {};

    function hud() {
        $('medals').textContent = Math.max(0, me().medals - pending).toLocaleString();
        $('jp').textContent = Math.floor(s.shared.jp).toLocaleString();
        $('gauge').style.width = `${s.shared.boss ? 100 : Math.min(100, s.shared.gauge / C.boss.gauge.full * 100)}%`;
    }

    // ===== 描く =====
    function draw(dt) {
        g.save();
        if (shake > 0) { g.translate((Math.random() - 0.5) * shake * 0.5, (Math.random() - 0.5) * shake * 0.5); shake *= 0.9; if (shake < 0.5) shake = 0; }
        drawBack();
        drawLCD();
        drawField();
        drawInlet();
        drawTower();
        drawBigTower();
        drawRoulette();
        drawBoss();
        drawFx(dt);
        drawTalk(dt);
        if (jpFx) drawJP();
        g.restore();
        if (flash > 0) { g.fillStyle = `rgba(255,255,255,${flash * 0.6})`; g.fillRect(0, 0, C.W, C.H); flash *= 0.92; if (flash < 0.02) flash = 0; }
        if (boss.dark) { g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(0, 0, C.W, C.H); }
    }
    function rr(x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
    function drawBack() {
        const gr = g.createLinearGradient(0, 0, 0, C.H);
        gr.addColorStop(0, '#0a1a38'); gr.addColorStop(1, '#04080f');
        g.fillStyle = gr; g.fillRect(0, 0, C.W, C.H);
        // 雪
        g.fillStyle = 'rgba(255,255,255,0.5)';
        for (let i = 0; i < 40; i++) g.fillRect((i * 97 + t * 0.01 * (i % 3 + 1)) % C.W, (i * 53 + t * 0.03 * (i % 4 + 1)) % C.H, 2, 2);
        // 氷の 城の かげ (右うえ)
        g.fillStyle = 'rgba(143,220,255,0.08)';
        for (const [x, w, h] of [[760, 40, 200], [800, 60, 260], [860, 50, 300], [910, 60, 240], [960, 40, 180]]) { g.fillRect(x, 20 + 300 - h, w, h); g.beginPath(); g.moveTo(x - 4, 20 + 300 - h); g.lineTo(x + w / 2, 20 + 300 - h - 30); g.lineTo(x + w + 4, 20 + 300 - h); g.fill(); }
    }
    // 図柄
    function sym(id, x, y, sz) {
        if (['koori', 'onioni', 'okagappa'].includes(id)) { Art.draw(g, id, x, y + sz * 0.45, { height: sz * 0.9 }); return; }
        g.save(); g.translate(x, y);
        if (id === 'ball') { const gr = g.createRadialGradient(-sz * 0.12, -sz * 0.12, 2, 0, 0, sz * 0.35); gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, '#2a8ae0'); g.fillStyle = gr; g.beginPath(); g.arc(0, 0, sz * 0.33, 0, 7); g.fill(); }
        else if (id === 'boss') { g.fillStyle = '#c02030'; rr(-sz * 0.38, -sz * 0.3, sz * 0.76, sz * 0.6, 8); g.fill(); g.fillStyle = '#fff'; g.font = `bold ${sz * 0.26}px "DotGothic16", monospace`; g.textAlign = 'center'; g.fillText('BOSS', 0, sz * 0.09); }
        else if (id === 'ice') { g.fillStyle = '#bff0ff'; g.beginPath(); for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; g.lineTo(Math.cos(a) * sz * 0.34, Math.sin(a) * sz * 0.34); } g.fill(); g.fillStyle = '#4aa8e0'; g.fillRect(-2, -sz * 0.3, 4, sz * 0.6); }
        else { const n = id.slice(1); g.fillStyle = '#e8c040'; g.beginPath(); g.arc(0, 0, sz * 0.33, 0, 7); g.fill(); g.fillStyle = '#fff4b0'; g.beginPath(); g.arc(-3, -3, sz * 0.22, 0, 7); g.fill(); g.fillStyle = '#6a4a00'; g.font = `bold ${sz * 0.28}px "DotGothic16", monospace`; g.textAlign = 'center'; g.fillText(n, 0, sz * 0.1); }
        g.restore();
    }
    function drawLCD() {
        const x = 40, y = 8, w = 420, h = 108;
        g.fillStyle = '#1a2a4a'; rr(x - 4, y - 4, w + 8, h + 8, 12); g.fill();
        const gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, '#0e2c5a'); gr.addColorStop(1, '#081830');
        g.fillStyle = gr; rr(x, y, w, h, 10); g.fill();
        // リール
        for (let i = 0; i < 3; i++) {
            const rx = x + 14 + i * 96, ry = y + 10, rw = 88, rh = 76;
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
        if (slot.phase === 'show' && slot.sp && slot.sp.result !== 'miss') { g.strokeStyle = '#ffd75e'; g.lineWidth = 5; rr(x + 10, y + 6, 292, 84, 10); g.stroke(); }
        // 右の キャラ (通常は こおりくん・チャンスで おかがっぱ・バトルで おにおに)
        const cx = x + 350, cy = y + 88;
        if (slot.phase === 'battle') {
            Art.draw(g, 'koori', cx - 18, cy, { height: 40, frame: Math.floor(t / 150) });
            Art.draw(g, 'onioni', cx + 30, cy, { height: 50, frame: Math.floor(t / 120), flip: true });
            if (slot.t > 1200) { g.fillStyle = slot.sp.battleWin ? '#ffd75e' : '#ff6060'; g.font = 'bold 18px "DotGothic16", monospace'; g.textAlign = 'center'; g.fillText(slot.sp.battleWin ? 'かち！' : 'まけ…', cx + 6, y + 22); }
            else { g.fillStyle = '#fff'; g.font = '13px "DotGothic16", monospace'; g.textAlign = 'center'; g.fillText('おにおにバトル', cx + 6, y + 22); }
        } else if (slot.phase === 'spin' && slot.sp && slot.sp.okagappa) Art.draw(g, 'okagappa', cx, cy, { height: 60, frame: Math.floor(t / 120) });
        else Art.draw(g, 'koori', cx, cy, { height: 46, frame: Math.floor(t / 400) });
        // 保留 (青 → 水色 → 金)
        const col = { blue: '#3a7ae0', aqua: '#6ae8ff', gold: '#ffd75e' };
        me().hold.forEach((c, i) => { g.fillStyle = col[c]; g.beginPath(); g.arc(x + 30 + i * 22, y + h - 9, 7, 0, 7); g.fill(); });
        g.fillStyle = 'rgba(255,255,255,0.4)'; g.font = '11px "M PLUS Rounded 1c", sans-serif'; g.textAlign = 'left'; g.fillText('保留', x + 120, y + h - 5);
    }
    function drawInlet() {
        const y0 = 122, y1 = F.upper.top;
        g.fillStyle = '#1c3c6a'; g.fillRect(F.x, y0, F.w, y1 - y0);
        for (const ck of C.chakkers) {
            const cx = F.x + ck.x, f = chakFlash[ck.id] || 0;
            g.fillStyle = f > 0 ? `rgba(255,215,94,${0.5 + f * 0.5})` : '#0a1830';
            rr(cx - ck.w / 2, C.chakkerY - 12, ck.w, 22, 8); g.fill();
            g.strokeStyle = ck.id === 'C' ? '#ffd75e' : '#8fdcff'; g.lineWidth = 2; g.stroke();
            g.fillStyle = '#fff'; g.font = '10px "DotGothic16", monospace'; g.textAlign = 'center'; g.fillText(ck.id === 'C' ? 'CENTER' : ck.id, cx, C.chakkerY + 3);
            if (f > 0) chakFlash[ck.id] = Math.max(0, f - 0.04);
        }
        // ねらう 位置
        g.fillStyle = '#ffd75e';
        g.beginPath(); g.moveTo(aimX - 8, y0 + 2); g.lineTo(aimX + 8, y0 + 2); g.lineTo(aimX, y0 + 14); g.fill();
        // 落ちて いる メダル
        for (const m of inflight) { const k = m.t / 260; medal(m.x, y0 + 4 + k * (y1 - y0 + 10), F.medalR * (1.2 - k * 0.2)); }
    }
    function medal(x, y, r, kind) {
        g.fillStyle = kind === 'ball' ? '#3a9ae8' : '#c8ced8'; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
        g.fillStyle = kind === 'ball' ? '#bfe8ff' : '#f4f8ff'; g.beginPath(); g.arc(x - r * 0.3, y - r * 0.3, r * 0.45, 0, 7); g.fill();
        g.strokeStyle = 'rgba(60,70,90,0.6)'; g.lineWidth = 1; g.beginPath(); g.arc(x, y, r - 0.5, 0, 7); g.stroke();
    }
    function drawField() {
        for (const [i, st] of [[0, F.upper], [1, F.lower]]) {
            const gr = g.createLinearGradient(0, st.top, 0, st.edge);
            gr.addColorStop(0, i ? '#2a6aa8' : '#3a7ab8'); gr.addColorStop(1, i ? '#1a4a80' : '#2a5a90');
            g.fillStyle = gr; g.fillRect(F.x, st.top, F.w, st.edge - st.top);
            g.fillStyle = 'rgba(191,240,255,0.25)'; g.fillRect(F.x, st.edge - 3, F.w, 3);
        }
        // 下段の 落とし穴 (左右)
        g.fillStyle = '#04080f'; g.fillRect(F.x, F.lower.edge - 6, F.side, 30); g.fillRect(F.x + F.w - F.side, F.lower.edge - 6, F.side, 30);
        // 払い出し口
        g.fillStyle = '#ffd75e33'; g.fillRect(F.x + F.side, F.lower.edge, F.w - F.side * 2, C.H - F.lower.edge);
        g.fillStyle = '#ffd75e'; g.font = '12px "DotGothic16", monospace'; g.textAlign = 'center'; g.fillText('▼ 払い出し ▼', F.x + F.w / 2, C.H - 10);
        // かべ
        g.fillStyle = '#5a7aa8'; g.fillRect(F.x - 8, 122, 8, F.lower.edge - 122); g.fillRect(F.x + F.w, 122, 8, F.lower.edge - 122);
        // メダル (上段 → 下段)
        for (const b of P.medals) medal(b.position.x, b.position.y, b.circleRadius, b.plugin.kind);
        // プッシャー
        for (const p of P.pushers) {
            const b = p.body, y = b.position.y - p.st.plate / 2;
            g.fillStyle = '#9ac8f0'; g.fillRect(F.x, p.st.top - 40, F.w, y - p.st.top + 40);
            const gr = g.createLinearGradient(0, y, 0, y + p.st.plate); gr.addColorStop(0, '#d8f0ff'); gr.addColorStop(1, '#6aa0d8');
            g.fillStyle = gr; g.fillRect(F.x, y, F.w, p.st.plate);
            g.fillStyle = '#ffffff55'; for (let k = 0; k < 6; k++) g.fillRect(F.x + 20 + k * 70, y + 6, 40, 4);
        }
        // 入り口の 帯 (プッシャーの うえを 隠す)
        g.fillStyle = '#1c3c6a'; g.fillRect(F.x, 122, F.w, F.upper.top - 122 + 2);
    }
    function drawTower() {
        const T = TOWER, cx = T.x + T.w / 2;
        // 塔の 本体 (氷)
        const gr = g.createLinearGradient(T.x, 0, T.x + T.w, 0); gr.addColorStop(0, '#5ab0e8'); gr.addColorStop(0.5, '#bff0ff'); gr.addColorStop(1, '#4a98d0');
        g.fillStyle = gr; g.beginPath(); g.moveTo(T.x + 20, T.base); g.lineTo(T.x + 50, T.top); g.lineTo(T.x + T.w - 50, T.top); g.lineTo(T.x + T.w - 20, T.base); g.fill();
        g.fillStyle = '#e8faff'; g.beginPath(); g.moveTo(T.x + 40, T.top); g.lineTo(cx, T.top - 70); g.lineTo(T.x + T.w - 40, T.top); g.fill();
        g.fillStyle = '#ffd75e'; g.font = 'bold 14px "DotGothic16", monospace'; g.textAlign = 'center'; g.fillText('JP', cx, T.top - 20);
        // 段
        T.stages.forEach((y, k) => {
            const w = T.w - 60 - k * 20, x = cx - w / 2;
            g.fillStyle = '#e0f6ff'; g.fillRect(x, y, w, 10);
            const st = C.tower[k];
            g.fillStyle = '#ffd75e'; g.fillRect(x + 8, y - 4, 26, 6);                 // 払い出しの 穴
            g.fillStyle = '#0a1830'; g.fillRect(x + w - 34, y - 4, 26, 6);             // 落下の 穴
            g.fillStyle = '#13305a'; g.font = '11px "M PLUS Rounded 1c", sans-serif'; g.textAlign = 'center';
            g.fillText(`${k + 1}段 ${st.medals}枚`, cx, y + 24);
        });
        // ひび (上った ぶん)
        if (tw.phase !== 'idle') for (let k = 0; k < tw.cracks; k++) { g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 2; const y = T.stages[k] + 30; g.beginPath(); g.moveTo(cx - 30, y); g.lineTo(cx - 10, y + 12); g.lineTo(cx + 6, y + 2); g.lineTo(cx + 26, y + 16); g.stroke(); }
        // おにおに (塔の 途中で 待ちかまえる)
        Art.draw(g, 'onioni', T.x + T.w - 18, T.stages[1] - 2, { height: 44, frame: Math.floor(t / 300), flip: true });
        // おかがっぱ (ボールリフト係)
        Art.draw(g, 'okagappa', T.x + 26, T.base, { height: 48, frame: Math.floor(t / (tw.phase === 'lift' ? 100 : 400)) });
        // ボールと こおりくん
        if (tw.phase !== 'idle' && tw.phase !== 'wait') {
            let bx = cx, by = T.base - 20;
            if (tw.phase === 'lift') { const k = tw.t / 1100; bx = T.x + 40; by = T.base - 20 - k * (T.base - 20 - T.stages[0] + 14); }
            else if (tw.phase === 'climb' || tw.phase === 'end' || tw.phase === 'top') {
                const k = Math.min(1, tw.t / C.towerStepMs), y = T.stages[Math.min(tw.k, 2)] - 13, w = T.w - 60 - tw.k * 20;
                const st = tw.run.steps[tw.k];
                if (tw.phase === 'climb') { bx = cx - w / 2 + 20 + Math.abs(Math.sin(k * Math.PI * 1.5)) * (w - 40); by = y; }
                else if (tw.phase === 'top') { bx = cx; by = T.top - 30; }
                else { bx = st && st.go === 'pay' ? cx - w / 2 + 21 : cx + w / 2 - 21; by = y + Math.min(20, tw.t / 30); }
            }
            medal(bx, by, F.ballR, 'ball');
            Art.draw(g, 'koori', bx + 22, by + 12, { height: 30, frame: Math.floor(t / 150) });
        }
    }
    // 中央の ビックボスメダルタワー (ゲージで 少しずつ 積み上がる。ボスを 倒すと 爆散)
    function drawBigTower() {
        const k = s.shared.boss ? 1 : Math.min(1, s.shared.gauge / C.boss.gauge.full);
        const exploded = boss.phase === 'result' && boss.res && boss.res.win;
        const n = exploded ? 0 : Math.round(4 + k * 26);
        for (let i = 0; i < n; i++) { const y = BT.y + 20 - i * 6; g.fillStyle = i % 2 ? '#e8c040' : '#d0a830'; g.beginPath(); g.ellipse(BT.x, y, 26, 6, 0, 0, 7); g.fill(); }
        if (exploded) {
            for (let i = 0; i < 40; i++) { const a = i * 2.4, d = boss.t * 0.25 * (0.5 + (i % 5) / 5); medal(BT.x + Math.cos(a) * d, BT.y - 40 + Math.sin(a) * d * 0.6 + boss.t * 0.03 * (i % 3), 6); }
        }
        g.fillStyle = '#ff8a8a'; g.font = '11px "DotGothic16", monospace'; g.textAlign = 'center';
        g.fillText('ビックボスメダルタワー', BT.x, BT.y + 44);
    }
    function drawRoulette() {
        const P_ = C.roulette.pockets, n = P_.length, seg = Math.PI * 2 / n;
        g.save(); g.translate(RL.x, RL.y);
        g.fillStyle = '#0a1830'; g.beginPath(); g.arc(0, 0, RL.r + 10, 0, 7); g.fill();
        g.rotate(rl.ang);
        P_.forEach((v, i) => {
            g.fillStyle = v === 'jp' ? '#ffd75e' : v === 'again' ? '#7fe0a0' : i % 2 ? '#2a5a90' : '#3a7ab8';
            g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, RL.r, i * seg, (i + 1) * seg); g.fill();
            g.save(); g.rotate((i + 0.5) * seg); g.fillStyle = v === 'jp' ? '#6a3a00' : '#fff'; g.font = `${v === 'jp' ? 'bold 12' : '10'}px "DotGothic16", monospace`; g.textAlign = 'right';
            g.fillText(v === 'jp' ? 'JP' : v === 'again' ? 'もう1' : v, RL.r - 6, 4); g.restore();
        });
        g.restore();
        g.fillStyle = '#bff0ff'; g.beginPath(); g.arc(RL.x, RL.y, 26, 0, 7); g.fill();
        Art.draw(g, 'koori', RL.x, RL.y + 18, { height: 30 });
        // ボール (上で 止まる)
        if (rl.phase !== 'idle') medal(RL.x, RL.y - RL.r + 10, 9, 'ball');
        g.fillStyle = '#ffd75e'; g.beginPath(); g.moveTo(RL.x - 8, RL.y - RL.r - 14); g.lineTo(RL.x + 8, RL.y - RL.r - 14); g.lineTo(RL.x, RL.y - RL.r - 2); g.fill();
        g.font = '12px "DotGothic16", monospace'; g.textAlign = 'center'; g.fillText('JP ルーレット', RL.x, RL.y + RL.r + 24);
    }
    function drawBoss() {
        if (boss.phase === 'idle') return;
        const B = s.shared.boss;
        // 右の 半分を おおう
        g.fillStyle = 'rgba(30,0,10,0.72)'; g.fillRect(500, 0, 500, C.H);
        if (boss.phase === 'select') {
            const list = C.boss.list, sp = Math.max(60, 400 - boss.t * 0.09);
            const idx = boss.t > 3400 && B ? list.findIndex(x => x.id === B.id) : Math.floor(boss.t / sp) % list.length;
            const b = list[idx];
            g.fillStyle = '#ff8a8a'; g.font = '26px "DotGothic16", monospace'; g.textAlign = 'center'; g.fillText('ビックボスチャレンジ', 750, 60);
            g.fillStyle = '#fff'; g.font = '14px "M PLUS Rounded 1c", sans-serif'; g.fillText('強敵 ルーレット', 750, 90);
            drawBossArt(b.id, 750, 400, 230);
            g.fillStyle = '#ffd75e'; g.font = '22px "DotGothic16", monospace'; g.fillText(b.name, 750, 450);
            g.fillStyle = '#fff'; g.font = '14px "M PLUS Rounded 1c", sans-serif'; g.fillText(`報酬 (全席) ${b.reward} 枚・HP ${b.hp}`, 750, 476);
            return;
        }
        if (!B && boss.phase === 'fight') return;
        const id = B ? B.id : boss.res.id, def = C.boss.list.find(x => x.id === id);
        const hp = B ? B.hp : 0, max = B ? B.max : def.hp;
        const hurt = boss.hits.length && boss.hits[boss.hits.length - 1].t < 120;
        if (!(boss.phase === 'result' && boss.res.win && boss.t > 600)) drawBossArt(id, 750 + (hurt ? (Math.random() - 0.5) * 8 : 0), 380, 250);
        g.fillStyle = '#fff'; g.font = '20px "DotGothic16", monospace'; g.textAlign = 'center'; g.fillText(def.name, 750, 40);
        // HP と 時間
        g.fillStyle = '#300'; rr(560, 54, 380, 18, 9); g.fill();
        g.fillStyle = '#ff4050'; rr(560, 54, 380 * Math.max(0, hp) / max, 18, 9); g.fill();
        g.fillStyle = '#fff'; g.font = '12px "DotGothic16", monospace'; g.fillText(`HP ${Math.ceil(hp)} / ${max}`, 750, 68);
        if (B) { g.fillStyle = B.left < 10 ? '#ff6060' : '#ffd75e'; g.font = '28px "DotGothic16", monospace'; g.fillText(`${Math.ceil(B.left)}`, 950, 110); g.font = '11px "M PLUS Rounded 1c", sans-serif'; g.fillText('のこり 秒', 950, 126); }
        // 仲間 (CPU) と 自分
        const allies = [['koori', 'あなた'], ['dake', 'CPU'], ['yamamou', 'CPU'], ['ikekimu', 'CPU']];
        allies.forEach(([a, nm], i) => { const x = 580 + i * 56, y = 600; Art.draw(g, a, x, y - 10 + (boss.phase === 'fight' && Math.floor(t / 200 + i) % 3 === 0 ? -4 : 0), { height: 36, frame: Math.floor(t / 200 + i) }); g.fillStyle = i ? '#9fb8d8' : '#ffd75e'; g.font = '10px "M PLUS Rounded 1c", sans-serif'; g.fillText(nm, x, y + 2); });
        if (B) { const tot = B.dmg[0] + B.cpu; g.fillStyle = '#fff'; g.font = '12px "M PLUS Rounded 1c", sans-serif'; g.textAlign = 'left'; g.fillText(`あなたの ダメージ ${Math.round(B.dmg[0])} (${tot ? Math.round(B.dmg[0] / tot * 100) : 0}%)`, 820, 586); g.fillText('メダルを 入れる・チャッカー入賞で 攻撃！', 520, 100); }
        for (const h of boss.hits) { h.t += 16; g.globalAlpha = Math.max(0, 1 - h.t / 600); g.fillStyle = '#ffd75e'; g.font = 'bold 16px "DotGothic16", monospace'; g.textAlign = 'center'; g.fillText(`-${h.n}`, h.x, h.y - h.t * 0.05); g.globalAlpha = 1; }
        boss.hits = boss.hits.filter(h => h.t < 600);
        if (boss.phase === 'result') {
            g.fillStyle = boss.res.win ? '#ffd75e' : '#9fb8d8'; g.font = '34px "DotGothic16", monospace'; g.textAlign = 'center';
            g.fillText(boss.res.win ? '撃破！！' : 'タイムアップ…', 750, 250);
            g.font = '18px "M PLUS Rounded 1c", sans-serif'; g.fillText(`+${boss.res.rewards[0]} 枚 ${boss.res.mvp === 0 ? '・MVP ボール' : ''}`, 750, 284);
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
        const x = 520, y = boss.phase !== 'idle' ? 128 : 10, w = 460, h = 58;
        g.globalAlpha = Math.min(1, (3200 - talk.t) / 300);
        g.fillStyle = 'rgba(8,20,40,0.88)'; rr(x, y, w, h, 12); g.fill();
        g.strokeStyle = talk.color || '#fff'; g.lineWidth = 2; g.stroke();
        Art.draw(g, talk.who, x + 32, y + h - 4, { height: 48 });
        g.fillStyle = '#fff'; g.font = '15px "M PLUS Rounded 1c", sans-serif'; g.textAlign = 'left';
        g.fillText(talk.msg, x + 64, y + 34);
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
        <li>プッシャーの 上を タップ (クリック) すると、その 位置に メダルを 入れる。長押しで 連射。▼ が ねらう 位置。</li>
        <li>上段の 入り口の チャッカー (左・中央・右) に 入ると 液晶スロットの 抽選 (保留は 4 個 まで。青 → 水色 → 金 で 期待度 アップ)。</li>
        <li>スロットで ボールが 出ると、おかがっぱが ボールを 氷の 塔へ。1 段ずつ「上へ」「払い出し」「落下」。てっぺんまで 行くと JP ルーレット！</li>
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
    // 画面確認用: ?fresh=1&medals=500&ball=1&boss=1
    if (params.get('auto')) { holding = true; aimX = F.x + Number(params.get('auto')); }
})();
