// Chạy: node Poker/kiemtra/mo-phong-blind.js  (~1-2 phút). Đây là bằng chứng cho các con số
// ở README §5 — muốn đổi PHUT_MOI_MUC / VAN_TOI_THIEU_MOI_MUC / thang BB_DEP thì chạy lại, đừng chỉnh mò.
// MÔ PHỎNG vòng 2: thang blind "số đẹp" sinh từ chipDau (taoLichBlind) + SÀN ván mỗi mức.
// Đo giải kéo dài bao lâu với lối chơi gần người thật. Mục tiêu: 30-60 phút.
const { taoGiai, taoLichBlind } = require('../giai.js');

// giây/ván theo số người còn đánh (poker online bạn bè, ~6-8s mỗi lượt, 2-3 vòng cược)
const giayMoiVan = (n) => 15 + 6 * n;

function danh(g, T) {
    const v = g._trong.van, id = v.luot;
    const p = g._trong.nguoi.find(x => x.id === id);
    const can = v.muc - v.cuoc[id], toiDa = v.cuoc[id] + p.chip, r = Math.random();
    if (can > 0) {
        if (r < 0.30) return g.hanhDong(id, 'bo', 0, T);
        if (r < 0.85 || toiDa <= v.muc) return g.hanhDong(id, 'theo', 0, T);
        return g.hanhDong(id, 'to', Math.min(toiDa, v.muc + v.toToiThieu), T);
    }
    if (r < 0.80 || toiDa <= v.muc) return g.hanhDong(id, 'theo', 0, T);
    return g.hanhDong(id, 'to', Math.min(toiDa, v.muc + v.toToiThieu), T);
}

function motGiai(n, chipDau, phutMoiMuc, san) {
    const g = taoGiai({ chipDau, phutMoiMuc, vanToiThieuMoiMuc: san });
    g.batDau(Array.from({ length: n }, (_, i) => ({ id: 'P' + i })), 0);
    let T = 0, van = 0, buoc = 0;
    while (g.xemChung().trangThai === 'DANG_CHAY' && buoc++ < 50000) {
        const v = g._trong.van;
        if (v && v.luot) danh(g, T);
        else if (v && ['LAT', 'XONG'].includes(v.vong)) {
            van++;
            const song = g._trong.nguoi.filter(p => p.chip > 0).length;
            T += giayMoiVan(song) * 1000 + 3000;
            g.vanKe(T);
        } else break;
    }
    return { phut: T / 60000, van, muc: g.xemChung().mucBlind };
}

function do_(n, chipDau, phut, san, lan = 40) {
    const kq = [];
    for (let i = 0; i < lan; i++) kq.push(motGiai(n, chipDau, phut, san));
    kq.sort((a, b) => a.phut - b.phut);
    const tb = kq[Math.floor(kq.length / 2)];
    return { p10: kq[Math.floor(kq.length * .1)].phut, p50: tb.phut, p90: kq[Math.floor(kq.length * .9)].phut,
             van: tb.van, muc: tb.muc, soMuc: taoLichBlind(chipDau).length };
}

const f = (x) => x.toFixed(0).padStart(3);
console.log('thang 5.000 :', taoLichBlind(5000).map(x => x.bb).join(' → '));
console.log('thang 10.000:', taoLichBlind(10000).map(x => x.bb).join(' → '));

for (const chipDau of [5000, 10000]) {
    for (const san of [0, 6, 8, 10]) {
        for (const phut of [8, 10]) {
            console.log('\n=== chip ' + chipDau + ' · sàn ' + san + ' ván/mức · ' + phut + ' phút/mức ===');
            console.log('   người   p10   p50   p90 (phút)   ván  mức-cuối');
            let dat = 0;
            for (const n of [2, 4, 6, 8]) {
                const r = do_(n, chipDau, phut, san);
                const ok = r.p50 >= 30 && r.p50 <= 60 ? ' ✓' : (r.p50 < 30 ? ' (nhanh)' : ' (lâu)');
                if (ok === ' ✓') dat++;
                console.log('     ' + n + '     ' + f(r.p10) + '   ' + f(r.p50) + '   ' + f(r.p90) + '          ' + String(r.van).padStart(3) + '   ' + r.muc + '/' + r.soMuc + ok);
            }
            console.log('   -> đạt ' + dat + '/4 cỡ bàn');
        }
    }
}
