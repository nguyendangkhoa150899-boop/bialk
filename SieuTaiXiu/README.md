# ⚡ SieuTaiXiu — bàn Sic Bo "SIÊU", có phí 20%

Bàn thứ hai, nằm cạnh Tài Xỉu thường trên web. Cùng luật chơi, cùng nhịp 3 mốc, nhưng
**khác hai chỗ quyết định** và có giao diện tông đen riêng.

- `cua.js` — lõi tiền (52 cửa, bảng trả, phí, giải RTP). Thuần logic.
- `ban.js` — máy bàn: vòng ván, đặt cược, trả tiền, lịch sử. Không đụng Discord.
- `kiemtra/` — bộ kiểm, **chạy được mà không cần bot**.

BotDoMin chỉ nối vào, không phình: `index.js` dựng bàn bằng `taoBan(ctx)` rồi
`setInterval(nhip, 1000)`, giống hệt cách Tiến Lên được nối.

---

## 1. Khác bàn thường ở hai chỗ

**① Tài/Xỉu/Chẵn/Lẻ CŨNG ĐƯỢC NHÂN, tới 14:1.**
Bàn thường bốn cửa này không bao giờ nhân vì tỉ lệ gốc đã trả 97,2%. Đây chính là chữ
"siêu". Bốn cửa vẫn **thua sạch khi ra bão**, đúng dòng "* Thua bất kỳ Bộ Ba nào".

**② Phí 20% trên tiền cược.** Đặt 1.000 thì trừ ví 1.200, thắng thì ăn trên 1.000.
Phí là **nguồn thu duy nhất** của nhà cái.

## 2. Bài toán RTP lật ngược

Vì có phí, bảng trả **cố tình vượt 100%**: nhà cái lỗ trên bàn rồi lấy lại bằng phí,
đúng kiểu thu hoa hồng bên Baccarat.

```
người chơi thực nhận = RTP_BÀN / (1 + PHÍ)
nhà cái ăn           = 1 − RTP_BÀN / (1 + PHÍ)
```

Chủ server chốt nhà cái ăn **8%** để mở màn (sau nâng) → `RTP_BÀN = 0,92 × 1,20 = 1,104`.
Đo thật 200.000 ván ở mức 10%: nhà cái ăn **9,96%** — máy giải đúng.

Admin nhập thẳng **"nhà cái ăn bao nhiêu %"** (2–30) chứ không nhập RTP — đó mới là con
số admin nghĩ trong đầu. Máy tự suy ra `RTP_BÀN` rồi giải lại `q` cho cả 52 cửa.

⚠️ `q` (tần suất ô sáng đèn) **máy tự giải**, đừng bao giờ gõ tay.

## 3. Bảng trả (khớp ảnh "Trả thưởng & Hạn mức")

| Cửa | Gốc | Nhân tối đa | Trần cược |
|---|---|---|---|
| Tài/Xỉu · Chẵn/Lẻ | 1:1 | **14:1** | 50.000 |
| Gấp đôi | 8:1 | 149:1 | 5.000 |
| Gấp ba | 150:1 | **1.999:1** | 1.000 |
| Bộ ba bất kỳ | 30:1 | 499:1 | 5.000 |
| Tổng 4 / 17 | 50:1 | 999:1 | 1.000 |
| Tổng 5 / 16 | 20:1 | 499:1 | 2.000 |
| Tổng 6 / 15 | 15:1 | 249:1 | 5.000 |
| Tổng 7 / 14 | 12:1 | 149:1 | 10.000 |
| Tổng 8-13 · 9-12 · 10-11 | 8/6/6:1 | 87:1 | 10.000 |
| Kết hợp 2 viên | 5:1 | 99:1 | 10.000 |
| Đơn (1 / 2 / 3 mặt) | 1/2/3:1 | 9 / 19 / **87**:1 | 5.000 |

⚠️ **Trần lấy đúng cột "Giới hạn đặt cược" trong ảnh.** Đừng bê trần của bàn thường
sang: bàn này trả cao gấp mấy lần nên cùng trần là phơi nhiễm gấp mấy lần. Ô nặng nhất
là Bộ ba bất kỳ (5.000 × 499 = 2,5 triệu).

