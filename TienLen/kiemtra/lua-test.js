// LÙA BUG: đánh hàng trăm ván thật qua xuLy() (đúng đường HTTP đi) với 2–4 máy đánh NGẪU NHIÊN,
// kèm mưa yêu cầu BẬY (sai lượt, lá không có, bộ không hợp lệ, ngồi giữa ván, rời giữa ván...).
// Sau MỖI nước và MỖI ván soi bất biến. Cái gì lệch là lỗi thật, không phải chuyện xác suất.
// Chạy: node TienLen/kiemtra/lua-test.js [soVan=300]
'use strict';
const { taoTienLen, VON_HE_SO } = require('../web.js');
const B = require('../bai.js');

const SO_VAN = Number(process.argv[2]) || 300;
let P = 0, F = 0; const loi = [];
const ok = (t, dk, them) => { if (dk) P++; else { F++; if (loi.length < 25) loi.push(t + (them ? '  ->  ' + them : '')); } };

const ID = ['A', 'B', 'C', 'D'];
function dung(cfg) {
    const vi = {}; ID.forEach(id => vi[id] = 200000);
    const log = []; let phe = 0;
    const tl = taoTienLen({
        layNguoi: (id) => vi[id] === undefined ? null : { name: id, points: vi[id], ingameName: id },
        congVi: (id, t) => { vi[id] += t; },
        thuPhe: (t) => { phe += t; },
        laAdmin: (id) => id === 'A', tenCua: (id) => id, ghiLog: (d) => log.push(d),
        giayXemKet: 0,
    });
    tl.quanLy.datCauHinh(Object.assign({ mucCuoc: 1000, giaLa: 500 }, cfg));
    return { tl, vi, log, phe: () => phe };
}
function goi(tl, duong, than, toi) {
    let ra = null;
    tl.xuLy({ path: duong, method: than ? 'POST' : 'GET', body: than || {}, userId: toi }, null, (r, ma, j) => { ra = { ma, j }; });
    return ra;
}
const rnd = (n) => Math.floor(Math.random() * n);
const pick = (a) => a[rnd(a.length)];

/** mọi nước hợp lệ từ tay (giống cMoiNuoc của web) */
function moiNuoc(tay, truoc) {
    const ra = [], theoSo = {};
    for (const la of tay) { const so = B.doc(la).so; (theoSo[so] = theoSo[so] || []).push(la); }
    const thu = (mo) => { const bo = B.nhanDang(mo); if (bo && B.danhDuoc(bo, truoc).ok) ra.push(mo); };
    for (const so of Object.keys(theoSo)) {
        const g = B.xepBai(theoSo[so]);
        g.forEach(l => thu([l])); if (g.length >= 2) thu(g.slice(0, 2)); if (g.length >= 3) thu(g.slice(0, 3)); if (g.length >= 4) thu(g);
    }
    const hang = Object.keys(theoSo).map(x => B.HANG_SO[x]).filter(h => B.SO[h] !== '2').sort((a, b) => a - b);
    for (let i = 0; i < hang.length; i++) {
        const day = [hang[i]]; for (let j = i + 1; j < hang.length && hang[j] === hang[j - 1] + 1; j++) day.push(hang[j]);
        for (let k = 3; k <= day.length; k++) thu(day.slice(0, k).map(h => B.xepBai(theoSo[B.SO[h]])[0]));
    }
    const doi = hang.filter(h => theoSo[B.SO[h]].length >= 2);
    for (let i = 0; i < doi.length; i++) {
        const day = [doi[i]]; for (let j = i + 1; j < doi.length && doi[j] === doi[j - 1] + 1; j++) day.push(doi[j]);
        for (let k = 3; k <= day.length; k++) { let mo = []; for (let q = 0; q < k; q++) mo = mo.concat(B.xepBai(theoSo[B.SO[day[q]]]).slice(0, 2)); thu(mo); }
    }
    return ra;
}

