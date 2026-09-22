# 🎲 TaiXiu — bàn Sic Bo 52 cửa

Thư mục này chứa **lõi tiền** (`cua.js`) và **bộ kiểm** (`kiemtra/`). Không web, không DB,
không Discord. Bàn chơi nằm ở `../BotDoMin/webplay.js`, admin ở `../BotDoMin/panel.js`,
vòng ván + tiền nong ở `../BotDoMin/index.js`.

Sai một con số ở đây là sai **tiền thật** của người chơi. Đã mất tiền người chơi một lần
(xem mục *Cạm bẫy* cuối trang) nên **chạy đủ bộ kiểm trước khi đẩy**, không có ngoại lệ.

---

## 1. Ván 3 mốc

```
30s ĐẶT CƯỢC  →  4s HIỆN HỆ SỐ NHÂN  →  20s NẶN CHÉN
                 (khoá sổ, cấm đặt)      (4 giây cuối bàn tự mở kết quả)
```

- Admin chỉnh cả 3 mốc ở **panel SUPER, tab Big Small**. Phạm vi `5–600 / 0–60 / 6–300`.
- Giây nặn tối thiểu **6** vì phải chừa `TX_KQ_S = 4` giây cuối cho bàn tự mở kết quả.
- ⚠️ **Số lưu trong `database.json` (`_txTime`) THẮNG số mặc định trong code.** Sửa hằng số
  mà `_txTime` đã có sẵn thì không ăn thua gì — phải set ở panel.
- Ván đang chạy giữ mốc cũ. Mọi chỗ tính giờ gọi `txRoundS()` / `txLockS()` / `txNhanS()`,
  **đừng dùng lại hằng `TX_ROUND_S`** (đã bỏ).

## 2. Cân bằng bằng HỆ SỐ NHÂN, không phải bằng bảng trả

Bảng trả gốc lấy từ sòng thật nên cố tình thấp (nhà cái ăn 10–42% tuỳ cửa). Thứ kéo ngược
về mức chơi được là hệ số nhân: mỗi ván máy bốc ngẫu nhiên vài ô sáng đèn, ô sáng ăn theo
hệ số đó **THAY** tỉ lệ gốc — **không cộng thêm**.

> Ví dụ: ô Bão 3 gốc `150:1`. Ván nào ô đó sáng `x500` thì đặt 1.000 ăn về 501.000
> (vốn 1.000 + lãi 500.000), **không phải** 150+500=650.

```
RTP = p·(g+1) + p·q·(E_m − g)
  p   xác suất cửa trúng — đếm thật trên 216 kết quả, không ước lượng
  g   tỉ lệ trả gốc
  E_m tỉ lệ trung bình khi được nhân
  q   xác suất ô sáng đèn  ← MÁY TỰ GIẢI, đừng gõ tay
```

Đổi `RTP_MUC_TIEU` hoặc đổi thang nhân thì `q` tự tính lại cho cả 48 cửa được nhân. Cửa nào
RTP gốc đã đạt mục tiêu (Tài/Xỉu/Chẵn/Lẻ, 97,2%) thì **không nhân**. Đo bằng 3 triệu ván:
đặt đều mọi cửa thì nhà cái ăn ~4,9%.

⚠️ Tỉ lệ in trên ô là **tỉ lệ GỐC**. Đừng in dải "gốc–nhân" (ví dụ `50-499:1`) vì mức cao
nhất chỉ xảy ra khi ô đó được bốc trúng — in ra là hứa mức nhà cái không trả.

Bảng nhân sinh ra **ngay lúc khoá sổ, TRƯỚC khi quay xúc xắc**, cả bàn thấy giống nhau.

## 3. RTP — ADMIN CHỈNH ĐƯỢC

Panel SUPER, tab Big Small, ô **🎯 RTP (80 - 99)**. Lưu ở `_txRTP`, nạp lúc bot khởi động.
Đổi RTP là `datRTP()` **tính lại q cho cả 48 cửa ngay lập tức** — vẫn tuyệt đối không gõ tay q.

| RTP | Nhà cái ăn | Ô sáng hệ số nhân / ván | Số cửa có cơ hội được nhân |
|---|---|---|---|
| 99% | 1,1% | 9,2 | 48 |
| 95% (mặc định) | 4,8% | 7,2 | 48 |
| 92% | 7,6% | 5,7 | 42 |
| 90% | 9,2% | 4,8 | 40 |
| 85% | 12,8% | 2,9 | 35 |
| 80% | 15,2% | 1,8 | 18 |

Hạ RTP **không** đụng vào bảng trả gốc in trên bàn — nó chỉ làm **ít ô được bốc hệ số nhân
hơn**. Ván đang chạy đã bốc bảng nhân từ lúc khoá sổ nên không đổi giữa chừng.

## 4. Thang hệ số nhân — ADMIN CHỈNH ĐƯỢC

Panel SUPER, tab Big Small, ô **🎰 Thang hệ số nhân**. Lưu ở `_txThang`, mỗi dòng một nhóm:

```
bao: 200×45, 250×33, 300×25, 400×18, 500×12, 600×7, 700×4, 888×2, 999×1
```

**Độ hiếm** là trọng số, không phải phần trăm: `200×45` và `999×1` nghĩa là x200 ra nhiều
gấp 45 lần x999. Luật: hệ số **tăng dần**, mỗi nhóm 2–12 bậc, hệ số 1–9999, độ hiếm 1–1000.
Sửa xong `datThang()` **tính lại q theo RTP đang đặt** nên nhà cái không lệch đồng nào.