## 4. Luật TIỀN KHÔNG ĐƯỢC MẤT

Chép đúng bài học đau của bàn thường. Cược là tiền **đã trừ khỏi ví**, nên:

- Mọi chỗ xoá `S.bets` đều qua **`donSoCuoc()`**: ván đã quay thì trả nốt theo bảng,
  ván chưa quay thì **hoàn nguyên cược KÈM PHÍ**.
- **Không bao giờ** dựng lại bảng trả tiền khi không thấy bảng cũ (cờ `paid` rỗng = trả
  hai lần cho cả bàn).
- Cờ `paid` ghi xuống đĩa **ngay**, không để trong RAM.
- Bot bật lại giữa ván: hoàn theo `_stxBets` **nhưng bỏ qua ai đã có phần trong
  `_stxPlan`** — không vừa hoàn vừa trả.
- Admin tắt bàn / lỡ mốc chốt / lỗi vòng ván: đều hoàn cược đủ cả phí.

**Phí có hoàn không?** Xoá cược hoặc bàn bị tắt thì **hoàn đủ cả phí**, vì ván chưa diễn
ra. Chỉ khi ván đã quay thì phí mới coi như đã thu.

## 5. Giao diện

- Tông **ĐEN** hẳn để nhìn phát biết mình đang ở bàn nào (bàn thường đỏ/kem).
- **Phí 20% hiện ở 3 chỗ**: dải đỏ gọn "💸 PHÍ 20%" trên bàn (chủ server bỏ dòng dài), dòng ngay
  dưới hàng mệnh giá (ghi luôn số tiền thật sẽ bị trừ), và trong lời báo sau khi đặt.
- Ô được bốc hệ số nhân thì **giật như có sét** (`@keyframes stSet`), không chỉ nhấp nháy.
- Còn lại y bàn thường: bấm ô là đặt, đồng Dogcoin trên ô, nút MAX CƯỢC, 3 nút thao tác
  nhanh, nặn chén, 4 giây cuối tự mở, ô trúng sáng / ô trượt chìm.
- **Kéo thả chip** dùng chung bộ `keo*` của bàn thường (xem `TaiXiu/README.md` §10b):
  `doiCua(user, ten, tu, den)` dời **cả tiền lẫn phần phí đã thu** sang ô mới, không đụng ví,
  chỉ kiểm trần ô đích; `xoaCua(user, cua)` huỷ đúng một ô, **hoàn cả phí** (ván chưa quay).
  Route `/api/stx/doicua` · `/api/stx/xoacua`. Cả hai ghi `_stxBets` ngay.

- **Lịch sử ván** y bàn thường: dòng phụ "🎯 bạn ăn" (ô + tiền lời, tối đa 3) **luôn hiện**;
  phần ⚡ hệ số nhân **chỉ khi bật công tắc** — công tắc riêng `stHNhanOn` nhưng **dùng chung
  `HNHAN`/`localStorage tx_hnhan`** với bàn thường (bật một nơi là bật cả hai). Dòng nhắc dưới
  hàng mệnh giá đổi theo pha; có nhắc "Giới hạn cược X/người/ván" khi admin đặt trần.

Mọi id trên trang bắt đầu bằng `st` để không đụng bàn thường (`sb`).

### ⚠️ Hai cạm bẫy CSS đã dính ngay ngày đầu (22/09)

**① Sân khấu không có CSS.** Rule sân khấu của bàn thường khoá theo ID (`#stage`,
`#diceRow`, `#paper`, `#sumBadge`, `#stageCap`) mà bàn Siêu dùng id khác → xúc xắc xếp
dọc, chén to đùng. Sửa: **mỗi rule sân khấu liệt kê cả id bàn Siêu** (`#stage,#stStage{`).
Thêm phần tử sân khấu mới là phải thêm vào cả hai.