// ---------------------------------------------------------------- chạy
const thongKe = { van: 0, nuoc: 0, chat: 0, thoi: 0, toiTrang: 0, bay: 0, moiRa: 0, tanBan: 0, anhet: 0, hang: 0 };
let banIdx = 0;
while (thongKe.van < SO_VAN) {
    banIdx++;
    const n = 2 + rnd(3);
    const cheDo = rnd(2) ? 'hang' : 'anhet';
    const { tl, vi, log, phe } = dung({ cheDo, toiTrangOn: rnd(2) === 0, chatHeoOn: true, thoiHeoOn: true, baBichOn: rnd(2) === 0 });
    const nguoi = ID.slice(0, n);
    for (let i = 0; i < n; i++) { const r = goi(tl, '/ngoi', { ghe: i }, nguoi[i]); ok('ngồi được', r.ma === 200, r.j && r.j.error); }
    for (const id of nguoi) goi(tl, '/sansang', {}, id);
    ok('bàn ' + banIdx + ' mở khi ai cũng sẵn sàng', !!tl.phong.ban, JSON.stringify(goi(tl, '/state', null, 'A').j.sanSang));
    if (!tl.phong.ban) continue;

    let vanBan = 0, tongTruoc = null;
    while (tl.phong.ban && vanBan < 6 && thongKe.van < SO_VAN) {
        const ban = tl.phong.ban;
        const s0 = ban.xemChung();
        if (s0.trangThai !== 'DANG_CHAY') { tl.nhip(); tl.nhip(); if (!tl.phong.ban) break; continue; }
        const v = ban._trong.van;
        const tongViDau = nguoi.reduce((a, id) => a + vi[id], 0);
        const soVan = v.so;

        // ---- bất biến lúc chia ----
        ok('chia đủ 13 lá / người', Object.values(v.tay).every(t => t.length === 13) || !!v.ketQua, JSON.stringify(Object.values(v.tay).map(t => t.length)));
        ok('52 lá không trùng', new Set([].concat(...Object.values(v.tay))).size === Object.keys(v.tay).length * 13 || !!v.ketQua);
        if (v.ketQua && v.ketQua.toiTrang) thongKe.toiTrang++;

        // ---- mưa yêu cầu bậy giữa ván ----
        if (!v.ketQua) {
            const ngoai = ID[n] || 'D';
            if (n < 4) { const r = goi(tl, '/ngoi', { ghe: n }, ngoai); ok('ngồi giữa ván bị chặn', r.ma === 400, r.j && r.j.error); }
            const rr = goi(tl, '/roi', {}, nguoi[0]); ok('rời giữa ván bị chặn', rr.ma === 400, rr.j && rr.j.error);
            const kh = nguoi.find(id => id !== v.luot);
            const r1 = goi(tl, '/danh', { la: [v.tay[kh][0]] }, kh); ok('đánh sai lượt bị chặn', r1.ma === 400, r1.j && r1.j.error);
            const r2 = goi(tl, '/danh', { la: ['Zz'] }, v.luot); ok('mã lá bậy bị chặn', r2.ma === 400);
            const r3 = goi(tl, '/danh', { la: [] }, v.luot); ok('mảng rỗng bị chặn', r3.ma === 400);
            const laKhac = v.tay[kh][0];
            const r4 = goi(tl, '/danh', { la: [laKhac] }, v.luot); ok('đánh lá của NGƯỜI KHÁC bị chặn', r4.ma === 400, r4.j && r4.j.error);
            const r5 = goi(tl, '/danh', { la: [v.tay[v.luot][0], v.tay[v.luot][0]] }, v.luot); ok('lá trùng bị chặn', r5.ma === 400);
            const r6 = goi(tl, '/sansang', {}, v.luot); ok('sẵn sàng giữa ván bị chặn', r6.ma === 400);
            ok('mưa yêu cầu bậy KHÔNG đổi ví', nguoi.reduce((a, id) => a + vi[id], 0) === tongViDau);
        }

        // ---- đánh ngẫu nhiên tới hết ván ----
        let buoc = 0, viecTruocLuot = {};
        while (!v.ketQua && buoc++ < 500) {
            const id = v.luot;
            ok('luôn có người tới lượt khi ván đang đánh', !!id, JSON.stringify({ so: v.so, bo: v.bo && v.bo.ten }));
            if (!id) break;
            ok('người tới lượt còn bài', (v.tay[id] || []).length > 0, id);
            ok('người tới lượt chưa bỏ lượt vòng này', !v.daBo.has(id), id);
            const truoc = v.bo;
            let nuoc = moiNuoc(v.tay[id], truoc);
            // Ván ĐẦU của bàn: người cầm 3♠ đi trước và BẮT BUỘC đánh bộ có 3♠ (luật ba bích).
            if (v.batBuoc3Bich) {
                const co3 = nuoc.filter(mo => mo.indexOf('3s') >= 0);
                ok('luật ba bích: người mở ván đầu phải cầm 3♠', v.tay[id].indexOf('3s') >= 0 && co3.length > 0, id);
                nuoc = co3;
            }
            const soLaTruoc = v.tay[id].length, boTruoc = truoc ? truoc.la.join() : '';
            let r;
            if (nuoc.length && (!truoc || rnd(4) !== 0)) {
                const mo = pick(nuoc);
                r = goi(tl, '/danh', { la: mo }, id);
                ok('nước hợp lệ được nhận', r.ma === 200, (r.j && r.j.error) + ' | ' + mo.join(' ') + ' đè ' + boTruoc);
                if (r.ma === 200) {
                    thongKe.nuoc++;
                    ok('tay bớt đúng số lá', (v.tay[id] || []).length === soLaTruoc - mo.length);
                    const vl = v.vuaLam[id]; ok('có nhãn vừa làm', vl && vl.viec === 'danh');
                    if (vl && vl.chat) thongKe.chat++;
                    ok('chongBai có nước vừa đánh', v.chongBai.length > 0 && v.chongBai[v.chongBai.length - 1].la.join() === B.xepBai(mo).join());
                }
            } else {
                r = goi(tl, '/boluot', {}, id);
                if (!truoc) ok('mở lượt mà bỏ thì bị chặn', r.ma === 400, r.j && r.j.error);
                else ok('bỏ lượt được nhận', r.ma === 200, r.j && r.j.error);
                if (r.ma !== 200 && nuoc.length) { r = goi(tl, '/danh', { la: nuoc[0] }, id); thongKe.nuoc++; }
                if (r.ma !== 200 && !nuoc.length && !truoc) ok('KẸT: mở lượt nhưng không có nước nào (vô lý)', false, JSON.stringify(v.tay[id]));
            }
            // bất biến sau nước
            if (!v.bo) ok('hết vòng thì chongBai rỗng', v.chongBai.length === 0 && v.daBo.size === 0);
            if (v.bo) ok('bo trên bàn có cao', !!v.bo.cao);
            const conBai = nguoi.filter(x => (v.tay[x] || []).length > 0);
            if (!v.ketQua) ok('ván chưa xong thì ≥2 người còn bài (hoặc anhet chưa ai về)', conBai.length >= 2 || cheDo === 'anhet');
        }
        ok('ván kết thúc trong 500 nước', !!v.ketQua, 'treo ở ván ' + soVan);
        if (!v.ketQua) break;

        // ---- bất biến cuối ván ----
        const kq = v.ketQua;
        thongKe.van++; if (cheDo === 'anhet') thongKe.anhet++; else thongKe.hang++;
        ok('hạng đủ người, không trùng', kq.hang.length === n && new Set(kq.hang).size === n, JSON.stringify(kq.hang));
        const tongTien = Object.values(kq.tien).reduce((a, b) => a + b, 0);
        ok('tổng tiền ván = −phế', tongTien === -kq.pheTong, tongTien + ' vs ' + kq.pheTong);
        ok('phế chỉ cắt người ăn dương', Object.keys(kq.phe).every(id => kq.phe[id] === 0 || kq.tien[id] + kq.phe[id] > 0));
        ok('phế = 10% phần ăn (làm tròn xuống)', Object.keys(kq.phe).every(id => kq.phe[id] === 0 || kq.phe[id] === Math.floor((kq.tien[id] + kq.phe[id]) * 0.1)));
        if (cheDo === 'hang') {
            ok('hạng: nhất ăn của bét', kq.chiTiet[kq.hang[0]].cuoc === 1000 && kq.chiTiet[kq.hang[n - 1]].cuoc === -1000 || !!kq.toiTrang, JSON.stringify(kq.chiTiet));
            if (n === 3) ok('3 người: nhì hoà cược', kq.chiTiet[kq.hang[1]].cuoc === 0 || !!kq.toiTrang);
        } else if (!kq.toiTrang) {
            const nhat = kq.hang[0];
            ok('anhet: nhất ăn cược của mọi người', kq.chiTiet[nhat].cuoc === 1000 * (n - 1));
            for (const id of nguoi) if (id !== nhat) ok('anhet: đếm lá = số lá × 500', kq.chiTiet[id].demLa === -kq.chiTiet[id].la * 500, JSON.stringify(kq.chiTiet[id]));
            ok('anhet: nhất không còn lá', (v.tay[nhat] || []).length === 0);
        }
        for (const id of nguoi) { if (kq.chiTiet[id].thoi) thongKe.thoi++; }
        // thối 2 đúng luật
        if (!kq.toiTrang) for (const id of nguoi) {
            if (id === kq.hang[0]) continue;
            const h = B.demHeo(v.tay[id] || []); const mong = -(h.den + h.do * 2) * 1000;
            ok('thối 2 đúng mức (đen 1, đỏ 2)', kq.chiTiet[id].thoi === mong, id + ' ' + kq.chiTiet[id].thoi + ' vs ' + mong);
        }
        // ví thật khớp kết quả
        const tongViSau = nguoi.reduce((a, id) => a + vi[id], 0);
        ok('ví thật hụt đúng bằng phế ván này', tongViDau - tongViSau === kq.pheTong, (tongViDau - tongViSau) + ' vs ' + kq.pheTong);
        for (const id of nguoi) ok('không ví nào âm', vi[id] >= 0, id + '=' + vi[id]);
        ok('lat lộ bài cả bàn lúc xong', kq.lat.length === n);
        // gọi nhịp thừa: không trả lần 2
        const truocNhip = nguoi.reduce((a, id) => a + vi[id], 0);
        const banCu = tl.phong.ban;
        // đóng cửa vào muộn: ngồi lúc CHỜ giữa 2 ván -> được (nếu còn ghế)
        if (n < 4) { const r = goi(tl, '/ngoi', { ghe: n }, ID[n]); ok('ngồi giữa 2 ván được nhận', r.ma === 200, r.j && r.j.error); goi(tl, '/roi', {}, ID[n]); }
        tl.nhip();           // chia ván kế (giayXemKet 0)
        // Ví chỉ được đổi nếu ván VỪA CHIA đã xong ngay (tới trắng lúc chia). Ngoài ra mà đổi
        // nghĩa là ván cũ bị trả tiền hai lần — lỗi mất tiền, phải bắt cho bằng được.
        const vanMoi = tl.phong.ban && tl.phong.ban._trong.van;
        const chiaXongLuon = !!(vanMoi && vanMoi.so !== soVan && vanMoi.ketQua);
        if (chiaXongLuon) { thongKe.toiTrang++; ok('ván chia xong ngay thì phải là tới trắng', !!vanMoi.ketQua.toiTrang); }
        else ok('nhịp không trả tiền lần 2 cho ván cũ', nguoi.reduce((a, id) => a + vi[id], 0) === truocNhip,
            (nguoi.reduce((a, id) => a + vi[id], 0) - truocNhip) + '');
        vanBan++;
        if (tl.phong.ban && tl.phong.ban._trong.van && !tl.phong.ban._trong.van.ketQua)
            ok('ván kế: người về nhất ván trước đi đầu', tl.phong.ban._trong.van.luot === kq.hang[0] || !!kq.toiTrang && tl.phong.ban._trong.van.luot === kq.toiTrang.id, tl.phong.ban._trong.van.luot + ' vs ' + kq.hang[0]);
    }
    // ---- hết vốn thì bị mời ra ----
    if (tl.phong.ban) {
        const nan = nguoi[1]; vi[nan] = 100;
        const truoc = tl.phong.ban.xemChung().nguoi.length;
        // kết thúc ván hiện tại bằng nhịp AFK
        for (let k = 0; k < 400 && tl.phong.ban && tl.phong.ban._trong.van && !tl.phong.ban._trong.van.ketQua; k++) { tl.phong.ban.roiMang(tl.phong.ban._trong.van.luot); tl.phong.ban.nhip(); }
        tl.nhip(); tl.nhip();
        const sau = tl.phong.ban ? tl.phong.ban.xemChung().nguoi.length : 0;
        ok('người hết vốn bị mời ra trước ván kế', sau === truoc - 1 || (truoc === 2 && !tl.phong.ban), truoc + ' -> ' + sau);
        ok('có log mời ra', log.some(d => /Mời .* rời bàn/.test(d)));
        if (!tl.phong.ban) thongKe.tanBan++; thongKe.moiRa++;
        ok('ghế của người bị mời trống lại', tl.phong.ghe.indexOf(nan) < 0);
    }
}

console.log('\n📊 ' + thongKe.van + ' ván · ' + thongKe.nuoc + ' nước · ' + thongKe.chat + ' lần chặt · ' + thongKe.thoi + ' lượt thối 2 · ' +
    thongKe.toiTrang + ' tới trắng · hạng ' + thongKe.hang + ' / ăn hết ' + thongKe.anhet + ' · mời ra ' + thongKe.moiRa + ' · tan bàn ' + thongKe.tanBan);
if (loi.length) { console.log('\n❌ LỖI (' + F + '):'); loi.forEach(l => console.log('  ' + l)); }
console.log('\n🐛 LÙA BUG TIẾN LÊN: ' + P + ' đạt, ' + F + ' hỏng');
process.exit(F ? 1 : 0);
