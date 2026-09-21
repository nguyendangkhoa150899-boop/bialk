# 🎲 TaiXiu — lõi tiền bàn Sic Bo 52 cửa

Thư mục này **chỉ chứa luật tiền**. Không web, không DB, không Discord. Bàn chơi nằm ở
`../BotDoMin/webplay.js`, admin ở `../BotDoMin/panel.js`, vòng ván ở `../BotDoMin/index.js`.

Sai một con số ở đây là sai **tiền thật** của người chơi, nên mọi thay đổi phải chạy lại
bộ kiểm trước khi đẩy.

## Ván 3 mốc

```
30s ĐẶT CƯỢC  →  4s HIỆN HỆ SỐ NHÂN  →  20s NẶN CHÉN
                 (khoá sổ, cấm đặt)      (4 giây cuối bàn tự mở kết quả)
```

Admin chỉnh cả 3 mốc ở panel SUPER, tab Big Small. **Số lưu trong database thắng số mặc
định trong code** — sửa hằng số mà `_txTime` đã có sẵn thì không ăn thua gì.

## Cân bằng bằng HỆ SỐ NHÂN, không phải bằng bảng trả

Bảng trả gốc lấy từ sòng thật nên cố tình thấp (nhà cái ăn 10–42% tuỳ cửa). Thứ kéo ngược
về mức chơi được là hệ số nhân: mỗi ván máy bốc ngẫu nhiên vài ô sáng đèn, ô sáng ăn theo
hệ số đó **THAY** tỉ lệ gốc (không cộng thêm).

```
RTP = p·(g+1) + p·q·(E_m − g)
  p   xác suất cửa trúng — đếm thật trên 216 kết quả, không ước lượng
  g   tỉ lệ trả gốc
  E_m tỉ lệ trung bình khi được nhân
  q   xác suất ô sáng đèn  ← MÁY TỰ GIẢI, đừng gõ tay
```

Đổi `RTP_MUC_TIEU` hoặc đổi thang nhân thì `q` tự tính lại cho cả 48 cửa. Cửa nào RTP gốc
đã đạt mục tiêu (Tài/Xỉu/Chẵn/Lẻ, 97,2%) thì **không nhân**. Đo bằng 3 triệu ván: đặt đều
mọi cửa thì nhà cái ăn ~4,9%.

⚠️ Tỉ lệ in trên ô là **tỉ lệ GỐC**. Đừng in dải "gốc–nhân" (ví dụ `50-499:1`) vì mức cao
nhất chỉ xảy ra khi ô đó được bốc trúng — in ra là hứa mức nhà cái không trả.

## Trần cược

Trần tỉ lệ **nghịch** với tỉ lệ trả, giống sòng thật: trần ≈ 5 triệu ÷ tỉ lệ trả cao nhất.
Các cửa trùng mức gom thành 5 nhóm trong `NHOM_TRAN` để admin sửa 1 ô là cả nhóm nhảy theo.

## Ai trúng thì ai quyết

`cuaThang(xx)` trả về danh sách id ô trúng. Máy chủ gửi kèm danh sách này xuống trang để
tô ô trúng sáng / ô trượt xám. **Phía người chơi không được tự đoán luật thắng** — chép
luật sang đó là có ngày bàn tô một đằng, ví trả một nẻo. `cua-test.js` đối chiếu `cuaThang`
với `tinhTra` trên toàn bộ 11.232 trường hợp (216 kết quả × 52 cửa).

## Chống soi bài

`/api/state` **chỉ gửi 3 viên xúc xắc khi `phase === 'nan'`**. Ở pha hiện hệ số nhân, máy
chủ còn chưa quay xúc xắc, nên mở F12 xoá cái chén cũng không moi ra được gì. `web-test.js`
đo thật điều này chứ không đọc code suông.

## 3 nút thao tác nhanh

`🔁 Đặt lại` · `✖️2` · `🗑️ Xoá cược` (route `/api/tx/datlai` · `/api/tx/x2` · `/api/tx/xoacuoc`).
Đặt lại và ✖️2 **gọi lại `txDatLo`** chứ không tự trừ tiền, nên luật tiền (ví, sàn cược,
trần từng cửa, trần tổng, tất-cả-hoặc-không) chỉ nằm một chỗ. Xoá cược chỉ gỡ phiếu của
đúng người đó rồi hoàn đúng số đã trừ.

Giỏ ván trước để trong RAM (`txVanTruoc`), chụp lúc chốt ván, chỉ giữ một ván. Đã đặt rồi
mà bấm Đặt lại thì **chặn** — cộng dồn là tiêu oan tiền người chơi.

## Bộ kiểm

Chạy được ngay, không cần bot:

```
node TaiXiu/kiemtra/cua-test.js       # lõi tiền: RTP, xác suất, trần, ô trúng
node TaiXiu/kiemtra/trang-test.js     # giao diện bàn, hình học xúc xắc, kiểu ô trúng/trượt
node TaiXiu/kiemtra/pham-vi-test.js   # biến xuyên file (webplay/panel gọi hằng của index)
```

Cần bot test đang chạy (`node Desktop/bialk-test.js 4`):

```
node TaiXiu/kiemtra/web-test.js       # 3 mốc giờ, giấu hệ số nhân, trần cửa, chống soi bài
node TaiXiu/kiemtra/tratien-test.js   # ép xúc xắc rồi tính tay xem trả đúng từng đồng
```

## Cạm bẫy đã dính, đừng dính lại

- **Hằng số của `index.js` gọi thẳng trong `webplay.js`** — hai module khác nhau, `/api/state`
  văng lỗi, bàn trắng trơn mà `node --check` vẫn báo sạch. Mọi thứ phải đi qua `ctx`.
  `pham-vi-test.js` sinh ra từ lỗi này.
- **`.sbO.sbKhoa{opacity:.5}`** làm mờ cả ô trúng nên tô sáng bằng thừa. Kiểu ô trúng/trượt
  phải khai **sau** `.sbNhan` và đủ lớp để thắng `.sbKhoa`.
- Mảng `PAGE` trong `webplay.js`: **mỗi phần tử là một chuỗi hoàn chỉnh**, xuống dòng giữa
  chuỗi là lỗi cú pháp.
- Trang tự làm mới thì **cấm gán thẳng `innerHTML`** cho vùng đang có hiệu ứng/ô nhập.
