#!/usr/bin/env node
// ============================================================================
// surgical_expratio.js, hạ ExpRatio boss THÁP (dòng GYM_*) trong DT_PalMonsterParameter(_Common)
// bằng VÁ BYTE vào .uexp GỐC (bảng này dính bug FName "_2" nên KHÔNG round-trip JSON được).
//
// Cách: (1) từ A.json (tojson của uexp gốc) tạo B.json với ExpRatio GYM_* -> TARGET;
//       (2) fromjson cả A và B -> 2 bản rebuild CHỈ dùng làm bản đồ định vị;
//       (3) diff 2 bản rebuild -> offset các float thay đổi; (4) kiểm byte gốc tại offset == byte
//       rebuild-A (đúng giá trị cũ) rồi ghi giá trị mới vào BẢN GỐC; lệch là dừng, không ghi.
//
// Dùng (3 pha, gọi từ shell):
//   node surgical_expratio.js makeB  A.json B.json [target=1]
//   node surgical_expratio.js patch  orig.uexp rebuildA.uexp rebuildB.uexp out.uexp [expectedCount]
//   node surgical_expratio.js verify A.json patched.json           (so từng dòng: chỉ ExpRatio GYM_* đổi)
// ============================================================================
const fs = require('fs');
const [cmd, ...a] = process.argv.slice(2);

if (cmd === 'makeB') {
    // 17/09: thêm --map=cũ:mới,... để đặt NHIỀU mức khác nhau (mỗi bậc boss tháp một số), thay vì
    // ép tất cả về một giá trị. So khớp theo 4 chữ số thập phân cho khỏi lệch float. Giá trị GYM_*
    // không có trong map thì GIỮ NGUYÊN và báo ra, không đoán.
    const mapArg = a.find(x => String(x).startsWith('--map='));
    const MAP = mapArg ? Object.fromEntries(mapArg.slice(6).split(',').map(p => {
        const [o, v] = p.split(':'); return [Number(o).toFixed(4), Number(v)];
    })) : null;
    const [inF, outF, tgt] = a.filter(x => !String(x).startsWith('--'));
    const target = Number(tgt ?? 1);
    const j = JSON.parse(fs.readFileSync(inF, 'utf8'));
    let n = 0; const rows = j.Exports[0].Table.Data;
    const chuaKhop = new Set();
    for (const r of rows) {
        if (!/^GYM_/i.test(r.Name)) continue;
        const p = (r.Value || []).find(x => x.Name === 'ExpRatio');
        if (!p || !/FloatPropertyData/.test(String(p.$type))) continue;
        let moi = target;
        if (MAP) {
            const k = Number(p.Value).toFixed(4);
            if (!(k in MAP)) { chuaKhop.add(k); continue; }
            moi = MAP[k];
        }
        if (Number(p.Value) !== moi) { console.log('  ', r.Name, p.Value, '->', moi); p.Value = moi; n++; }
    }
    if (chuaKhop.size) console.log('   ⚠️ GYM_* có giá trị KHÔNG nằm trong --map (giữ nguyên):', [...chuaKhop].join(', '));
    fs.writeFileSync(outF, JSON.stringify(j, null, 2));
    console.log('makeB: đổi', n, 'dòng GYM_* ExpRatio' + (MAP ? ' theo --map' : ' -> ' + target), '| ghi', outF);
    process.exit(0);
}

