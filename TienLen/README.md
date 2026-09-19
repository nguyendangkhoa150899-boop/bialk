# Tiến Lên Miền Nam — bàn 2–4 người ăn Dogcoin thật, nhúng trong web BotDoMin

> **Viết cho người/AI tiếp nhận.** Đây là **trạng thái hiện tại**, không phải nhật ký. Lịch sử: `git log -- TienLen/`.
> Chủ server: **Khoa** — không rành code. Trả lời tiếng Việt, chỉ rõ file và dòng.

Bàn **2–4 người**, mỗi người **13 lá**, **chạy liên tục** (xong ván chia tiếp). Khác Poker ở chỗ
quan trọng nhất: **bàn này ăn Dogcoin THẬT**, không phải chip ảo. Nhà cái thu **10% tiền thắng**
mỗi ván (phế) — đây là chỗ duy nhất nhà cái có thu, còn lại là người chơi ăn nhau.

Chạy **NHÚNG trong web BotDoMin**: tab tầng-1 thứ 4 **🀄 TIẾN LÊN**, cùng cổng, cùng phiên đăng
nhập, toàn màn hình. Trang là `trang.html` phục vụ tại `/tienlen/`, API ở `/api/tienlen/*`.
**Ảnh lá bài dùng CHUNG với Poker** (`../Poker/bai/*.webp`) — đừng nhân đôi thư mục ảnh.

---

## 0. Luật làm việc (giống BotDoMin, thêm 3 điều riêng)

| Luật | Vì sao |
|---|---|
| **`van.js` KHÔNG được đụng ví.** Nó chỉ *tính ra* ai ăn thua bao nhiêu. Mọi phép cộng/trừ Dogcoin nằm gọn trong `traTien()` của `web.js`, gọi qua `deps.congVi`. | Nhờ vậy bộ kiểm chạy được toàn bộ luật tiền mà không cần database, và chỉ có **một chỗ** để soi khi nghi sai tiền. |
| **Client không bao giờ tự quyết lộ bài.** Máy chủ chỉ gửi `soLa` của người khác; bài riêng chỉ có trong `xem(id)` của chính người đó. | `web-test` soi **từng lá** trong JSON trả về cho từng người. |
| **Mọi chỗ vẽ lại trang phải qua `datHTML()`.** | Trang hỏi máy chủ mỗi giây; gán thẳng `innerHTML` là cuốn mất lá đang chọn. `trang-test` dò chỗ vi phạm. |
| Chỉ commit / push khi chủ server nói. Sửa xong chạy đủ **5 bộ kiểm** (mục 6). | Bàn ăn tiền thật. |

---

## 1. Bản đồ file

| File | Việc | Kiểm bằng |
|---|---|---|
| `bai.js` | Bộ 52 lá, xáo (`crypto`), **luật bộ bài TLMN**: nhận dạng rác/đôi/ba/tứ quý/sảnh/đôi thông, so bộ, **chặt**, tới trắng, đếm heo, xếp bài | `kiemtra/bai-test.js` (89) |
| `van.js` | **Máy bàn + máy ván + TIỀN**: chia bài, lượt, bỏ lượt, hết vòng, thứ hạng, 2 chế độ tính tiền, chặt heo, thối 2, tới trắng, phế 10%. Thuần logic | `kiemtra/van-test.js` (83) |
| `web.js` | **Mô-đun gắn vào BotDoMin**: phòng chờ 4 ghế, cổng vào, nút sẵn sàng, `xuLy()`, `nhip()`, `quanLy.*` cho panel, và **`traTien()` — cửa duy nhất đụng ví** | `kiemtra/web-test.js` (50) |
| `trang.html` | Trang người chơi — file HTML thật. Có **bản sao rút gọn của `bai.js`** (`cNhanDang`/`cDanhDuoc`/`cMoiNuoc`) để gợi ý + tô mờ; máy chủ vẫn quyết định cuối cùng | `kiemtra/trang-test.js` (48) |
| `index.js` | **CHỈ DEV**: vỏ chạy thử tại máy, ví giả trong RAM, có máy đánh cùng. Prod KHÔNG chạy file này | (dùng tay) |
| — | Phần nối vào BotDoMin (trang, ảnh, route, cổng liên kết) | `kiemtra/noi-test.js` (17) |

**Mã lá = tên file ảnh**: `3s` `10h` `Qd` `2h`. Chất `s`♠ `c`♣ `d`♦ `h`♥.