12 nhóm: `tong4 tong5 tong6 tong7 tong8 tong9 tong10 doi bao baoAny cap don`
(tổng điểm đối xứng dùng chung: 4 với 17, 5 với 16, …).

⚠️ **Nâng hệ số CAO NHẤT của nhóm nào thì phải hạ trần cược nhóm đó**, vì thắng tối đa
một ô = trần × hệ số cao nhất. Thêm bậc ở giữa thì thoải mái.

## 5. Trần cược

Trần tỉ lệ **nghịch** với tỉ lệ trả, giống sòng thật: trần ≈ 5 triệu ÷ tỉ lệ trả cao nhất.
Các cửa trùng mức gom thành 5 nhóm trong `NHOM_TRAN` để admin sửa 1 ô là cả nhóm nhảy theo.
Chặn 2 tầng trong `txCapCheck`: trần từng cửa, rồi trần tổng cả ván (`_txMaxBet`).

## 6. Ai trúng thì ai quyết

`cuaThang(xx)` trả về danh sách id ô trúng. Máy chủ gửi kèm (`nan.thang`) xuống trang để tô
ô trúng sáng / ô trượt xám. **Phía người chơi không được tự đoán luật thắng** — chép luật
sang đó là có ngày bàn tô một đằng, ví trả một nẻo. `cua-test.js` đối chiếu `cuaThang` với
`tinhTra` trên toàn bộ 11.232 trường hợp (216 kết quả × 52 cửa).

## 7. Chống soi bài

`/api/state` **chỉ gửi 3 viên xúc xắc khi `phase === 'nan'`**. Ở pha hiện hệ số nhân, máy
chủ còn chưa quay xúc xắc, nên mở F12 xoá cái chén cũng không moi ra được gì. `web-test.js`
**đo thật** điều này chứ không đọc code suông.

## 8. Giao diện bàn

- **Bấm ô là đặt luôn**, không có giỏ cược.
- Tiền đã đặt hiện bằng **đồng Dogcoin** đè giữa ô, số tiền là chú thích nhỏ dưới đồng xu.
  Rút gọn `1K / 50K / 2.5TR` và **làm tròn XUỐNG** để không bao giờ ghi hơn tiền thật.
  Từ **50.000** trở lên đồng xu đổi viền đen.
- Lúc ra kết quả: ô trúng **nền trắng** viền vàng nhấp nháy, ô trượt **nền xám** nhưng xúc
  xắc trong ô **vẫn đỏ** (theo đúng ảnh sòng thật chủ server gửi).
- Huy hiệu `x…` gắn ngay trên ô được bốc. **Không** có thanh liệt kê phía trên bàn nữa.
- Máy chủ **gộp `myBets` theo cửa** trước khi gửi, kẻo bấm 20 phát vào một ô là 20 dòng.
- Hàng mệnh giá: `1.000 / 10.000 / 20.000 / 50.000 / 100.000` + nút **MAX CƯỢC** màu đỏ ở cuối.
  MAX đổ nhiều nhất có thể vào ĐÚNG ô vừa bấm, bị chặn bởi **3 thứ cùng lúc**: ví còn bao nhiêu,
  trần riêng của ô, trần tổng cả ván của một người. Trần ô 200.000 mà ví 400.000 thì chỉ 200.000
  vào. Nhờ MAX mà người có **dưới 1.000** vẫn đặt được (mệnh giá nhỏ nhất là 1.000 nên họ từng kẹt).
- Bấm ô thì có **đồng xu bay** từ hàng mệnh giá vào ô, tự dọn sau 0,5 giây. Thuần trang trí,
  không chắn chuột, không đụng DOM của bàn (chip thật do `sbVeGio` vẽ ở nhịp làm mới sau).
- **Ra kết quả thì đồng Dogcoin chỉ nằm ở ô TRẢ THƯỞNG**, ô trượt ẩn chip + nhãn tiền bàn.
  Rải 47 ô mà giữ hết chip thì 47 đồng xu che kín bàn, không thấy ô nào đang ăn.

## 9. Lịch sử ván — kể được ô nào nhân, ai ăn gì

Dòng lịch sử trên **bảng Discord** từng liệt kê MỌI ô người chơi đặt, một người rải 24 ô
là dòng dài không đọc nổi, mà lại **không hề kể ô nào được nhân**. Nay:

```
🔺 🎲🎲🎲 · Tổng 13 · TÀI · LẺ · ⚡ x300 Bão 3 · x33 Đôi 5 · x24 Cặp 3-6 +1 ô
   💰 Anh Vinh Q +440k (4 ô, trúng 3: Cặp 3-6 +300k · Cặp 4-6 +100k · TÀI +60k) | 💥 BiaLK −50k (4 ô, thua hết)
```

- Mỗi người **chỉ kể ô ĂN ĐƯỢC** (tối đa 3), ô thua gói thành "N ô, thua hết".
- Tiền rút gọn `k / tr` cho vừa giới hạn 4000 ký tự của Discord.
- Bảng **20 ván trên web**: bảng này để **soi cầu** nên dãy kết quả phải liếc là thấy.
  Vì vậy dòng ⚡ **MẶC ĐỊNH TẮT**, có công tắc `⚡ Hiện hệ số nhân từng ván` (nhớ trong máy
  người chơi qua `localStorage tx_hnhan`). Phần `🎯` kể ô MÌNH ăn thì **luôn hiện** vì đó
  mới là thứ người chơi cần. Huy hiệu ⚡ cố tình nhỏ và xỉn, chỉ kể 3 ô to nhất — bản đầu
  để 5 huy hiệu vàng chóe ở mọi ván, chủ server kêu ngay là vướng mắt.
