// 音 (Web Audio)。効果音は 合成。BGM は「sounds/bgm/<場面>.mp3 が あれば それ、なければ 合成の 曲」(ほかの こおりくんシリーズと 同じ)
// 場面: normal (通常)・roulette (ルーレット)・jp (JP)・boss (ビックボスチャレンジ)。曲は いずれ Suno で 作る (企画書: 通常曲・ルーレット曲・JP 曲)
const Sound = (() => {
    const KEY = 'koori-medal-sound';
    const TR = {
        normal: { bpm: 96, m: ['E5', '.', 'B4', '.', 'C5', 'D5', 'E5', '.', 'A4', '.', 'C5', '.', 'B4', '.', '.', '.', 'G4', '.', 'A4', 'B4', 'C5', '.', 'E5', '.', 'D5', '.', 'B4', '.', 'A4', '.', '.', '.'],
            b: ['A2', '.', '.', '.', 'E3', '.', '.', '.', 'F2', '.', '.', '.', 'E2', '.', '.', '.', 'C3', '.', '.', '.', 'A2', '.', '.', '.', 'D3', '.', '.', '.', 'E2', '.', '.', '.'] },
        roulette: { bpm: 140, m: ['A4', 'C5', 'E5', 'A5', 'G5', 'E5', 'C5', 'E5', 'F5', 'D5', 'B4', 'D5', 'E5', '.', 'E5', '.', 'A4', 'C5', 'E5', 'A5', 'B5', 'A5', 'G5', 'A5', 'F5', 'E5', 'D5', 'C5', 'B4', '.', 'E5', '.'],
            b: ['A2', 'A3', 'A2', 'A3', 'A2', 'A3', 'A2', 'A3', 'D3', 'D4', 'D3', 'D4', 'E3', 'E4', 'E3', 'E4', 'A2', 'A3', 'A2', 'A3', 'F2', 'F3', 'F2', 'F3', 'D3', 'D4', 'E3', 'E4', 'E2', 'E3', 'E2', 'E3'] },
        jp: { bpm: 150, m: ['C5', 'E5', 'G5', 'C6', '.', 'G5', 'C6', 'E6', 'D6', '.', 'C6', 'B5', 'A5', 'B5', 'C6', '.', 'F5', 'A5', 'C6', 'F6', '.', 'E6', 'D6', 'C6', 'B5', 'C6', 'D6', 'G5', 'C6', '.', '.', '.'],
            b: ['C3', 'G3', 'C3', 'G3', 'C3', 'G3', 'C3', 'G3', 'G2', 'D3', 'G2', 'D3', 'A2', 'E3', 'A2', 'E3', 'F2', 'C3', 'F2', 'C3', 'F2', 'C3', 'F2', 'C3', 'G2', 'D3', 'G2', 'D3', 'C3', 'G3', 'C3', '.'] },
        boss: { bpm: 168, m: ['D5', 'D5', 'F5', 'D5', 'G5', 'F5', 'D5', 'C5', 'D5', '.', 'A5', '.', 'G5', 'F5', 'G5', '.', 'D5', 'D5', 'F5', 'D5', 'A5', 'G5', 'F5', 'G5', 'A5', 'C6', 'A5', 'G5', 'F5', 'E5', 'D5', '.'],
            b: ['D3', 'D3', 'D4', 'D3', 'D3', 'D4', 'D3', 'D4', 'A#2', 'A#2', 'A#3', 'A#2', 'C3', 'C3', 'C4', 'C3', 'D3', 'D3', 'D4', 'D3', 'D3', 'D4', 'D3', 'D4', 'A#2', 'A#3', 'C3', 'C4', 'A2', 'A3', 'D3', 'D3'] }
    };
    const NOTE = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
    const freq = n => { const m = /^([A-G]#?)(\d)$/.exec(n); return 440 * Math.pow(2, ((Number(m[2]) + 1) * 12 + NOTE[m[1]] - 69) / 12); };
    let ctx = null, se = null, bgm = null, track = null, step = 0, next = 0, slow = 1;
    let st = { vol: 0.6, mute: false };
    try { st = { ...st, ...(JSON.parse(localStorage.getItem(KEY)) || {}) }; } catch (e) { /* なし */ }
    const files = {};
    const saveSt = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* なし */ } };
    function unlock() {
        if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        ctx = new AC();
        se = ctx.createGain(); se.connect(ctx.destination);
        bgm = ctx.createGain(); bgm.connect(ctx.destination);
        apply();
        setInterval(schedule, 25);
        if (track) play(track, true);
    }
    const fileOn = () => !!(track && files[track] && files[track].ready && !files[track].failed);
    function apply() {
        const v = st.mute ? 0 : st.vol;
        if (se) se.gain.value = v * 0.5;
        if (bgm) bgm.gain.setTargetAtTime(fileOn() ? 0 : v * 0.09 * slow, ctx.currentTime, 0.05);
        for (const [n, f] of Object.entries(files)) {
            if (n === track && !f.failed && ctx && !st.mute) { f.audio.volume = Math.min(1, v * 0.8 * slow); if (f.audio.paused) f.audio.play().catch(() => { /* まだ */ }); }
            else if (!f.audio.paused) f.audio.pause();
        }
    }
    function fileOf(n) {
        if (files[n] || typeof Audio === 'undefined') return;
        const a = new Audio(), f = { audio: a, ready: false, failed: false };
        a.loop = true; a.preload = 'auto';
        a.addEventListener('error', () => { f.failed = true; apply(); });
        a.addEventListener('canplay', () => { f.ready = true; apply(); });
        a.src = `sounds/bgm/${n}.mp3`;
        files[n] = f;
    }
    function play(n, force) {
        if (!TR[n] || (n === track && !force)) return;
        track = n; step = 0; slow = 1;
        fileOf(n);
        if (ctx) { next = ctx.currentTime + 0.08; apply(); }
    }
    // ルーレットで ボールが ゆっくりに なるほど BGM が 細く なる (企画書)
    function thin(v) { slow = Math.max(0.15, v); if (ctx) apply(); }
    function schedule() {
        if (!ctx || !track || fileOn() || st.mute) return;
        const tr = TR[track], dur = 60 / tr.bpm / 2;
        while (next < ctx.currentTime + 0.15) {
            const i = step % tr.m.length;
            if (tr.m[i] !== '.') tone(tr.m[i], next, dur * 0.9, 'square', 0.5, bgm);
            if (tr.b[i] !== '.') tone(tr.b[i], next, dur * 0.95, 'triangle', 0.9, bgm);
            next += dur; step++;
        }
    }
    function tone(n, at, dur, type, vol, bus) {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = type; o.frequency.value = typeof n === 'number' ? n : freq(n);
        g.gain.setValueAtTime(vol, at); g.gain.exponentialRampToValueAtTime(0.001, at + dur);
        o.connect(g); g.connect(bus || se); o.start(at); o.stop(at + dur + 0.02);
    }
    function noise(at, dur, vol, hp = 1000) {
        const len = Math.floor(ctx.sampleRate * dur), buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
        const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
        f.type = 'highpass'; f.frequency.value = hp; g.gain.value = vol;
        src.buffer = buf; src.connect(f); f.connect(g); g.connect(se); src.start(at);
    }
    let lastClink = 0;
    const SE = {
        // メダルが 落ちる たび「シャリン」(氷の 音)
        // 2026-11-19 重厚感: 低めの 音に ずしっと した 音を 足す
        clink: () => { const t = ctx.currentTime; if (t - lastClink < 0.05) return; lastClink = t; const f = 1500 + Math.random() * 600; tone(f, t, 0.14, 'sine', 0.16); tone(f * 1.42, t + 0.02, 0.1, 'sine', 0.08); tone(150, t, 0.09, 'triangle', 0.14); },
        insert: () => { const t = ctx.currentTime; tone(900, t, 0.05, 'square', 0.06); tone(180, t, 0.07, 'triangle', 0.1); },
        chakker: () => { const t = ctx.currentTime; ['E6', 'G6', 'B6'].forEach((n, i) => tone(n, t + i * 0.05, 0.12, 'square', 0.15)); },
        stop: () => { tone(330, ctx.currentTime, 0.08, 'square', 0.2); },
        reach: () => { const t = ctx.currentTime; for (let i = 0; i < 6; i++) tone(i % 2 ? 'A5' : 'E5', t + i * 0.09, 0.08, 'square', 0.18); },
        hit: () => { const t = ctx.currentTime; ['C5', 'E5', 'G5', 'C6', 'E6', 'G6'].forEach((n, i) => tone(n, t + i * 0.07, 0.22, 'square', 0.2)); },
        okagappa: () => { const t = ctx.currentTime; tone('G5', t, 0.1, 'square', 0.2); tone('C6', t + 0.1, 0.25, 'square', 0.2); },
        up: () => { const t = ctx.currentTime; ['C5', 'G5'].forEach((n, i) => tone(n, t + i * 0.08, 0.15, 'triangle', 0.4)); },
        crack: () => { const t = ctx.currentTime; noise(t, 0.25, 0.5, 2500); tone(180, t, 0.2, 'sawtooth', 0.15); },
        fall: () => { const t = ctx.currentTime; for (let i = 0; i < 8; i++) tone(800 - i * 80, t + i * 0.05, 0.06, 'square', 0.12); },
        pay: () => { const t = ctx.currentTime; tone('B5', t, 0.06, 'square', 0.2); tone('E6', t + 0.06, 0.25, 'square', 0.2); },
        tick: () => { tone(1200, ctx.currentTime, 0.02, 'square', 0.1); },
        jp: () => { const t = ctx.currentTime; noise(t, 0.6, 0.4, 3000); ['C5', 'E5', 'G5', 'C6', 'G5', 'C6', 'E6', 'G6', 'C7'].forEach((n, i) => tone(n, t + i * 0.1, 0.4, 'square', 0.22)); },
        roar: () => { const t = ctx.currentTime; tone(90, t, 0.8, 'sawtooth', 0.35); tone(70, t + 0.1, 0.9, 'sawtooth', 0.3); noise(t, 0.8, 0.25, 300); },
        attack: () => { const t = ctx.currentTime; noise(t, 0.06, 0.25, 1800); tone(520, t, 0.05, 'square', 0.12); },
        win: () => { const t = ctx.currentTime; ['G4', 'C5', 'E5', 'G5', 'E5', 'G5', 'C6'].forEach((n, i) => tone(n, t + i * 0.12, 0.3, 'square', 0.22)); },
        lose: () => { const t = ctx.currentTime; ['E4', 'D#4', 'D4', 'C#4'].forEach((n, i) => tone(n, t + i * 0.2, 0.25, 'triangle', 0.4)); },
        boom: () => { const t = ctx.currentTime; noise(t, 1.2, 0.7, 120); tone(60, t, 1, 'sawtooth', 0.3); }
    };
    function sfx(n) { if (!ctx || st.mute || !SE[n]) return; try { SE[n](); } catch (e) { /* なし */ } }
    ['pointerdown', 'keydown'].forEach(ev => addEventListener(ev, unlock, { passive: true }));
    return { play, se: sfx, thin, setVol(v) { st.vol = v; saveSt(); if (ctx) apply(); }, setMute(m) { st.mute = !!m; saveSt(); if (ctx) apply(); }, get vol() { return st.vol; }, get mute() { return st.mute; } };
})();