⚠️ **Hai chỗ KHÁC POKER, đừng chép nhầm sang:**
1. **Thứ tự số**: `3 < 4 < … < 10 < J < Q < K < A < 2`. Con **2 (heo) lớn nhất**.
2. **Chất có thứ bậc**: `♠ < ♣ < ♦ < ♥`. Hai lá cùng số vẫn phân được lớn nhỏ → **không bao giờ hoà**.

---

## 2. Chạy

**Prod (VPS):** không có gì riêng — chạy **trong** `pm2 BotDoMin`:
```bash
cd /root/tts-bot && git pull && pm2 restart BotDoMin
```
Thư mục `TienLen/` phải nằm **cạnh** `BotDoMin/` (tìm qua `TIENLEN_DIR`, mặc định `../TienLen`).
Sau khi lên: panel SUPER → tab **🀄 Tiến Lên** → chỉnh mức cược/chế độ → tick **Hiện tab**.

| Biến | Mặc định | Ghi chú |
|---|---|---|
| `TIENLEN_DIR` | `../TienLen` | `index.js` và `webplay.js` dùng để tìm `web.js`, `trang.html` |

`trang.html` đọc từ đĩa **mỗi lần gửi** → sửa là ăn ngay. Sửa `web.js`/`van.js` phải restart bot.

---

## 2b. Chạy thử tại máy (không cần bot, không cần Discord)

```bash
node TienLen/index.js --bot 1        # 1 máy đánh cùng -> chơi 1 mình vẫn thử được
node TienLen/index.js                # 4 người thật, mở 4 cửa sổ
node TienLen/index.js --bot 2 --cuoc 500 --chedo anhet
```
Rồi mở **http://127.0.0.1:4100/?u=A** (và `?u=B`, `?u=C`, `?u=D` ở **cửa sổ ẩn danh riêng** — cùng
cửa sổ thì chung `localStorage`, hai người sẽ đá nhau). Ví là **ví giả 1.000.000 trong RAM**, tắt là mất.
Máy đánh giùm ngồi sẵn các ghế cuối và đã bấm sẵn sàng.

⚠️ Bản dev để `laAdmin: () => true` và **token chính là id người chơi** — tiện lúc thử, nhưng đừng
bao giờ bê kiểu xác thực đó lên prod.

---

## 3. Luồng chơi

1. Web cược → tab **🀄 TIẾN LÊN** (admin bật ở panel) → bàn oval 4 ghế.
2. **Cổng vào:** phải **đã liên kết** tên nhân vật **và** ví ≥ **30× mức cược** (xem mục 5).
3. Bấm ghế trống để ngồi → nút **✅ SẴN SÀNG** ở giữa bàn. **≥2 người ngồi và ai cũng sẵn sàng →
   máy chủ tự chia bài**, không cần admin bấm gì.
4. Trong ván: ghế xoay để **mình luôn ở đáy**. Bài mình nằm ngửa ở dưới, **bấm lá để chọn**
   (lá chọn nhô lên), rồi **▶️ ĐÁNH** hoặc **⏭️ BỎ LƯỢT**. Nút **🔀 XẾP BÀI** đổi giữa
   *theo số* (3→2) và *gom bộ* (tứ quý/ba/đôi đứng trước) — chỉ đổi cách hiển thị, client tự lo.
4b. **Giao diện cho người chơi** — chủ server chốt 19/09, mẫu lấy từ game **Ba Bích**:

| Thứ | Chi tiết |
|---|---|
| **Cỡ bài** | **Cố định gấp đôi** bản đầu (`--co: 2` trong CSS). Nút 🔍 đã bỏ 19/09 — chủ server: *"dư nhiều nút quá"*. Đổi cỡ thì sửa đúng biến đó. |
| **Tay bài** | **Xoè chồng** như cầm bài thật; `canhTay()` đo bề ngang thật rồi tự tăng độ chồng để **13 lá luôn vừa một hàng** (chặn ở 72%, chồng hơn là mất góc số). |
| **Chọn lá** | Lá **chỉ NHÔ LÊN, không phóng to**, **viền vàng + quầng sáng**, **dấu ✓ góc TRÁI**. Lá chọn nổi lên trên lá kế nên `canhTay()` **chừa khoảng trống ngay sau nó** — đúng chỗ lá đã chọn đứng cạnh lá chưa chọn (chủ server: *"chọn con 8 bị che con 9"*). Khoảng trống được tính vào phép chia nên chọn bao nhiêu lá hàng bài cũng không tràn. |
| **Hàng nút to** | ⏱ **đồng hồ tròn vàng** (≤5 giây đỏ nhấp nháy) · **Bỏ lượt** (đỏ) · **Đánh** (xanh). Hiện suốt lượt mình; nút Đánh **chỉ sáng khi mớ lá hợp lệ**. Nằm **trên** tay bài cho dễ với. |
| **Dòng dưới** | "3 đôi thông · 💥 CHẶT được!" / "· Không lớn hơn đôi K" / "· chưa tới lượt bạn". |
| **Giữa bàn** | Giữ **CẢ DIỄN BIẾN vòng đang đánh**: mọi nước xếp **đè lên nhau** (chỉ hở mép trái = chỗ in số), **nước cũ mờ, nước mới sáng**, hết vòng mới dọn (`van.chongBai` bên máy chủ, `chongLen()` bên web). **CHỈ bài đặc biệt** mới bắn tên to giữa bàn: **đôi heo · ba heo · 3–4 đôi thông · tứ quý · sảnh từ 5 lá** (`dangKhoe()`); hàng chặt đổi **màu cam**. |
| **Ghế người khác** | Xấp lưng bài + **badge ĐỎ đếm lá** (≤2 lá thì **badge vàng nhấp nháy** = sắp về nhất) · **PASS** trắng to khi bỏ lượt · nhãn **vừa đánh bộ gì** (💥 khi chặt, 🤖 khi máy đánh giùm). |
| **Trợ giúp** | Lá **không nằm trong nước đánh nào thì mờ đi** · **💡 GỢI Ý** tự chọn nước rẻ nhất, bấm tiếp xoay hết các cách · **✖️ BỎ CHỌN** · **⇄** nút tròn đổi kiểu xếp (theo số / gom bộ). |
| **Tới lượt bạn** | Sáng viền cả bàn + kêu **một tiếng** (không kêu lặp mỗi giây). |

5. Hết giờ suy nghĩ (**25 giây**) hoặc rớt mạng: máy đánh giùm — đang theo thì **bỏ lượt**,
   đang mở lượt thì **đánh lá nhỏ nhất**.
6. Hết ván → bảng hạng + tiền từng người (tách rõ cược / đếm lá / thối 2 / chặt / phế),
   đếm ngược **7 giây** rồi chia ván mới. Ai tụt dưới vốn tối thiểu bị **mời khỏi bàn** trước ván kế.

---

## 4. Luật bài (chủ server chốt 19/09)

**Bộ hợp lệ:** 1 lá · đôi · ba · tứ quý · **sảnh** ≥3 lá liên tiếp · **đôi thông** ≥3 đôi liên tiếp.
Sảnh và đôi thông **không được chứa heo (2)**.

**Đè bài:** cùng kiểu + cùng số lá + lá cao hơn. Khác kiểu thì chỉ ăn được bằng **CHẶT**:

| Hàng chặt | Chặt được |
|---|---|
| **3 đôi thông** | 1 heo lẻ · 3 đôi thông nhỏ hơn |
| **Tứ quý** | 1 heo lẻ · đôi heo · 3 đôi thông · tứ quý nhỏ hơn |
| **4 đôi thông** | 1 heo lẻ · đôi heo · ba heo · 3 đôi thông · **tứ quý (kể cả tứ quý heo)** · 4 đôi thông nhỏ hơn |

Bài thường (không heo) **không bị chặt** — tứ quý không ăn được đôi K.

**4 luật nâng cao (bật/tắt từng cái ở panel, mặc định BẬT hết):**

| Luật | Nội dung |
|---|---|
| **3♠ đi đầu** | Ván **đầu tiên của bàn**: ai cầm 3♠ đi trước và **bắt buộc đánh bộ có 3♠**. Ván sau: người về nhất ván trước đi đầu, đánh gì cũng được. |
| **Tới trắng** | Chia xong có bài đẹp là **thắng ngay**, không ai đánh lá nào. Mỗi người thua trả số phần cược dưới đây. |
| **Chặt heo có thưởng** | Chặt trúng heo → người bị chặt **trả ngay** cho người chặt: heo đen (♠♣) **1 phần cược**, heo đỏ (♦♥) **2 phần**. Chặt tứ quý/đôi thông (không heo) thì **không thưởng**. |
| **Thối 2** | Hết ván còn heo trên tay → phạt đúng mức trên, trả cho người về nhất. |

**Bảng tới trắng** (thưởng = số phần cược mỗi người thua phải trả), xét từ mạnh xuống:

| Bài | Thưởng |
|---|---|
| Đồng chất (13 lá cùng chất) | 12 phần |
| Sảnh rồng (đủ 12 hạng 3→A) | 10 phần |
| Tứ quý heo | 8 phần |
| 5 đôi thông | 6 phần |
| 6 đôi bất kỳ | 4 phần |