- ⚡ **CHỈ kể ô nhân ĐÃ RA TRÚNG.** Mỗi ván có ~7 ô được bốc nhân nhưng đa số không ra;
  kể hết là rác, đọc không nổi. `histEntry.nhan` **lọc sẵn lúc chốt ván** (giao với
  `cuaThang(dice)`) nên mọi chỗ hiển thị đều sạch mà không phải lọc lại. Ván nào hệ số
  nhân không ăn vào đâu thì **không có dòng ⚡** luôn.
- Ô "ăn" mà lãi ÂM là tiền **hoàn 30%** lúc ra bão, dòng ghi `hoàn N` chứ không ghi `trúng N`.
- `histEntry.nhan` lưu bảng hệ số nhân của ván (chỉ vài ô nên không phình DB);
  `plan.bangNhan` giữ bản sao phòng khi `txState.nhan` đã bị dọn.
- Ván CŨ ghi trước bản vá không có 2 trường này → chỉ hiện tổng, **không bịa**.

## 9b. Dòng kết quả trên Discord (22/09) — dùng chung 2 bàn

Chủ server chốt: *"show kết quả ván đó + người chơi + thắng hoặc thua + số dogcoin là được"*.

```
🔻 Tổng 8 · XỈU · CHẴN · ⚡ x200 Tổng 8
   💰 Khoa +2,1tr · 💥 Nam −50k
```

Một hàm `dongVanDiscord(h, {tenCua, cuaThang})` lo cho **cả bàn thường lẫn bàn Siêu**;
mỗi bàn truyền bảng cửa và hàm `cuaThang` của lõi tiền mình vào.

- **Đã bỏ**: mặt xúc xắc và phần kể từng ô (`(3 ô, trúng 2: tong9 +50k · tai +20k…)`).
  Dài gấp đôi mà người đọc vẫn phải tự cộng trừ.
- **Giữ ⚡** hệ số nhân ĐÃ RA TRÚNG (tối đa 2 ô) — nó chỉ hiện khi có ô nhân thật sự ăn
  tiền, và đó là thứ đáng hóng.
- **Lãi/lỗ = nhận − cược − PHÍ.** Bàn Siêu thu 20%: bỏ phí ra ngoài là bảng khoe lãi cao
  hơn tiền thật trong ví, người chơi soi ví thấy lệch là mất tin ngay. Phí ghi theo từng
  ô trong `cuaAgg[].phi`.
- Xếp theo **biến động mạnh nhất** (cả thắng đậm lẫn thua đậm), cắt còn **6 người** +
  `… +N người` — embed Discord chỉ chứa 4096 ký tự.
- ⚠️ **TUYỆT ĐỐI KHÔNG tính lại tiền ở đây.** Số nhận về (`b.nhan`) do lõi tiền chốt sẵn
  lúc chốt ván. Bản cũ tự tính theo luật bàn 5 cửa nên bàn 52 cửa in ai cũng THUA.
- Ván CŨ (ghi trước bản vá) không có `b.nhan` → tính tổng theo `h.winners`, đừng coi 0
  là thua.

---

## 10. 3 nút thao tác nhanh

`🔁 Đặt lại` · `✖️2` · `🗑️ Xoá cược` → `/api/tx/datlai` · `/api/tx/x2` · `/api/tx/xoacuoc`.

- Đặt lại và ✖️2 **gọi lại `txDatLo`** chứ không tự trừ tiền, nên luật tiền (ví, sàn cược,
  trần từng cửa, trần tổng, tất-cả-hoặc-không) chỉ nằm một chỗ.
- Xoá cược chỉ gỡ phiếu của **đúng người đó** rồi hoàn đúng số đã trừ.
- Giỏ ván trước để trong RAM (`txVanTruoc`), chụp lúc chốt ván, chỉ giữ một ván. Đã đặt rồi
  mà bấm Đặt lại thì **chặn** — cộng dồn là tiêu oan tiền người chơi.
- Cả 3 **câm ngoài pha đặt cược**.
- Báo lỗi bằng **dòng chữ đứng yên** dưới nút, **không dùng toast** (chủ server chốt: phải
  đọc kịp câu "không đủ Dogcoin", đừng loé rồi tắt).

### Mệnh giá đang chọn (22/09)

Nút mệnh giá đang chọn mang lớp `on`: **nền vàng, chữ đậm, nhấc lên 3px, viền sáng quanh nút,
✓ xanh ở góc phải**, và **nảy một cái** (`@keyframes chipNay`) mỗi lần bấm — hàng mệnh giá vẽ
lại sau mỗi lần chọn nên hoạt ảnh tự chạy lại.

- Rule viết **liệt kê cả hai bàn** (`#sbChips .chip.on,#stChips .chip.on`). Bản đầu chỉ có
  `#sbChips` nên **bàn Siêu bấm mệnh giá xong không có dấu hiệu gì** — thêm bàn mới là phải
  thêm id vào đúng rule này, `trang-test` soi.
- ✓ ở góc là dấu hiệu **không phụ thuộc màu** (người mù màu / màn ám vàng vẫn thấy). Cần
  `.chip{position:relative}`, thiếu là ✓ bay ra góc màn hình.
