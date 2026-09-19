// LÙA BUG: đánh hàng trăm ván thật qua xuLy() (đúng đường HTTP đi) với 2–4 máy đánh NGẪU NHIÊN,
// kèm mưa yêu cầu BẬY (sai lượt, lá không có, bộ không hợp lệ, ngồi giữa ván, rời giữa ván...).
// Sau MỖI nước và MỖI ván soi bất biến. Cái gì lệch là lỗi thật, không phải chuyện xác suất.
// Chạy: node TienLen/kiemtra/lua-test.js [soVan=300]
'use strict';
const { taoTienLen, VON_HE_SO } = require('../web.js');
const B = require('../bai.js');
const V = require('../van.js');
const CUOC = 1000;                              // 1 cược = 1.000 cho dễ nhẩm

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
    tl.quanLy.datCauHinh(Object.assign({ mucCuoc: CUOC }, cfg));
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
const thongKe = { van: 0, nuoc: 0, chat: 0, thoi: 0, toiTrang: 0, bay: 0, moiRa: 0, tanBan: 0, anhet: 0, hang: 0,
    cong: 0, vanCoCong: 0, congHang: 0, congAnhet: 0, nhotHang: 0, thuaNhatHang: 0, thuaNhatAnhet: 0 };
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
                    // Đánh xong có HAI ngả: (1) vòng còn chạy -> nước vừa đánh nằm cuối chồng bài;
                    // (2) mọi người còn lại đã bỏ hoặc hết bài -> ĂN LUÔN VÒNG, bàn dọn sạch và
                    // chính mình mở vòng mới. Ngả (2) chỉ xuất hiện sau khi sửa luật bỏ lượt
                    // (bỏ là nghỉ hết vòng) — trước đó daBo bị xoá mỗi nước nên không bao giờ gặp.
                    if (v.bo && v.boCua === id)
                        ok('chongBai có nước vừa đánh', v.chongBai.length > 0 && v.chongBai[v.chongBai.length - 1].la.join() === B.xepBai(mo).join());
                    else if (!v.ketQua)
                        ok('đánh xong ăn luôn vòng -> bàn dọn sạch, tự mở vòng mới',
                            v.bo === null && v.chongBai.length === 0 && v.daBo.size === 0,
                            JSON.stringify({ bo: !!v.bo, chong: v.chongBai.length, daBo: [...v.daBo] }));
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
        const bangGia = V.BANG_CUOC[cheDo];
        const cong = new Set(kq.cong || []);
        thongKe.cong += cong.size;
        if (cong.size) thongKe.vanCoCong++;
        if (cheDo === 'hang') thongKe.congHang += cong.size; else thongKe.congAnhet += cong.size;
        for (const id of nguoi) { const k = cheDo === 'hang' ? 'thuaNhatHang' : 'thuaNhatAnhet'; thongKe[k] = Math.min(thongKe[k], kq.tien[id] || 0); }
        if (!kq.toiTrang) {
            ok('người về NHẤT không bao giờ bị cóng', !cong.has(kq.hang[0]), kq.hang[0]);
            ok('người cóng bị xếp xuống cuối bảng hạng',
                [...cong].every(id => kq.hang.indexOf(id) >= n - cong.size), JSON.stringify(kq.hang) + ' cóng ' + JSON.stringify([...cong]));
        }
        if (cheDo === 'hang' && !kq.toiTrang) {
            const vt = V.BANG_VI_TRI[n];
            let lech = 0;
            for (let i = 1; i < n; i++) {                       // bỏ qua nhất: nhất ôm phần dôi
                const id = kq.hang[i];
                const mong = Math.round((cong.has(id) ? vt[n - 1] * V.CONG_NHAN : vt[i]) * CUOC);
                ok('hạng: ăn thua theo đúng bảng vị trí', kq.chiTiet[id].cuoc === mong,
                    id + ' hạng ' + (i + 1) + (cong.has(id) ? ' (cóng)' : '') + ': ' + kq.chiTiet[id].cuoc + ' vs ' + mong);
                lech += kq.chiTiet[id].cuoc;
            }
            ok('hạng: khoản cược của cả bàn cộng lại bằng 0', kq.chiTiet[kq.hang[0]].cuoc + lech === 0,
                JSON.stringify(nguoi.map(id => kq.chiTiet[id].cuoc)));
        } else if (!kq.toiTrang) {
            const nhat = kq.hang[0];
            ok('đếm lá: KHÔNG còn khoản cược nền', nguoi.every(id => kq.chiTiet[id].cuoc === 0), JSON.stringify(nguoi.map(id => kq.chiTiet[id].cuoc)));
            for (const id of nguoi) {
                if (id === nhat) continue;
                const mong = -kq.chiTiet[id].la * CUOC * (cong.has(id) ? V.CONG_NHAN : 1);
                ok('đếm lá: mỗi lá 1 cược, cóng thì gấp đôi', kq.chiTiet[id].demLa === mong, id + ': ' + kq.chiTiet[id].demLa + ' vs ' + mong);
            }
            ok('đếm lá: nhất không còn lá', (v.tay[nhat] || []).length === 0);
        }
        for (const id of nguoi) { if (kq.chiTiet[id].thoi) thongKe.thoi++; }
        // NHỐT (thối) đúng bảng giá: heo TỪNG LÁ + hàng, cóng thì gấp đôi
        if (!kq.toiTrang) for (const id of nguoi) {
            if (id === kq.hang[0]) continue;
            const muc = B.doTay(v.tay[id] || []).muc;
            const mong = -Math.round(V.cuocCuaMuc(muc, bangGia) * CUOC * (cong.has(id) ? V.CONG_NHAN : 1));
            ok('nhốt đúng bảng giá của chế độ', kq.chiTiet[id].thoi === mong,
                id + ' [' + muc.join(' ') + '] ' + kq.chiTiet[id].thoi + ' vs ' + mong);
            if (muc.length) thongKe.nhotHang += muc.filter(k => k === 'tu' || k === 'thong3' || k === 'thong4').length;
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
        const nan = nguoi[1];
        const truoc = tl.phong.ban.xemChung().nguoi.length;
        // Vét ví rồi đẩy bàn chạy tới lúc chia ván kế. Phải VÉT LẠI mỗi vòng vì ván đang chạy
        // vẫn trả tiền — về nhất ăn hơn 30 cược là ví đủ trở lại, không bị mời ra, rồi phép
        // kiểm đỏ oan. Đặt số vòng có trần để hỏng thật thì vẫn hỏng chứ không treo.
        let daMoi = false;
        for (let vong = 0; vong < 6 && !daMoi && tl.phong.ban; vong++) {
            vi[nan] = 100;
            for (let k = 0; k < 400 && tl.phong.ban && tl.phong.ban._trong.van && !tl.phong.ban._trong.van.ketQua; k++) {
                tl.phong.ban.roiMang(tl.phong.ban._trong.van.luot); tl.phong.ban.nhip();
            }
            vi[nan] = 100;
            tl.nhip(); tl.nhip();        // nhịp 1 đặt mốc xem kết quả, nhịp 2 gọi vanKe() -> mời ra
            daMoi = tl.phong.ghe.indexOf(nan) < 0;
        }
        const sau = tl.phong.ban ? tl.phong.ban.xemChung().nguoi.length : 0;
        // Chạy vài ván nên người KHÁC cũng có thể tụt dưới vốn và bị mời ra cùng — đừng đòi
        // đúng một người. Điều phải đúng là: kẻ bị vét ví KHÔNG còn ngồi đó nữa, và ai còn
        // ngồi thì đều đủ vốn.
        ok('người hết vốn bị mời ra trước ván kế', daMoi || !tl.phong.ban, truoc + ' -> ' + sau);
        const von = tl.phong.cauHinh.mucCuoc * (VON_HE_SO[tl.phong.cauHinh.cheDo] || 30);
        ok('ai còn ngồi lại đều đủ vốn tối thiểu',
            tl.phong.ghe.filter(Boolean).every(id => vi[id] >= von),
            JSON.stringify(tl.phong.ghe.filter(Boolean).map(id => id + '=' + vi[id])) + ' cần ' + von);
        ok('có log mời ra', log.some(d => /Mời .* rời bàn/.test(d)));
        if (!tl.phong.ban) thongKe.tanBan++; thongKe.moiRa++;
        ok('ghế của người bị mời trống lại', tl.phong.ghe.indexOf(nan) < 0);
    }
}