⚠️ Xét theo **thứ tự trên**: 6 đôi **liên tiếp** sẽ tính là *5 đôi thông* (mạnh hơn), không phải *6 đôi*.

---

## 5. Tiền (đọc kỹ — chỗ này ăn Dogcoin thật)

**Hai chế độ** (admin chọn ở panel), ví dụ 4 người cược 1.000:

| Chế độ | Cách trả |
|---|---|
| **`hang` Nhất nhì ba tư** | Nhất ăn của tư, nhì ăn của ba → nhất +1.000, nhì +1.000, ba −1.000, tư −1.000. **3 người**: nhất ăn của ba, nhì hoà. **2 người**: nhất ăn của nhì. Ván chạy tới khi **chỉ còn 1 người cầm bài**. |
| **`anhet` Nhất ăn hết + đếm lá** | Có người về nhất là **DỪNG NGAY**. Nhất ăn cược của tất cả, **cộng** mỗi lá còn trên tay người thua × **đơn giá lá** (admin đặt, mặc định = mức cược). Ví dụ còn 4 lá = −1.000 cược −4.000 lá. |

Cộng thêm (nếu bật): **chặt heo** trả ngay trong ván · **thối 2** trả cho người nhất · **tới trắng** thay
toàn bộ luật thường.

**Phế 10%:** ai ăn **ròng dương** thì nhà cái cắt 10% phần ăn đó (người thua **không** bị cắt).
Đây là chỗ duy nhất bàn không tổng-bằng-0. `ketQua.pheTong` đúng bằng phần hụt của cả bàn —
`van-test` canh đẳng thức này ở **mọi** ván mô phỏng.

**Ba chốt an toàn về ví** (`web.js`):
1. **Vốn tối thiểu 30× mức cược** mới được ngồi, kiểm **lại trước mỗi ván**. Thua nặng nhất một ván
   (cược + 13 lá + thối 2 + bị chặt) vẫn dưới 30 phần → không ai âm ví.
2. `traTien()` chạy **đúng một lần** mỗi ván (khoá bằng `daTraVan = số ván`) — gọi từ cả `nhip()`
   lẫn ngay sau nước đánh, gọi thừa bao nhiêu lần cũng vô hại.
3. **Lưới an toàn**: nếu ví ai đó vẫn không đủ trả (đáng lẽ không xảy ra), kẹp lại đúng số họ có,
   cắt phần ăn của người thắng theo tỉ lệ, và **ghi log ⚠️** để chủ server biết mà xem lại vốn tối thiểu.

Mỗi lần cộng/trừ đều vào **sổ Dogcoin** (`logDog` loại `tienlen`) để đối chiếu khi có tranh cãi.

---

## 6. Kiểm thử — chạy đích danh, không wildcard

```bash
node TienLen/kiemtra/bai-test.js     # luật bộ bài: nhận dạng, so, chặt, tới trắng   (89)
node TienLen/kiemtra/van-test.js     # máy ván + TIỀN cả 2 chế độ, chạy 3 lần        (83)
node TienLen/kiemtra/web-test.js     # ghế, sẵn sàng, VÍ, chống lộ bài, lưới an toàn (50)
node TienLen/kiemtra/trang-test.js   # client: cú pháp, id/onclick, vẽ, ĐỐI CHIẾU luật  (48)
node TienLen/kiemtra/noi-test.js     # nối vào BotDoMin: trang, ảnh, route, cổng LK  (17)
```
`van-test` và `web-test` có ngẫu nhiên (chia bài) → **chạy 3 lần** để dò chập chờn.

`trang-test` có mục **⚖️ đối chiếu**: chạy máy luật bản client trong `vm` rồi so với `bai.js` trên
**1.500 ca ngẫu nhiên + 14 ca dựng tay**, và kiểm **mọi nước 💡 gợi ý đều được server chấp nhận**
(200 tay ngẫu nhiên). Sửa `bai.js` mà quên sửa bản client là mục này đỏ ngay.

---

## 7. Cạm bẫy đã dính (đừng dính lại)

- **`deps.giayXemKet || MẶC_ĐỊNH` nuốt số 0.** Cấu hình "chia ván kế ngay" (0 giây) bị `||` biến
  thành mặc định 7 giây, làm 6 bài kiểm hỏng mà nhìn như lỗi logic. Dùng `!= null`.