- **MAX CƯỢC lúc chọn vẫn ĐỎ**: `#sbChips .chip.on` (1 id) có độ ưu tiên cao hơn
  `.chip.chipMax.on` (3 lớp) nên trước đó nút MAX được chọn hoá vàng, mất màu nhận diện của
  nút nguy hiểm. Phải có rule `#sbChips .chip.chipMax.on,#stChips .chip.chipMax.on` riêng.
- Máy bật "giảm chuyển động" thì bỏ nảy + bỏ nhấc, giữ nguyên nền vàng và ✓.

---

## 10b. Kéo thả chip (22/09) — dời ô / huỷ đúng một ô

Lỡ đặt Chẵn thì **giữ ngón/chuột ~0,28s** lên ô đó: đồng Dogcoin nhấc lên bay theo tay, ô đích
sáng viền vàng, và **vùng "🗑️ Thả vào đây để HUỶ" hiện ở giữa đáy màn**. Thả lên ô khác =
dời, thả vào vùng huỷ = huỷ đúng ô đó, thả chỗ khác = chip về chỗ cũ. Bấm nhanh vẫn là đặt.

Máy chủ: `txDoiCua(user, tu, den)` và `txXoaCua(user, cua)` → `/api/tx/doicua` · `/api/tx/xoacua`.

- **Dời không đi qua ví** (tổng cược không đổi) nên chỉ kiểm **trần riêng của ô đích**
  (`txBetCuaCua(den) + tiền ≤ tranCua(den)`). Kiểm xong mới đụng sổ — không dời nửa chừng.
- Huỷ một ô chỉ gỡ phiếu **đúng người, đúng ô**, hoàn đúng số đã trừ; ô khác còn nguyên.
- Cả hai **câm ngoài pha đặt cược** (`txDangNhanCuoc`), ô bịa / ô trống / thả lại ô cũ đều lỗi.
- Phía trang: **một bộ `keo*` dùng chung cho hai bàn**, chỉ khác tiền tố id (`sb_`/`st_`)
  và bộ biến (`keoBan(pre)`). Con ma là bản sao `.sbGio` gắn vào `body` nên phải **tự đủ
  CSS** (`.sbKeoGhost`). Chỉ ô **đang có chip của mình** mới mang `sbCoChip`
  (`touch-action:none`) — ô trống vẫn vuốt trang được. Sau khi nhả tay trình duyệt còn bắn
  `click`, `KEOCLICK` chặn nó ở `sbChon`/`stChon` kẻo thả xong lại đặt thêm một cục.
- Kết quả/lỗi báo bằng **dòng đứng yên** dưới nút (`sbBao`/`stBao`), y ba nút.

---

## 11. Bộ kiểm

Chạy được ngay, **không cần bot**:

```
node TaiXiu/kiemtra/cua-test.js       # lõi tiền: RTP, xác suất, trần, danh sách ô trúng
node TaiXiu/kiemtra/trang-test.js     # giao diện: hình học xúc xắc, kiểu ô trúng/trượt, 3 nút, kéo thả chip
node TaiXiu/kiemtra/pham-vi-test.js   # biến xuyên file (webplay/panel gọi hằng của index)
node TaiXiu/kiemtra/tienkhongmat-test.js  # mọi chỗ xoá cược phải trả tiền trước
node TaiXiu/kiemtra/restart-test.js   # bật lại bot giữa ván: không hoàn kép, không mất
```

**Cần bot test đang chạy** (`node Desktop/bialk-test.js 4`):

```
node TaiXiu/kiemtra/web-test.js       # 3 mốc giờ, giấu hệ số nhân, trần cửa, chống soi bài, 3 nút
node TaiXiu/kiemtra/chotvan-test.js   # đặt ô bàn mới rồi BỎ ĐI: ván vẫn phải chốt + trả thưởng
node TaiXiu/kiemtra/tratien-test.js   # ép xúc xắc rồi tính tay xem trả đúng từng đồng
node TaiXiu/kiemtra/nhan-2ban-test.js # 22/09 rà nhân 2 bàn: tham chiếu độc lập, 216×52×nhân, máy bàn thật 2.600 ván, Đơn 1 viên không khoe ⚡ (48 phép)
node TaiXiu/kiemtra/log-test.js       # 22/09 📜 LOG: Sổ Dogcoin chặn mini game, 1 dòng/ván ai đặt nhiêu ăn thua nhiêu, mục Siêu riêng (41 phép)
```

Nhịp bot test: bật bằng `node Desktop/bialk-test.js` các bước `5` (tắt) → `3` (đồng bộ) →
`4` (bật). Web chơi `127.0.0.1:4002`, panel SUPER `4508`, panel thường `4234`.
Đăng nhập test: ID `111111111111111111`, PIN `123456`.

⚠️ Mấy bộ kiểm cần bot đều **đổi nhịp ván** để chạy nhanh rồi trả về `30/4/20` ở cuối.
Đứt giữa chừng thì nhịp còn nguyên mức ngắn — set lại ở panel.

⚠️ **Đừng gài lại lỗi cũ để thử bộ kiểm trong lúc chủ server đang chơi trên bot test** —
đã lỡ một lần, người chơi dính đúng mấy ván hỏng đó.

---

## 12. Luật TIỀN KHÔNG ĐƯỢC MẤT

Cược là tiền **đã trừ khỏi ví**. Vì vậy:

