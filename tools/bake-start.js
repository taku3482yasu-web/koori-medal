// はじめの メダルの 山を 先に 作って js/start-field.js に 書く (node tools/bake-start.js)
// スマホでは 山を 作る 計算 (fill = 360 コマ) が 10 秒 ちかく かかって 画面が 出なかった (2026-11-19)。
// 台の 形 (config.js の field・coin25d.js の DEF) や startUpper / startLower を かえたら 作りなおす。
const fs = require('fs'), path = require('path');
const C = require('../js/game.js').C, Coin25D = require('../js/coin25d.js'), F = C.field;
const P = Coin25D.create({ side: F.side, seed: 20261119, R: F.medalR, T: F.medalT, RB: F.ballR });
P.fill(F.startUpper, F.startLower);
for (let i = 0; i < 90; i++) P.step(); P.take();
const snap = P.snapshot().filter(c => c[3] < 2);
fs.writeFileSync(path.join(__dirname, '../js/start-field.js'),
    `// はじめの メダルの 山 (tools/bake-start.js で 作った もの。手で 書きかえない)\nconst START_FIELD = ${JSON.stringify(snap)};\n`);
console.log('メダル', snap.length, '枚');