console.log('\n📊 ' + thongKe.van + ' ván · ' + thongKe.nuoc + ' nước · ' + thongKe.chat + ' lần chặt · ' + thongKe.thoi + ' lượt nhốt · ' +
    thongKe.nhotHang + ' lần nhốt HÀNG · ' + thongKe.toiTrang + ' tới trắng');
console.log('   truyền thống ' + thongKe.hang + ' ván / đếm lá ' + thongKe.anhet + ' ván · mời ra ' + thongKe.moiRa + ' · tan bàn ' + thongKe.tanBan);
console.log('🧊 CÓNG: ' + thongKe.cong + ' lượt người, ở ' + thongKe.vanCoCong + '/' + thongKe.van + ' ván (' +
    Math.round(thongKe.vanCoCong / Math.max(1, thongKe.van) * 100) + '% số ván)' +
    '  ·  truyền thống ' + thongKe.congHang + ' lượt / đếm lá ' + thongKe.congAnhet + ' lượt');
// ⚠️ Vốn tối thiểu phải TÍNH RA, đừng gõ tay: gõ tay là có ngày in sai rồi tự mình tin
// nhầm là đang vỡ ví (đã in nhầm 150.000 thay vì 600.000 cho phòng đếm lá 5.000).
const quy = (c, that, cheDo) => {
    const soCuoc = Math.round(-c / CUOC);
    const von = that * (VON_HE_SO[cheDo] || 30);
    const mat = soCuoc * that;
    return soCuoc + ' cược = ' + mat.toLocaleString('vi-VN') +
        '  ·  vốn tối thiểu ' + von.toLocaleString('vi-VN') +
        (mat > von ? '  ⚠️ VƯỢT VỐN!' : '  ✅');
};
console.log('💸 THUA ĐẬM NHẤT MỘT VÁN (quy ra giá bàn thật):');
console.log('   truyền thống (1 cược 50.000): ' + quy(thongKe.thuaNhatHang, 50000, 'hang'));
console.log('   đếm lá      (1 cược  5.000): ' + quy(thongKe.thuaNhatAnhet, 5000, 'anhet'));
if (loi.length) { console.log('\n❌ LỖI (' + F + '):'); loi.forEach(l => console.log('  ' + l)); }
console.log('\n🐛 LÙA BUG TIẾN LÊN: ' + P + ' đạt, ' + F + ' hỏng');
process.exit(F ? 1 : 0);