- **Chỗ nào xoá `txState.bets` đều PHẢI gọi `txDonSoCuoc(lyDo)` trước.** Hàm đó tự quyết:
  ván đã quay thì trả nốt theo bảng trả tiền, ván chưa quay thì hoàn nguyên cược.
  Trước đây có 5 chỗ xoá thẳng (admin khởi tạo lại bàn, admin dừng bàn, watchdog kẹt,
  mất bảng Discord, nhảy cóc mốc nặn) — cả 5 đều mất trắng hoặc treo tiền người chơi.
- **Không bao giờ dựng lại bảng trả tiền khi không tìm thấy bảng cũ.** Bảng mới có cờ
  `paid` rỗng nên sẽ trả lại từ đầu cho cả bàn. Không thấy bảng = ván đã chốt rồi.
- **Cờ `paid` phải ghi xuống đĩa ngay.** Để trong RAM thì bot chết trước nhịp lưu 10 giây
  là lúc bật lại tưởng chưa ai nhận, trả thêm một lần nữa.
- **Watchdog reset thì phải tăng `gameId`.** Giữ số cũ là ván mới trùng số ván cũ, bảng
  trả tiền khớp nhầm ván.
- **Hai đường cứu tiền lúc bật lại không được giẫm chân nhau**: hoàn cược theo `_txBets`
  và trả thắng theo `_txPlan` từng cùng tồn tại ~24 giây mỗi ván, restart trúng quãng đó
  là người thắng ăn 2 lần, người thua được hoàn trắng.
- **Mọi đường đặt cược phải đi qua `txDatLo`** (web lẫn Discord). Chỉ nó kiểm đủ ví,
  sàn cược, trần từng cửa, trần tổng, và tất-cả-hoặc-không.
- **Mốc "hết giờ đặt" = hiện nhân + nặn**, không phải chỉ giây nặn. Trừ thiếu thì đồng hồ
  người chơi không về 0 và panel báo còn giờ ép trong khi sổ đã đóng.

Bộ kiểm khoá lại: `tienkhongmat-test.js`, `restart-test.js` và `nhipvan-test.js`
(đều không cần bot).

## 12b. SỐ VÁN KHÔNG ĐƯỢC THỦNG LỖ (21/09)

Chủ server: *"lâu lâu bị mất ID mất luôn kết quả ván đó làm người chơi mất dogcoin"* —
lịch sử nhảy **#52975 → #52973**, 4 ván biến mất trong 24 ván, đúng lúc khung chat báo *"Lag rồi"*.

**Gốc:** máy trạng thái 3 mốc trước đây là một chuỗi `else if` và **kiểm**
`targetTime` **trước**, nên mỗi nhịp chỉ đi được **một** mốc. Máy chủ kẹt làm nhịp trễ;
trễ đủ lâu thì lúc chạy lại `nowSec` đã vượt `targetTime` trong khi
`status` còn `'betting'` → rơi thẳng vào nhánh mở bát mà **ván chưa quay xúc
xắc** → huỷ ván, hoàn cược, `gameId++` nhưng **không ghi lịch sử**.

**Vá 1 — ba mốc phải BẮT KỊP được.** Xếp `if` **nối tiếp** theo thứ tự
**khoá sổ → quay → mở bát**. Một nhịp trễ giờ chạy đủ cả ba bước: ván vẫn quay, vẫn trả tiền,
vẫn vào lịch sử.
⚠️ **TUYỆT ĐỐI KHÔNG đổi lại thành `else if`** — đó chính là con bug. Bộ kiểm chặn.

**Vá 2 — ván huỷ vẫn phải để lại dấu.** Vẫn còn 3 đường huỷ thật (watchdog kẹt 120s, lỡ mốc
nặn vì lý do khác, lỗi giữa vòng ván). Cả ba giờ gọi `txGhiVanHuy()`, ghi một dòng
**🚫 VÁN HUỶ — đã hoàn cược** kèm lý do vào đúng sổ lịch sử mà web đọc. Hàm tự bỏ qua nếu
ván đó đã có lịch sử (ván đã quay thì settle ghi rồi). Bảng 20 ván ở web vẽ dòng này màu xám,
soi cầu Discord in `🚫 VÁN HUỶ` thay vì `undefined undefined`.

**Vì sao phải kể ra ván huỷ:** tiền *có* được hoàn, nhưng người chơi thấy số ván nhảy cóc thì
tưởng bị nuốt. Không tra được thì không tin được.

### Vá 3 — CỨU VÁN, đừng huỷ ván

Lỡ mốc nặn thì **ván có hỏng đâu**: sổ cược đã khoá, chỉ là chưa kịp quay. Bản cũ hoàn cược rồi
bỏ ván — đúng về tiền nhưng **mất kết quả và mất ID**. Giờ **quay bù ngay tại chỗ**, ra một ván
**thật**, công bằng y như quay đúng giờ (xúc xắc vẫn ngẫu nhiên, sổ cược vẫn nguyên).
Lỡ luôn mốc khoá sổ thì **sinh bù bảng hệ số nhân** — không thì `txPlanPayout` thấy
`bangNhan` rỗng và người chơi **mất phần nhân một cách lặng lẽ**.
Hoàn cược giờ chỉ còn là đường cùng, để dành cho nhánh `catch`.

### Vá 4 — MỘT CỬA DUY NHẤT được tăng số ván ⭐

Ba vá trên vẫn là **vá từng đường**: mỗi chỗ tăng `gameId` phải *tự nhớ* ghi lịch sử.
Thêm một đường mới mà quên là **lỗ thủng quay lại**. Nên gom hết về `txSangVanMoi()`:
nó **tự bảo đảm** ván sắp rời đi đã có một dòng lịch sử (chưa có thì ghi ván huỷ) rồi mới tăng số.