- **Khối route admin phải đứng TRƯỚC chốt "chưa có bàn".** Để sau thì đổi cấu hình lúc bàn chưa mở
  lại báo *"Chưa có bàn nào đang chạy"* — mà đó chính là lúc cần đổi nhất.
- **Trả tiền chỉ trong `nhip()` là trễ một giây.** Người chơi thấy bảng kết quả mà ví chưa nhảy.
  Phải gọi `thanhToanNeuXong()` ngay sau nước đánh, sau bỏ lượt, và sau `vanMoi` (tới trắng chốt
  ván ngay lúc chia bài).
- **Chế độ `hang` KHÔNG cho người bét đánh lá cuối** — ván dừng khi chỉ còn 1 người cầm bài. Viết
  bài kiểm mà cho cả 4 người đánh hết là tự làm hỏng test.
- **Script vá chạy lại lần hai là chèn trùng.** Anchor `setInterval(... pokerMod.nhip ...)` vẫn khớp
  sau lần vá đầu → khối Tiến Lên bị chèn 2 lần vào `index.js`. Lỡ tay thì `git checkout -- <file>`
  rồi vá lại **một lượt**, đừng vá chồng.
- **Anchor phải DUY NHẤT.** `poker:"poker"};'` có ở cả `PAGE_GRP` lẫn `GRP_LAST`; dòng trong `tab()`
  đã sẵn `'poker'`. Luôn `grep -c` trước khi tin.
- **Bash nuốt backtick / `${}`** khi viết script vá → viết bằng Write tool (bài học chung của repo).
- **Bộ kiểm CHẬP CHỜN vì tới trắng.** Chia bài ngẫu nhiên nên ~1/15 lần có người tới trắng ngay lúc
  chia → ván **chốt luôn** trong `moBan()`, mọi bài kiểm giả định "ván đang đánh" đỏ oan (từng làm bài
  **chống lộ bài** đỏ vì `ketQua.lat` lật bài cả bàn — đó là showdown, đúng thiết kế). `web-test` nay
  **tắt tới trắng trong `dung()`**; bài nào cần soi mặc định thì gọi `dung({ toiTrangOn: true })`.
  Luật tới trắng có bộ kiểm riêng ở `van-test`. Đã hammer 20 lần liên tiếp: 0 hỏng.
- **Máy chủ quên gửi một trường là VỠ TRANG.** Bộ trên bàn từng gửi thiếu `cao` (lá lớn nhất);
  máy luật bản client gọi `cTri(b.cao)` → `undefined.slice()` → ném lỗi. Bộ kiểm cũ không bắt được vì
  ca "bàn đang đánh" lúc đó **bàn còn trống**. Đã thêm ca **có bộ trên bàn + tới lượt mình + đang chọn lá**.
- **Đừng gộp lỗi MẠNG với lỗi VẼ TRANG.** `dongBo()` bản đầu để `ve()` bên trong `.then`, nên `ve()` ném lỗi
  là rơi vào `.catch` → `S=null` → trang báo **"Bạn chưa đăng nhập"**, giấu mất lỗi thật. Giờ tách hẳn:
  lỗi mạng mới cho `S=null`, lỗi vẽ thì hiện "⚠️ Lỗi vẽ trang: ...".
- **Máy đánh giùm ở bản dev đi THẲNG vào `van.js`, không qua `xuLy()`** → không kích `thanhToanNeuXong()`,
  ví không nhảy cho tới nhịp sau. Đã gọi `tienlen.nhip()' ngay sau nước của máy. Prod không có máy
  đánh nên không dính, nhưng ai thêm đường đánh mới phải nhớ luật này.

---

## 8. Việc mở

- **Không lưu trạng thái bàn** — `pm2 restart` giữa ván là mất ván đó (tiền ván dở **không** bị trừ
  vì chỉ trả lúc chốt ván, nhưng người chơi mất thế bài). Đừng deploy lúc có bàn đang đánh.
- **Chưa ai bấm thử bằng tay trên trình duyệt** — toàn bộ 268 bài kiểm là máy chạy.
- Chưa có **báo Discord** khi ai thắng đậm.
- Chưa có **lịch sử ván** trên web người chơi (`van.js` có `nhatKy`, panel đã hiện, web thì chưa).
- Chưa có **trần thắng/ván** — bàn 4 người chế độ đếm lá có thể ra ván ±50.000 với cược 1.000.
- **Thông đồng** giữa 2 người quen cùng bàn — chưa có hướng xử lý (giống Poker).
- Điện thoại **cầm dọc bị che** (bắt xoay ngang); 4 ghế trên màn ~380px vẫn chật.
