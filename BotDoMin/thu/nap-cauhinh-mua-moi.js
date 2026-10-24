// 24/10: MUA MOI (xoa trang) - giu CAU HINH web, bo du lieu nguoi choi.
// cauhinh-mua-moi.json = cac khoa cau hinh lay tu database.json prod 24/10/2026 13:31 (truoc khi dong server mua 1):
//   shop item + nhom + han muc, shop qua, Pet Boss, diem danh / Nghien, tat-bat tinh nang, Thuong Pho, Ghep Ngoc, vong quay,
//   tui boss (16 hoat dong), Do Min / Taxi / Vay, ban Ruong Ich Ky, cuoc toi da, kenh Discord.
// KHONG co: vi KNB, Family, Ruong Ich Ky, Thuong Pho, nhat ky, giftcode (giftcode + du lieu cu nam trong ban sao luu day du, khong len git).
//
//   node thu/nap-cauhinh-mua-moi.js xuat <database.json>          lay lai cauhinh-mua-moi.json tu 1 database.json
//   node thu/nap-cauhinh-mua-moi.js nap  <database.json> [--ghi]  dat cac khoa cau hinh vao database.json (khong --ghi = chi xem)
// Nap: TAT bot truoc (systemctl stop minigame) - bot dang chay se ghi de database.json tu bo nho.
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'cauhinh-mua-moi.json');
const KHOA = [
    '_itemShop', '_itemCats', '_itemShopGroupQuota', '_itemShopDayMode', '_giftShop', '_petBoss',
    '_dailyCfg', '_featOff', '_tpCfg', '_gnCfg', '_vqCfg', '_tuiBossCfg', '_ichKyBan',
    '_minesCfg', '_taxiCfg', '_loanCfg', '_txMaxBet', '_stxMaxBet', '_rlMaxBet', '_minBet',
    '_stxOn', '_rlOn', '_pokerOn', '_txSimple', '_dogBridgeDayMax', '_dogVangDayMax',
    '_txChannelId', '_giveawayChannelId', '_vayChannelId', '_statsChannelId', '_minesChannelId', '_giveawayRoleId',
];

const [lenh, db, co] = process.argv.slice(2);
if (!['xuat', 'nap'].includes(lenh) || !db) {
    console.log('Dung: node thu/nap-cauhinh-mua-moi.js xuat|nap <database.json> [--ghi]');
    process.exit(1);
}

if (lenh === 'xuat') {
    const d = JSON.parse(fs.readFileSync(db, 'utf8'));
    const ra = {};
    for (const k of KHOA) if (d[k] !== undefined) ra[k] = d[k];
    fs.writeFileSync(FILE, JSON.stringify(ra, null, 1) + '\n');
    console.log('Da xuat ' + Object.keys(ra).length + ' khoa -> ' + FILE);
    process.exit(0);
}

// nap
const cfg = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const d = fs.existsSync(db) ? JSON.parse(fs.readFileSync(db, 'utf8')) : {};
for (const k of Object.keys(cfg)) console.log((d[k] === undefined ? '  them ' : '  thay ') + k);
if (co !== '--ghi') {
    console.log('(chay thu - them --ghi de luu; nho tat bot truoc)');
    process.exit(0);
}
if (fs.existsSync(db)) fs.copyFileSync(db, db + '.truoc-nap-' + Date.now());
Object.assign(d, cfg);
fs.writeFileSync(db + '.tmp', JSON.stringify(d));
fs.renameSync(db + '.tmp', db);
console.log('Da nap ' + Object.keys(cfg).length + ' khoa vao ' + db);