⚠️ **Không được viết `txState.gameId++` ở bất kỳ đâu khác.** Bộ kiểm quét cả file và
đỏ nếu thấy quá một chỗ. Đây mới là thứ làm lỗ thủng **không thể** quay lại, kể cả với đường
chưa ai nghĩ ra.

Bốn cửa hiện đi qua nó: **mở bát** (đường thường) · **watchdog kẹt 120s** · **lỗi giữa vòng ván** ·
**admin khởi tạo lại bàn**.

**Kiểm bằng hành vi, không chỉ bằng regex:** `tienkhongmat-test.js` **bóc mã thật** của
`txGhiVanHuy` + `txSangVanMoi` ra chạy trong `vm` với
`txState` giả, bắn **500 ván** rơi ngẫu nhiên vào cả 4 đường, rồi khẳng định dãy ID
**liền mạch tuyệt đối**. Cộng thêm ca gọi chồng (hai đường cùng báo huỷ một ván → chỉ một dòng,
giữ lần ghi **đầu**).

## 12c. UI TRÀN Ở HÀNG 3 VIÊN (21/09)

Chủ server: *"UI xí ngầu 3 viên bị đẩy nhau đa số UI bị tràn ra ngoài"*.

Ô (`.sbO`) co được vì có `flex:1;min-width:0`, nhưng **xúc xắc bên trong
thì không**: `width:20px` + `flex:0 0 auto`. Hàng *150:1 · MỖI BỘ BA* có
**6 ô × 3 viên**, mỗi ô cần tối thiểu

    3×20 + 6×1.5 lề + 2×2 padding + 2 viền = 75px

mà điện thoại dọc chỉ chia được **~60px/ô** → xí ngầu đẩy nhau, lòi ra ngoài. Hàng 2 viên
chỉ cần 46px nên **không** vỡ — khớp đúng ảnh.

⚠️ Đã **có sẵn** `@media (max-width:430px){.sbXx{width:16px}}` mà vẫn tràn, vì
**ghim một con số cố định là chọn đúng một cỡ máy**. Máy 390px (iPhone 12–15 thường):
ô rộng 55px, 3 viên 16px cần 58px → vẫn thiếu 3px.

**Vá:** cỡ viên nằm ở **một biến** `--xx: clamp(11px, 3.1vw, 20px)` khai trên
`.sbBoXx`; viên dùng `width:var(--xx)` + `flex:0 1 auto`;
chấm dùng `calc(var(--xx) * .16)` nên co theo. `@media` chỉ **hạ trần**
biến (`clamp(9px,3vw,16px)`), không ghim số. Chữ dài (*Bão bất kỳ*) được
`font-size:clamp()` + `text-overflow:ellipsis` làm đường lùi.

Bộ kiểm tính lại ca chật nhất **390px**: cần 45,1px / có 55px ✅.

## 12d. ĐẶT NHẦM NHÀ: khoá ctx của webplay bỏ sang panel (21/09)

Chủ server: *"nút hiện hệ số nhân từng ván nó không show nữa · số 9 x18 nhưng ở dưới ko hiện"*.

index.js gọi **hai** module với **hai** đối tượng ctx riêng — `startWebPlay({...})` (trang cược)
và `startPanel({...})` (trang quản trị). Bản vá lọc *"chỉ kể ô nhân ra trúng"* đăng ký
`txCuaThang` vào **nhầm khối panel**. webplay thấy `undefined`, mà nó viết phòng hờ:

    new Set(ctx.txCuaThang ? ctx.txCuaThang(h.dice) : [])

→ tập rỗng → **lọc sạch mọi ô của mọi ván** → dòng ⚡ trống trơn từ đó.

⚠️ **Hỏng LẶNG LẼ**: không lỗi, không log, chỉ là dữ liệu biến mất. Kiểu phòng hờ
`ctx.x ? ctx.x() : mặc-định` có mặt khắp webplay (đúng, để bản cũ không vỡ) nên nó
**không bao giờ nổ** để mà biết. Panel không dùng `txCuaThang` lần nào — nằm sai chỗ hoàn toàn.
Cùng lỗi còn dính `txKqS`, may là số dự phòng 4 trùng `TX_KQ_S` nên chưa ai thấy.

Mỉa mai: đúng dòng chú thích *"webplay.js là MODULE KHÁC — phải đưa qua ctx như thế này"*
lại đang nằm trong khối **panel**.

**Cách tìm ra:** dựng webplay thật với ctx giả rồi gọi `/api/state` → thấy máy chủ gửi
**đúng** `{tong9:18,don6:11}`; chạy `renderHist20` thật trong DOM giả → trang vẽ
**đúng**; chạy `ketSoTXPayout` thật → ghi **đúng**. Ba tầng đều đúng ⇒ lỗi ở chỗ nối.

**Chốt:** `pham-vi-test.js` giờ đối chiếu **toàn bộ** `ctx.X` mà webplay dùng với danh
sách khoá `startWebPlay` thật sự cấp, và báo riêng cái nào bị đặt nhầm sang panel.

## 12e. RÀ LẠI CẢ MẠCH VÁN (21/09)

Chủ server: *"đặt xong → khóa cược → hiển số nhân → cho người chơi nặn. **không được thiếu
cái nào**. không được ngưng / mất ván / chưa show kết quả đã qua ván khác"*.