**② Ô không ăn phụ kiện.** Chip Dogcoin, nhãn tiền bàn, chữ, co chữ điện thoại… đều khoá
theo lớp `.sbO`; ô bàn Siêu lúc đầu chỉ có `.stO` → chip không được định vị, kéo ô dài.
Sửa tận gốc: **ô bàn Siêu mang cả hai lớp `sbO stO`** — `.sbO` để ăn mọi phụ kiện dùng
chung, còn tông đen viết bằng `.sbO.stO…` (đặc hiệu cao hơn một bậc nên thắng màu bàn
thường dù khai trước). Một hệ, không phải hai bản chép song song. Bàn Siêu KHÔNG được có
rule `.stO` trần — `trang-test` soi.

## 6. Admin

Panel SUPER, tab **⚡ Siêu Tài Xỉu**: bật/tắt bàn · 3 mốc giờ · trần từng nhóm · trần
mỗi người mỗi ván · **nhà cái ăn %** · thang hệ số nhân · ép kết quả.
Mọi route `/api/stx/*` nằm trong `VIEWONLY_PATHS` (cổng thường không chỉnh được).

Khối **ép kết quả** làm y bàn thường (rà 22/09, trước đó chỉ có 3 ô số + nút Ép):
- gõ 3 viên là **xem trước** tổng / Tài-Xỉu / Chẵn-Lẻ, 3 viên giống nhau báo **BÃO**;
- 4 nút nhanh (Tài+Chẵn 16 …);
- **🎯 Chọn xúc xắc cho nhà cái ĂN NHIỀU NHẤT**: lấy thẳng `epGoiY` máy bàn gửi —
  `timEpReNhat()` duyệt đủ 216 kết cục bằng lõi tiền với sổ cược hiện tại (đã khoá sổ thì
  tính theo bảng nhân của ván). Panel **không tự đoán**;
- **↩️ Huỷ ép** (`/api/stx/epclear` → `huyEp()`), `daHuy` cho biết có ép nào bị xoá không.

Khung "ai đang đặt" liệt kê **từng người** (mới nhất lên đầu) + số lượt, không chỉ tổng theo cửa.

**🔔 Báo cược về Discord** dùng **chung cấu hình `_txNoti`** (ID, công tắc, mức tối thiểu) với
bàn thường — chủ server bật một chỗ là nhận cả hai bàn. Máy bàn gọi `ctx.baoCuoc(user, tên,
cửa, tiền)` sau mỗi ô đặt (x2 / Đặt lại đi qua `dat()` nên cũng báo); bọc try/catch — Discord
chết không được làm hỏng ván. Dòng chữ ghi rõ ⚡ SIÊU và số phí.

Nhãn "ô sáng/ván" là **TRUNG BÌNH** (tổng `q` của 52 cửa): mỗi ô bốc độc lập nên từng ván lệch
quanh số đó — mức 8% đo 200.000 ván: thường gặp 7–11 ô, hiếm <4 hay >15.

Khối **trần cược** vẽ y bàn thường: nhãn tiếng Việt lấy từ `tenNhom` máy bàn gửi (panel
KHÔNG tự bịa tên), đổ sẵn giá trị đang chạy, và dòng "Thắng tối đa mỗi cửa theo trần
đang đặt" tính từ `thangToiDa`. Bản đầu để lộ tên khoá thô `deu/vua/cao` — chủ server
kêu ngay là không thao tác được.

Tab trên web chỉ hiện khi admin **bật bàn**.

## 7. Bộ kiểm

```
node SieuTaiXiu/kiemtra/cua-test.js   # lõi tiền: bảng trả, phí, RTP, trần (34 phép)
node SieuTaiXiu/kiemtra/ban-test.js   # máy bàn: đặt/xoá/3 nút/kéo thả/ép/báo cược/trọn ván/cứu tiền (74 phép)
```

Cả hai **không cần bot**. `ban-test` ép mốc giờ nên chạy trọn một ván trong tích tắc.

⚠️ Vòng ván xét **chốt trước, quay sau**. Muốn ép tới mốc quay thì `targetTime` phải còn
ở phía trước ít nhất 1 giây — đặt bằng `now` là rơi thẳng vào nhánh chốt, ván chưa kịp
quay. Bộ kiểm từng dính đúng bẫy này.