if (cmd === 'patch') {
    const [origF, raF, rbF, outF, expected] = a;
    const orig = fs.readFileSync(origF), ra = fs.readFileSync(raF), rb = fs.readFileSync(rbF);
    if (ra.length !== rb.length) { console.error('rebuild A/B lệch kích thước', ra.length, rb.length); process.exit(2); }
    if (orig.length !== ra.length) { console.error('GỐC lệch kích thước với rebuild:', orig.length, ra.length, '- không vá được kiểu này'); process.exit(2); }
    // Gom theo CỤM byte liên tiếp khác nhau (property trong .uexp KHÔNG canh 4 byte - gom theo
    // mốc 4 sẽ đếm 1 float thành 2). Mỗi cụm = 1 float; tìm điểm đầu float trong [s-3, s] sao cho
    // giá trị mới đọc ra đúng target (mặc định 1) và giá trị cũ là số hữu hạn.
    // SURG_TARGETS = danh sách giá trị MỚI hợp lệ (phẩy). Dùng khi --map đặt nhiều mức khác nhau.
    // Vẫn nhận SURG_TARGET (một giá trị) như cũ.
    const targets = String(process.env.SURG_TARGETS ?? process.env.SURG_TARGET ?? '1').split(',').map(Number);
    const laTarget = (v) => targets.some(t => Math.abs(v - t) < 1e-9);
    const offs = [];
    for (let i = 0; i < ra.length;) {
        if (ra[i] === rb[i]) { i++; continue; }
        let j = i; while (j < ra.length && ra[j] !== rb[j]) j++;
        let st = -1;
        for (let c = i - 3; c <= i; c++) { if (c < 0 || c + 4 > ra.length) continue; if (laTarget(rb.readFloatLE(c)) && Number.isFinite(ra.readFloatLE(c))) { st = c; break; } }
        if (st < 0) { console.error('cụm khác @' + i + ' len ' + (j - i) + ' không giải mã được thành float -> một trong [' + targets.join(',') + '] - dừng, không ghi'); process.exit(6); }
        offs.push(st); i = j;
    }
    console.log('patch: số float khác biệt =', offs.length, expected ? '(kỳ vọng ' + expected + ')' : '');
    if (expected && offs.length !== Number(expected)) { console.error('SỐ KHÁC BIỆT KHÔNG KHỚP - dừng, không ghi'); process.exit(3); }
    const out = Buffer.from(orig);
    for (const o of offs) {
        const oldA = ra.readFloatLE(o), newB = rb.readFloatLE(o), cur = orig.readFloatLE(o);
        if (orig.compare(ra, o, o + 4, o, o + 4) !== 0) { console.error('byte GỐC tại', o, 'không bằng rebuild-A (gốc=' + cur + ', A=' + oldA + ') - dừng, không ghi'); process.exit(4); }
        rb.copy(out, o, o, o + 4);
        console.log('   @' + o, oldA, '->', newB);
    }
    fs.writeFileSync(outF, out);
    console.log('đã ghi', outF, '(' + offs.length + ' float)');
    process.exit(0);
}

if (cmd === 'verify') {
    const [aF, pF] = a;
    const A = JSON.parse(fs.readFileSync(aF, 'utf8')).Exports[0].Table.Data, P = JSON.parse(fs.readFileSync(pF, 'utf8')).Exports[0].Table.Data;
    if (A.length !== P.length) { console.error('số dòng lệch', A.length, P.length); process.exit(2); }
    let expDiff = 0, other = 0;
    for (let i = 0; i < A.length; i++) {
        const ra = A[i], rp = P[i];
        if (ra.Name !== rp.Name) { other++; console.log('  TÊN DÒNG lệch', ra.Name, rp.Name); continue; }
        const va = ra.Value || [], vp = rp.Value || [];
        for (let k = 0; k < Math.max(va.length, vp.length); k++) {
            const sa = JSON.stringify(va[k]), sp = JSON.stringify(vp[k]);
            if (sa === sp) continue;
            if (/^GYM_/i.test(ra.Name) && va[k] && va[k].Name === 'ExpRatio' && vp[k] && vp[k].Name === 'ExpRatio') { expDiff++; continue; }
            other++; console.log('  KHÁC LẠ', ra.Name, va[k] && va[k].Name, '->', sa && sa.slice(0, 80), '|', sp && sp.slice(0, 80));
        }
    }
    console.log('verify: ExpRatio GYM đổi =', expDiff, '| khác biệt LẠ =', other, other ? '!! KHÔNG ĐẠT' : '✓ ĐẠT');
    process.exit(other ? 5 : 0);
}
console.log('Dùng: makeB | patch | verify (xem đầu file)'); process.exit(1);