Rà lại tìm thêm **hai lỗ**:

### ① Pha HIỆN SỐ NHÂN có thể bị tắt hẳn

`TX_NHAN_S_MIN` để **0**, chú thích ghi thẳng *"0 = tắt hẳn pha hiện nhân"*. Đặt 0 thì
`lockTime === nanTime`: khoá sổ và quay xúc xắc rơi vào **cùng một giây** — cả bàn không
bao giờ kịp nhìn bảng hệ số nhân. Đúng cái *"thiếu một mốc"*.
→ Nâng sàn lên **2 giây**. Số cũ ngoài khoảng thì `txTimeCfg()` tự lùi về mặc định 4, khỏi sửa DB.

### ② Lag làm mở bát ngay sau khi quay → không kịp thấy kết quả

`finishTXGame` ngủ tới `targetTime` rồi mới chốt. Máy chủ kẹt thì lúc chạy lại
`nowSec` đã **vượt** `targetTime` → ngủ 0 giây → quay xong **chốt luôn trong cùng nhịp**,
bảng nhảy thẳng sang ván mới, không ai thấy mặt xúc xắc.

⚠️ Đây là **tác dụng phụ của chính bản vá "bắt kịp mốc"** ở mục 12b. Bắt kịp thì đúng, nhưng
phải chừa chỗ xem kết quả.

→ Trễ mốc quay thì **dời giờ mở bát ra sau `TX_KQ_S` giây**. Ván dài thêm vài giây còn hơn
ván không có kết quả. Đường **cứu ván** (lỡ hẳn mốc nặn) cũng vậy: quay bù → dời giờ mở bát →
thoát sớm, để nhịp sau mở bát theo đường thường.

### Bộ kiểm riêng: `nhipvan-test.js`

| Canh | Nội dung |
|---|---|
| ① đủ mốc | bốn mốc đều có thời lượng thật, nặn ≥ `TX_KQ_S` + 2 |
| ② đúng thứ tự | khoá sổ → quay → mở bát, và ba bước là `if` nối tiếp |
| ③ không ngưng | mất bảng / watchdog / catch đều có lối ra, luôn nhả `isProcessing` |
| ④ không nuốt kết quả | cả hai đường trễ đều dời giờ mở bát |

Kèm **mô phỏng 3.000 ván với lag ngẫu nhiên tới 40 giây**: không ván nào thiếu mốc, không ván
nào bị nuốt kết quả, dãy số ván liền mạch.

## 12f. RÀ NHÂN 2 BÀN + Ô ĐƠN + CHIP TUỲ CHỌN + LOG (22/09)

**Rà trả thưởng × hệ số nhân** (chủ server: *"rà soát thật kỹ"*): viết lại luật từ README thành hàm
tham chiếu độc lập, so với `tinhTra` của 2 bàn qua 216 kết cục × 52 ô × 5 bảng nhân (56.160 phép/bàn),
rồi chạy `txPlanPayout`+`txPayUser` thật 2.000 ván và máy bàn Siêu thật 600 ván, cân ví từng đồng.
**Tiền đúng, 0 lệch.** Chỗ sai duy nhất là CHỮ: ô **Đơn** có nhân mà ra **1 viên** thì trả 1:1
(đúng thiết kế, `tinhTra` chỉ áp nhân vào 2–3 viên) nhưng huy hiệu vẫn "x19", lịch sử/Discord vẫn in
"⚡ x19 Đơn 3" cạnh "+1.000". Sửa: thêm `cuaAnNhan(xx, nhan)` (ô **thật sự được nhân**) vào cả 2
`cua.js`; mọi chỗ lọc ⚡ (`locNhanTrung`, `histEntry`, `dongVanDiscord`, `ghiSo`/`trangThai` Siêu) dùng
nó; huy hiệu ô Đơn ghi *"x19 · 2-3 viên"*; tiêu đề khu Đơn ghi *"1 viên 1:1 (không nhân)"*.
Bộ kiểm cố định: `nhan-2ban-test.js`.

