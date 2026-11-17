// キャラの 絵を 描く (koori-pachinko-gaiden の js/art.js から 必要な ところだけ 写した)
// 絵は js/art-legacy.js (前作の ドット絵)。js/pixel-hd.js で 4 倍の 細かさに する
const Art = (() => {
    const cache = new Map();
    function sheet(id) {
        if (cache.has(id)) return cache.get(id);
        const a = LEGACY_ART[id];
        if (!a) return null;
        const c = document.createElement('canvas');
        c.width = a.w;
        c.height = a.h;
        const g = c.getContext('2d');
        a.rows.forEach((row, y) => {
            for (let x = 0; x < row.length; x++) {
                const color = a.palette[row[x]];
                if (color) { g.fillStyle = color; g.fillRect(x, y, 1, 1); }
            }
        });
        const hd = typeof PixelHD !== 'undefined' ? PixelHD.bake(PixelHD.fromCanvas(c)).canvas : c;
        cache.set(id, hd);
        return hd;
    }
    // 足もと まんなか (x, y)。height で 高さを きめる
    function draw(ctx, id, x, y, opt = {}) {
        const a = LEGACY_ART[id];
        const img = a && sheet(id);
        if (!img) return;
        const scale = opt.height ? opt.height / a.h : (opt.scale || 1);
        const w = a.w * scale, h = a.h * scale;
        ctx.save();
        ctx.imageSmoothingEnabled = false;
        ctx.translate(x, y);
        if (opt.flip) ctx.scale(-1, 1);
        const bob = opt.frame && opt.frame % 2 ? -scale : 0;
        ctx.drawImage(img, -w / 2, -h + bob, w, h);
        ctx.restore();
    }
    // 小さな 顔の 画像 (data URL)。報告や ランキングの 横に つかう
    function icon(id, size = 40) {
        const a = LEGACY_ART[id];
        if (!a) return '';
        const c = document.createElement('canvas');
        c.width = size; c.height = size;
        draw(c.getContext('2d'), id, size / 2, size, { height: size * Math.min(1, a.h / a.w) });
        return c.toDataURL();
    }
    return { draw, icon, has: id => Boolean(LEGACY_ART[id]) };
})();
