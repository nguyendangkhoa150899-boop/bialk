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

## 4. Trần cược

Trần tỉ lệ **nghịch** với tỉ lệ trả, giống sòng thật: trần ≈ 5 triệu ÷ tỉ lệ trả cao nhất.
Các cửa trùng mức gom thành 5 nhóm trong `NHOM_TRAN` để admin sửa 1 ô là cả nhóm nhảy theo.
Chặn 2 tầng trong `txCapCheck`: trần từng cửa, rồi trần tổng cả ván (`_txMaxBet`).

## 5. Ai trúng thì ai quyết

`cuaThang(xx)` trả về danh sách id ô trúng. Máy chủ gửi kèm (`nan.thang`) xuống trang để tô
ô trúng sáng / ô trượt xám. **Phía người chơi không được tự đoán luật thắng** — chép luật
sang đó là có ngày bàn tô một đằng, ví trả một nẻo. `cua-test.js` đối chiếu `cuaThang` với
`tinhTra` trên toàn bộ 11.232 trường hợp (216 kết quả × 52 cửa).

## 6. Chống soi bài

`/api/state` **chỉ gửi 3 viên xúc xắc khi `phase === 'nan'`**. Ở pha hiện hệ số nhân, máy
chủ còn chưa quay xúc xắc, nên mở F12 xoá cái chén cũng không moi ra được gì. `web-test.js`
**đo thật** điều này chứ không đọc code suông.

## 7. Giao diện bàn

- **Bấm ô là đặt luôn**, không có giỏ cược.
- Tiền đã đặt hiện bằng **đồng Dogcoin** đè giữa ô, số tiền là chú thích nhỏ dưới đồng xu.
  Rút gọn `1K / 50K / 2.5TR` và **làm tròn XUỐNG** để không bao giờ ghi hơn tiền thật.
  Từ **50.000** trở lên đồng xu đổi viền đen.
- Lúc ra kết quả: ô trúng **nền trắng** viền vàng nhấp nháy, ô trượt **nền xám** nhưng xúc
  xắc trong ô **vẫn đỏ** (theo đúng ảnh sòng thật chủ server gửi).
- Huy hiệu `x…` gắn ngay trên ô được bốc. **Không** có thanh liệt kê phía trên bàn nữa.
- Máy chủ **gộp `myBets` theo cửa** trước khi gửi, kẻo bấm 20 phát vào một ô là 20 dòng.
- **Ra kết quả thì đồng Dogcoin chỉ nằm ở ô TRẢ THƯỞNG**, ô trượt ẩn chip + nhãn tiền bàn.
  Rải 47 ô mà giữ hết chip thì 47 đồng xu che kín bàn, không thấy ô nào đang ăn.

## 8. 3 nút thao tác nhanh

`🔁 Đặt lại` · `✖️2` · `🗑️ Xoá cược` → `/api/tx/datlai` · `/api/tx/x2` · `/api/tx/xoacuoc`.

- Đặt lại và ✖️2 **gọi lại `txDatLo`** chứ không tự trừ tiền, nên luật tiền (ví, sàn cược,
  trần từng cửa, trần tổng, tất-cả-hoặc-không) chỉ nằm một chỗ.
- Xoá cược chỉ gỡ phiếu của **đúng người đó** rồi hoàn đúng số đã trừ.
- Giỏ ván trước để trong RAM (`txVanTruoc`), chụp lúc chốt ván, chỉ giữ một ván. Đã đặt rồi
  mà bấm Đặt lại thì **chặn** — cộng dồn là tiêu oan tiền người chơi.
- Cả 3 **câm ngoài pha đặt cược**.
- Báo lỗi bằng **dòng chữ đứng yên** dưới nút, **không dùng toast** (chủ server chốt: phải
  đọc kịp câu "không đủ Dogcoin", đừng loé rồi tắt).

---

## 9. Bộ kiểm

Chạy được ngay, **không cần bot**:

```
node TaiXiu/kiemtra/cua-test.js       # lõi tiền: RTP, xác suất, trần, danh sách ô trúng
node TaiXiu/kiemtra/trang-test.js     # giao diện: hình học xúc xắc, kiểu ô trúng/trượt, 3 nút
node TaiXiu/kiemtra/pham-vi-test.js   # biến xuyên file (webplay/panel gọi hằng của index)
node TaiXiu/kiemtra/tienkhongmat-test.js  # mọi chỗ xoá cược phải trả tiền trước
node TaiXiu/kiemtra/restart-test.js   # bật lại bot giữa ván: không hoàn kép, không mất
```

**Cần bot test đang chạy** (`node Desktop/bialk-test.js 4`):

```
node TaiXiu/kiemtra/web-test.js       # 3 mốc giờ, giấu hệ số nhân, trần cửa, chống soi bài, 3 nút
node TaiXiu/kiemtra/chotvan-test.js   # đặt ô bàn mới rồi BỎ ĐI: ván vẫn phải chốt + trả thưởng
node TaiXiu/kiemtra/tratien-test.js   # ép xúc xắc rồi tính tay xem trả đúng từng đồng
```

Nhịp bot test: bật bằng `node Desktop/bialk-test.js` các bước `5` (tắt) → `3` (đồng bộ) →
`4` (bật). Web chơi `127.0.0.1:4002`, panel SUPER `4508`, panel thường `4234`.
Đăng nhập test: ID `111111111111111111`, PIN `123456`.

⚠️ Mấy bộ kiểm cần bot đều **đổi nhịp ván** để chạy nhanh rồi trả về `30/4/20` ở cuối.
Đứt giữa chừng thì nhịp còn nguyên mức ngắn — set lại ở panel.

⚠️ **Đừng gài lại lỗi cũ để thử bộ kiểm trong lúc chủ server đang chơi trên bot test** —
đã lỡ một lần, người chơi dính đúng mấy ván hỏng đó.

---

## 10. Luật TIỀN KHÔNG ĐƯỢC MẤT

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

Bộ kiểm khoá lại: `tienkhongmat-test.js` và `restart-test.js` (đều không cần bot).

## 11. Cạm bẫy đã dính, đừng dính lại

**① Tên cửa tra bằng bảng 5 cửa cũ → VỠ KHÂU CHỐT VÁN, MẤT TIỀN NGƯỜI CHƠI.**
`TX_CHOICES` chỉ còn 5 cửa cũ. Ai đặt ô mới như `tong9` mà đi tra `TX_CHOICES[id].name` là
ra `undefined` → `TypeError` → `settleTXPayout` vỡ giữa chừng: lịch sử không ghi (không soi
được cầu), vòng ván chết (**bàn kẹt luôn ở một số ván**), nhánh phục hồi xoá sạch cược.
→ **Luôn dùng `txTenCua(id)`.** `node --check` KHÔNG bắt được lỗi này.

**② Đừng để lỗi hiển thị có quyền đụng tới tiền.**
`settleTXPayout` giờ **trả tiền trước** và bọc riêng từng người; phần ghi sổ tách ra
`ketSoTXPayout()` bọc `try/catch`. Nhánh phục hồi của vòng ván **trả nốt tiền rồi mới**
reset `txState.bets`. Giữ nguyên thứ tự này.

**③ Hằng số của `index.js` gọi thẳng trong `webplay.js`.**
Hai module khác nhau → `/api/state` văng lỗi → bàn trắng trơn, mà `node --check` vẫn báo
sạch. Mọi thứ phải đi qua `ctx`. `pham-vi-test.js` sinh ra từ lỗi này.

**④ `.sbO.sbKhoa{opacity:.5}` làm mờ cả ô trúng** nên tô sáng bằng thừa. Kiểu ô trúng/trượt
phải khai **sau** `.sbNhan` và đủ lớp để thắng `.sbKhoa`.

**⑤ Mảng `PAGE` trong `webplay.js`: mỗi phần tử là một chuỗi hoàn chỉnh.** Xuống dòng giữa
chuỗi là lỗi cú pháp.

**⑥ Trang tự làm mới thì cấm gán thẳng `innerHTML`** cho vùng đang có hiệu ứng / ô nhập.

**⑦ Viết script vá bằng Write/Edit, đừng nhét qua Bash.** Bash nuốt `\`, backtick và `${}` —
đã làm hỏng `index.js` một lần.