**🪙 4 mệnh giá sửa được** (chủ server chốt lần 2: *"ô đầu thành ô Sửa và Lưu; bấm Sửa thì chọn vô
chip sẽ bắt nhập số; Lưu thì lưu được 4 ô chip kia"*): hàng chip = **[✏️ Sửa] [c1] [c2] [c3] [c4] [MAX]**,
6 ô cùng class `.chip` nên cao bằng nhau. Bấm Sửa → 4 ô viền nét đứt, bấm ô nào thì ô đó thành ô nhập
ngay tại chỗ (Enter = xong ô, Esc = huỷ ô, rời ô = xong ô); nút đầu thành **💾 Lưu**, bung dưới có
✖ Huỷ / ↩ Mặc định (position:absolute, không đẩy hàng). Lưu ghi cả 4 vào `localStorage`
(`tx_chips` / `stx_chips`) → F5 không mất; chặn trùng số; mệnh giá đang chọn mà không còn thì về ô đầu.
Kho hỏng/thiếu ô/có số bậy/bị chặn → về mặc định 10k·20k·50k·100k. Trong chế độ sửa mọi nút dùng
`onpointerdown` + `preventDefault` — bấm sang ô khác không làm ô nhập văng blur rồi mất click.
Một hàm `chipHangHTML(p, …)` vẽ chung cho 2 bàn (`p = "sb" | "st"`). Bản đầu (ô tuỳ chọn + nút Sửa
dưới ô) đã bỏ vì làm hàng chip gãy.

**📜 LOG** (chủ server: *"chỉ quan tâm ván đó người nào đặt nhiêu ăn thua nhiêu kết quả"*):
- File `log_result.txt`: **một dòng mỗi ván** `[TÀI XỈU] Ván #id: 3-4-5 (Tổng 12 | TÀI | CHẴN) · Khoa đặt 50.000 → +10.000 · …`
  (số từ kế hoạch trả tiền, không tính lại). Bỏ log từng phiếu đặt/xoá/huỷ/dời và dòng khoá sổ.
- Siêu: `ghiLog` tách loại — phiếu lẻ không ghi; `[SIÊU TX KẾT QUẢ]` → RESULT (kèm *"A đặt 10.000
  (+phí 2.000) → +8.000"*); lỗi/hoàn → SYSTEM; ép/đổi nhịp/trần/thang/bật tắt → ADMIN.
- Panel tab 📜: mục **⚡ Siêu Tài Xỉu riêng** (`stxHistory` từ `bangDiscord(30)`), dòng ván **gộp theo
  người** (đặt · +phí · nhận · lãi/lỗ, kèm từng ô) dùng chung 2 bàn.
- **💰 Sổ Dogcoin chỉ giữ chuyển / nạp / rút / admin** (+ mua pal, vay/trả nợ, hoàn rút — không phải mini
  game). `DOG_LEDGER_BO_QUA = bet · jackpot · cophieu · tienlen · sieutx` chặn ở cửa ghi **và** lọc khi
  đọc nên dòng cũ trong DB cũng biến. 3 khoản hoàn cược mini game đổi nhãn `bet` để bị chặn theo.

## 13. Cạm bẫy đã dính, đừng dính lại

**① Tên cửa tra bằng bảng 5 cửa cũ → VỠ KHÂU CHỐT VÁN, MẤT TIỀN NGƯỜI CHƠI.**
`TX_CHOICES` chỉ còn 5 cửa cũ. Ai đặt ô mới như `tong9` mà đi tra `TX_CHOICES[id].name` là
ra `undefined` → `TypeError` → `settleTXPayout` vỡ giữa chừng: lịch sử không ghi (không soi
được cầu), vòng ván chết (**bàn kẹt luôn ở một số ván**), nhánh phục hồi xoá sạch cược.
→ **Luôn dùng `txTenCua(id)`.** `node --check` KHÔNG bắt được lỗi này.

**② Đừng để lỗi hiển thị có quyền đụng tới tiền.**
`settleTXPayout` giờ **trả tiền trước** và bọc riêng từng người; phần ghi sổ tách ra
`ketSoTXPayout()` bọc `try/catch`. Nhánh phục hồi của vòng ván **trả nốt tiền rồi mới**
reset `txState.bets`. Giữ nguyên thứ tự này.

**③b Đưa qua ctx rồi nhưng ĐẶT NHẦM NHÀ.** Xem mục 12d. index.js gọi HAI module với
HAI ctx riêng (`startWebPlay` và `startPanel`). Bỏ khoá vào nhầm khối thì webplay thấy
`undefined`, mà mọi chỗ đều viết phòng hờ `ctx.x ? ctx.x() : mặc-định` nên KHÔNG BAO GIỜ NỔ —
dữ liệu chỉ lặng lẽ biến mất. `pham-vi-test.js` đối chiếu đủ hai chiều.

**③ Hằng số của `index.js` gọi thẳng trong `webplay.js`.**
Hai module khác nhau → `/api/state` văng lỗi → bàn trắng trơn, mà `node --check` vẫn báo
sạch. Mọi thứ phải đi qua `ctx`. `pham-vi-test.js` sinh ra từ lỗi này.

**④ `.sbO.sbKhoa{opacity:.5}` làm mờ cả ô trúng** nên tô sáng bằng thừa. Kiểu ô trúng/trượt
phải khai **sau** `.sbNhan` và đủ lớp để thắng `.sbKhoa`.

**⑤ Mảng `PAGE` trong `webplay.js`: mỗi phần tử là một chuỗi hoàn chỉnh.** Xuống dòng giữa
chuỗi là lỗi cú pháp.

**⑥ Trang tự làm mới thì cấm gán thẳng `innerHTML`** cho vùng đang có hiệu ứng / ô nhập.

**⑧ Máy trạng thái của ván: `if` nối tiếp, KHÔNG phải `else if`.** Xem mục 12b. Và
số ván chỉ được tăng qua `txSangVanMoi()` — viết `txState.gameId++` ở chỗ khác là mở lại
lỗ thủng, bộ kiểm quét cả file và sẽ đỏ. Chuỗi
else-if làm mỗi nhịp chỉ đi được một mốc → máy chủ lag là ván bị nhảy cóc, huỷ oan, mất ID.

**⑨ CSS: đừng ghim số cố định cho thứ nằm trong flex co giãn.** Xem mục 12c. Ghim số là
chọn đúng một cỡ máy; máy hẹp hơn vẫn tràn. Dùng biến + `clamp()`, `@media` chỉ hạ trần.

**⑩ Mỗi rule CSS trong mảng `PAGE` có thể bị cắt làm nhiều chuỗi.** Regex kiểu
`/\.sbXx\{[^']*flex/` không bao giờ khớp qua ranh giới hai phần tử — soi từng mảnh.

**⑦ Viết script vá bằng Write/Edit, đừng nhét qua Bash.** Bash nuốt `\`, backtick và `${}` —
đã làm hỏng `index.js` một lần.
