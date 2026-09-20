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
| **Client không bao giờ tự quyết lộ bài.** Bản chung (`xemChung`) **không có lá, cũng không có số lá** của ai — chỉ `conBai: true/false`. Bài riêng **và số lá** chỉ nằm trong `xem(id)` của chính người đó. | `web-test` soi **từng lá** trong JSON trả về cho từng người, và chốt JSON gửi cho A chỉ chứa đúng **một** chữ `"soLa"`. |
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

1. Web cược → tab **🀄 TIẾN LÊN** (admin bật ở panel) → **SẢNH** liệt kê các phòng đang mở.
2. **Sảnh:** bấm một phòng để ngồi, hoặc **➕ TẠO PHÒNG MỚI** rồi chọn kiểu chơi + mức cược
   trong thang có sẵn (mục 5). Mỗi lúc **chỉ ngồi một phòng** — vào phòng khác thì tự đứng dậy
   khỏi phòng cũ, trừ khi đang giữa ván (lúc đó bị chặn). Phòng người chơi tạo mà hết người thì
   tự tan; hai phòng dựng sẵn thì luôn còn để sảnh không bao giờ trắng.
3. **Cổng vào:** phải **đã liên kết** tên nhân vật **và** đủ **vốn tối thiểu** (mục 5).
   Bấm ghế trống để ngồi → nút **✅ SẴN SÀNG**. **≥2 người ngồi và ai cũng sẵn sàng →
   máy chủ tự chia bài**, không cần admin bấm gì.
3b. **🗳️ Vote đổi mức cược ngay tại bàn:** ai đang ngồi cũng đề nghị được một mức khác trong
   thang. **Quá nửa** số người ngồi đồng ý là xong — đang nghỉ giữa ván thì áp ngay, đang đánh
   thì **ván sau** mới áp. Thanh vote nói rõ **vốn tối thiểu mới** và cảnh báo ai sắp không đủ
   (đổi cược là đổi luôn vốn, không cảnh báo thì có người bị mời ra mà không hiểu vì sao).
4. Trong ván: ghế xoay để **mình luôn ở đáy**. Bài mình nằm ngửa ở dưới, **bấm lá để chọn**
   (lá chọn nhô lên), rồi **▶️ ĐÁNH** hoặc **⏭️ BỎ LƯỢT**. Nút **🔀 XẾP BÀI** đổi giữa
   *theo số* (3→2) và *gom bộ* (tứ quý/ba/đôi đứng trước) — chỉ đổi cách hiển thị, client tự lo.
4b. **Giao diện cho người chơi** — chủ server chốt 19/09, mẫu lấy từ game **Ba Bích**:

| Thứ | Chi tiết |
|---|---|
| **Cỡ bài** | **Cố định gấp đôi** bản đầu (`--co: 2` trong CSS). Nút 🔍 đã bỏ 19/09 — chủ server: *"dư nhiều nút quá"*. Đổi cỡ thì sửa đúng biến đó. |
| **Tay bài** | **Xoè chồng** như cầm bài thật; `canhTay()` đo bề ngang thật rồi tự tăng độ chồng để **13 lá luôn vừa một hàng** (chặn ở 72%, chồng hơn là mất góc số). |
| **Chọn lá** | **Kiểu Ba Bích.** Bấm lá thì lá **NHÔ LÊN TẠI CHỖ** trong hàng bài, **không phóng to** (phóng to là lấn che lá kế bên), **viền vàng + quầng sáng**, **dấu ✓ góc TRÁI**. `canhTay()` **chừa khoảng trống ngay sau lá đã chọn** — đúng chỗ lá đã chọn đứng cạnh lá chưa chọn (*"chọn con 8 bị che con 9"*); khoảng trống được tính vào phép chia nên chọn bao nhiêu lá hàng bài cũng không tràn. ⚠️ **Đã thử tách lá chọn ra một KHAY riêng (20/09) rồi BỎ** — chủ server: *"cho về lại bản chọn giống như game Ba Bích, dễ thao tác, đừng bị chồng chéo nhau quá"*. Khay chiếm nguyên một hàng, điện thoại nằm ngang là mọi thứ dồn chật, tay bài bị cắt mất đáy. **Đừng dựng lại.** |
| **Hàng nút to** | ⏱ **đồng hồ tròn vàng** (≤5 giây đỏ nhấp nháy) · **Bỏ lượt** (đỏ) · **Đánh** (xanh). Hiện suốt lượt mình; nút Đánh **chỉ sáng khi mớ lá hợp lệ**. Nằm **trên** tay bài cho dễ với. |
| **Dòng dưới** | "3 đôi thông · 💥 CHẶT được!" / "· Không lớn hơn đôi K" / "· chưa tới lượt bạn". |
| **Giữa bàn** | Giữ **CẢ DIỄN BIẾN vòng đang đánh**: các nước **đè lộn xộn** lên nhau như bài vứt trên bàn thật — **trong một nước thì xếp THẲNG HÀNG** đều nhau (lệch rất nhẹ ±0.03 lá, ±4°), **giữa các nước** mới xô lệch mạnh (±0.35 lá) và mỗi nước **nghiêng một góc riêng ±18°** (hàng bài nằm nghiêng theo đúng góc đó). Mọi số lấy từ mã lá qua `bam()` nên **ổn định** — dùng `Math.random` thì mỗi giây vẽ lại là bài nhảy loạn. Lá nằm **tuyệt đối quanh tâm bàn**, không xếp hàng lệch sang phải, **nước cũ mờ, nước mới sáng**, hết vòng mới dọn (`van.chongBai` máy chủ, `laBan()` + `chongLen()` web). Lá vừa đánh **bay từ ghế người đánh** vào giữa bàn (`GHE_VT` lưu toạ độ ghế nên `veGhe()` phải chạy TRƯỚC). **CHỈ bài đặc biệt** mới bắn tên to giữa bàn: **đôi heo · ba heo · 3–4 đôi thông · tứ quý · sảnh từ 5 lá** (`dangKhoe()`); hàng chặt đổi **màu cam**. |
| **Ghế người khác** | Chỉ một **xấp úp cố định** — 19/09 chủ server chốt **giấu số lá của nhau** (máy chủ cũng ngừng gửi). Số lá chỉ hiện ở ghế **của mình**. **PASS** trắng to khi bỏ lượt · nhãn **vừa đánh bộ gì** (💥 khi chặt, 🤖 khi máy đánh giùm). |
| **Trợ giúp** | Lá **không nằm trong nước đánh nào thì mờ đi** · **💡 GỢI Ý** tự chọn nước rẻ nhất, bấm tiếp xoay hết các cách · **✖️ BỎ CHỌN** · **⇄** nút tròn đổi kiểu xếp (theo số / gom bộ). |
| **Tới lượt bạn** | Sáng viền cả bàn + kêu **một tiếng** (không kêu lặp mỗi giây). |

5. Hết giờ suy nghĩ (**25 giây**) hoặc rớt mạng: máy đánh giùm — đang theo thì **bỏ lượt**,
   đang mở lượt thì **đánh lá nhỏ nhất**.
   **📵 Đóng tab quá 70 giây thì bị NHẤC KHỎI GHẾ** (`duoiNguoiRot`, chạy mỗi nhịp,
   **kể cả lúc chưa mở bàn** — phòng chờ mới là chỗ ghế treo lâu nhất). Hai mốc khác nhau có lý
   do: **25 giây = rớt mạng**, chập wifi vài giây thì máy đánh giùm chứ **không** đuổi oan;
   **70 giây = đi ngủ rồi**, nhả ghế cho người khác. Đang dính ván **chưa trả tiền xong** thì
   **không nhấc ngay** — ghi vào sổ `xinRoi`, đánh nốt, hết ván mới cho ra, **tiền
   ván đó vẫn trả đủ**. Phòng chờ hiện nhãn **📵 mất kết nối · ra ghế sau Ns** để cả phòng khỏi
   ngồi đợi một cái ghế ma. Ghế nhả hết → **phòng người chơi tự tạo tự xoá**
   (`donPhongTrong`, chừa 30 giây đầu cho người tạo kịp vào); hai phòng dựng sẵn thì
   giữ lại để sảnh không bao giờ trắng.
6. Hết ván → **NGỬA BÀI CẢ BÀN** ngay trên từng ghế. Ai còn heo hoặc còn hàng thì đeo nhãn
   **🐷 THỐI 2 HEO ĐỎ** / **💣 THỐI TỨ QUÝ**… (ghi rõ thối *cái gì*, không phải chỉ "thối 2"),
   ai cóng thì **🧊 CÓNG ×2**. Dưới bảng kết quả có **câu chọc** cho cả bàn cùng cười —
   câu chọn theo *(tên + số ván)* nên ổn định, không nhảy mỗi giây.
   Kèm bảng hạng + tiền từng người (tách rõ cược / đếm lá / nhốt / chặt / phế),
   **đếm ngược 5·4·3·2·1** giữa bàn rồi chia ván mới (bàn chạy liên tục tới khi còn dưới 2 người). Ai tụt dưới vốn tối thiểu bị **mời khỏi bàn** trước ván kế.
7. **📱 Điện thoại:** cầm **dọc** là bị màn che *"Xoay ngang điện thoại để chơi"* — chốt bằng
   **CSS** (`@media (orientation:portrait) and (max-width:820px)`) chứ không chỉ JS, JS hỏng thì
   vẫn che, và thân trang bị khoá cuộn luôn. Vuốt trên **bàn** hoặc **tay bài** không kéo trang
   (`touch-action:none`); cả trang tắt nảy mép và tắt "kéo xuống để tải lại"
   (`overscroll-behavior:none`). Ngưỡng 820px trong JS phải **khớp** nhánh CSS.

---

## 3c. Bỏ lượt là NGHỈ HẾT VÒNG

Bỏ lượt rồi thì **không được đánh nữa trong vòng đó**, dù người khác có đánh tiếp bao nhiêu nước.
Tới khi **cả bàn bỏ hết**, chủ bộ ăn vòng và mở vòng mới thì mọi người mới được vô lại.

```
vòng 1:  A đánh · B BỎ   · C đánh · D đánh
vòng 2:  A đánh · B NGHỈ · C đánh · D bỏ
vòng 3:  A đánh · B NGHỈ · C đánh · D NGHỈ
→ A bỏ nốt = cả bàn bỏ hết → C (chủ bộ) ăn vòng, mở vòng mới, sổ bỏ xoá sạch
```

Máy chủ giữ danh sách này ở `van.chongBai`/`van.daBo`; `keTiep()` nhảy qua ai đang nghỉ. Trang
báo rõ *"🚫 Bạn đã bỏ lượt — chờ hết vòng này"* kèm còn mấy người đang tranh.

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

Nguồn luật: **babichgame.gitbook.io/ba-bich/luat-choi** — chủ server chốt 20/09 *"dựa theo cái
này nè"*. Mọi thứ tính bằng **CƯỢC**; một cược đáng bao nhiêu Dogcoin là `cauHinh.mucCuoc`.

### Thang mức cược người chơi được chọn (`MUC_CUOC_CHO_PHEP`)

| Kiểu chơi | Con số nghĩa là gì | Các bậc |
|---|---|---|
| 🔢 **Đếm lá** (`anhet`) | giá **mỗi lá** còn trên tay (cũng chính là 1 cược) | 1.000 · 2.000 · 3.000 · 4.000 · 5.000 · 6.000 |
| 🏅 **Truyền thống 1-2-3-4** (`hang`) | tiền **giải nhất** (1 cược), nhì ăn đúng một nửa | 10.000 · 20.000 · 40.000 · 60.000 · 80.000 · 100.000 |

Admin ở panel vẫn đặt được số bất kỳ (100 – 1.000.000); thang chỉ ràng người chơi.

### Ăn thua theo vị trí về — chỉ chế độ `hang`

| Số người | Nhất | Nhì | Ba | Bét |
|---|---|---|---|---|
| 4 | **+1** | +0.5 | −0.5 | −1 |
| 3 | **+1.5** | −0.5 | −1 | — |
| 2 | **+1** | −1 | — | — |

Ván chạy tới khi **chỉ còn 1 người cầm bài**.

### Đếm lá — chế độ `anhet`

Có người về nhất là **DỪNG NGAY**. Mỗi lá còn trên tay người thua = **1 cược**, trả hết cho
người nhất. **KHÔNG có cược nền** — đúng luật gốc, và ô `giaLa` riêng đã bị **bỏ hẳn** (để hai
con số rời nhau thì có ngày chỉnh lệch rồi tính sai tiền cả bàn).

### Heo & Hàng — MỘT bảng giá cho CẢ hai việc

Dùng khi bộ **bị chặt** (trả ngay trong ván cho người chặt) và khi **bị nhốt** — còn trên tay
lúc hết ván, dân gian gọi *"thối"* (trả cho người nhất). Đơn vị: **cược**.

| | heo đen | heo đỏ | 3 đôi thông | tứ quý | 4 đôi thông |
|---|---|---|---|---|---|
| 🏅 Truyền thống | 0.5 | 1 | 1 | 1.5 | 2 |
| 🔢 Đếm lá | 3 | 6 | 12 | 12 | 24 |

Sảnh, đôi thường, rác **không** tính tiền. Hai chỗ tự quyết, ghi rõ để sau khỏi cãi:
- **Heo luôn tính từng lá**, kể cả 4 con 2 — đó là 2 heo đen + 2 heo đỏ (3 cược ở bàn truyền
  thống) chứ không phải *một tứ quý* (1.5). Đúng tinh thần "thối 2": kẹt heo là chết.
- Lá đã dùng cho một hàng thì **không dùng lại**; nhặt hàng **đắt trước** (4 đôi thông > tứ quý ≥
  3 đôi thông — thứ tự này đúng ở cả hai bảng). Tham lam đơn giản, không tìm cách tối ưu.

### 🧊 Cóng — cả ván không đánh nổi một lá nào

Bỏ lượt **không** tính là đánh; máy đánh giùm lúc hết giờ thì **có** tính.

- `hang`: xử như **thua bét** nhưng mất **gấp đôi**; phần dôi ra dồn cho người nhất.
  Luật gốc: *"ván 4 người, khi có một người bị cóng, 2 người còn lại sẽ tranh Nhì và Ba"*.
- `anhet`: **mỗi lá gấp đôi**.
- Cả hai: heo và hàng bị nhốt cũng **gấp đôi**.

Đo thật bằng `lua-test`: cóng xảy ra **~0–1 lượt trên 400 ván**. Nó nặng nhưng hiếm.

### Phế 10%

Ai ăn **ròng dương** thì nhà cái cắt 10% phần ăn đó (người thua **không** bị cắt). Đây là chỗ duy
nhất bàn không tổng-bằng-0. `ketQua.pheTong` đúng bằng phần hụt của cả bàn — `van-test` và
`lua-test` canh đẳng thức này ở **mọi** ván.

### Bốn chốt an toàn về ví (`web.js`)

1. **Vốn tối thiểu**, kiểm **lại trước mỗi ván**. Hệ số **khác nhau theo chế độ**:

   | Chế độ | Hệ số | Thua đậm nhất một ván (lý thuyết) |
   |---|---|---|
   | `hang` | **30×** | ~11 cược (bét cóng −2, nhốt 4 đôi thông + tứ quý + heo, ×2) |
   | `anhet` | **120×** | ~110 cược (cóng: 13 lá ×2 = 26, nhốt tối đa 42 cược ×2 = 84) |

   Để chung 30× thì phòng đếm lá có ngày người chơi **thua nhiều hơn số tiền họ có** → ví bị kẹp
   về 0 và **người thắng** lãnh đủ (không được trả hết). Đổi mức cược (kể cả do vote) là đổi luôn
   vốn tối thiểu — `vanKe()` áp vote **trước** rồi mới mời người thiếu vốn ra.
2. `traTien()` chạy **đúng một lần** mỗi ván (khoá bằng `daTraVan = số ván`) — gọi từ cả `nhip()`
   lẫn ngay sau nước đánh, gọi thừa bao nhiêu lần cũng vô hại.
3. **Lưới an toàn**: nếu ví ai đó vẫn không đủ trả, kẹp lại đúng số họ có, cắt phần ăn của người
   thắng theo tỉ lệ, và **ghi log ⚠️** để chủ server biết mà xem lại vốn tối thiểu.
4. **Mỗi lúc chỉ ngồi MỘT phòng.** Hai bàn cùng trừ một ví là vỡ. `taoSanh` tự cho đứng dậy khỏi
   phòng cũ, và **phải kiểm phòng cũ có thả ra thật không** — xem cạm bẫy ở mục 7.

Mỗi lần cộng/trừ đều vào **sổ Dogcoin** (`logDog` loại `tienlen`) để đối chiếu khi có tranh cãi.

---

## 6. Kiểm thử — chạy đích danh, không wildcard

```bash
node TienLen/kiemtra/bai-test.js     # luật bộ bài: nhận dạng, so, chặt, tới trắng      (89)
node TienLen/kiemtra/van-test.js     # máy ván + TIỀN cả 2 chế độ, cóng, nhốt          (117)
node TienLen/kiemtra/web-test.js     # ghế, VÍ, SẢNH, VOTE, chống lộ bài, lưới an toàn  (86)
node TienLen/kiemtra/trang-test.js   # client: cú pháp, id trùng, vẽ, ĐỐI CHIẾU luật   (154)
node TienLen/kiemtra/noi-test.js     # nối vào BotDoMin: trang, ảnh, route, cổng LK     (30)
node TienLen/kiemtra/panel-test.js   # TRANG PANEL: cú pháp JS của trang + đăng nhập    (12)
node TienLen/kiemtra/lua-test.js 400 # 🐛 LÙA BUG: 400 ván thật, ~170.000 phép kiểm
```

**`lua-test` là bộ quan trọng nhất.** Nó đánh hàng trăm ván THẬT qua `xuLy()` (đúng đường HTTP
đi) với 2–4 máy đánh ngẫu nhiên, cả hai chế độ, kèm **mưa yêu cầu bậy** (đánh sai lượt, đánh lá
của người khác, lá trùng, mã lá bịa, ngồi/rời giữa ván). Sau **mỗi nước** và **mỗi ván** nó soi
bất biến: tổng tiền ván = −phế · ví thật hụt đúng bằng phế · không ví nào âm · ăn thua đúng bảng
vị trí · nhốt đúng bảng giá · cóng nhân đôi · không ai thấy số lá của nhau · không kẹt lượt ·
người hết vốn bị mời ra. Nó in luôn **thua đậm nhất một ván** quy ra giá bàn thật — con số để
quyết vốn tối thiểu. Cái gì lệch là **lỗi thật**, không phải chuyện xác suất.
`van-test` và `web-test` có ngẫu nhiên (chia bài) → **chạy 3 lần** để dò chập chờn.

`trang-test` có mục **⚖️ đối chiếu**: chạy máy luật bản client trong `vm` rồi so với `bai.js` trên
**1.500 ca ngẫu nhiên + 14 ca dựng tay**, và kiểm **mọi nước 💡 gợi ý đều được server chấp nhận**
(200 tay ngẫu nhiên). Sửa `bai.js` mà quên sửa bản client là mục này đỏ ngay.

---

## 7. Cạm bẫy đã dính (đừng dính lại)

- **Viết tắt CSS đặt SAU dòng dài thì XOÁ SẠCH dòng dài — vỡ bàn hai lần (20/09).**
  ```css
  body.choiBan .ni{position:absolute;left:50%;top:50%;transform:…;inset:auto;…}
  ```
  `inset` là **viết tắt của top/right/bottom/left**. Đặt `inset:auto` phía sau là nó **xoá
  `left:50%;top:50%` vừa ghi ở trên** → khung rơi về vị trí tĩnh = **góc trái trên màn hình**,
  kéo theo cả chiếu bài. Chủ server báo *"đánh bài nó văng lên góc"* hai lần; lần đầu mình chẩn
  nhầm sang hiệu ứng bay. **Trình duyệt không hề báo lỗi** — câu CSS hợp lệ hoàn toàn, chỉ là
  tự ghi đè chính mình. Cùng bẫy: `margin`, `padding`, `background`, `border`, `flex`.
  → `trang-test` giờ **quét mọi quy tắc CSS** và đỏ nếu có viết tắt đứng sau dòng dài nó bao trùm.

- **`'` trong `panel.js` bị template literal NUỐT — chết cả trang panel (20/09).** Cả trang
  panel là **một template literal khổng lồ**. Viết `onclick="tlLuu(''+T.ma+'')"` thì template
  literal ăn mất dấu gạch, trang đích ra `tlLuu(''+T.ma+'')` — **hai chuỗi dính nhau = lỗi cú
  pháp = CHẾT TOÀN BỘ JS của trang**. Admin **bấm đăng nhập không ăn**, bấm gì cũng không ăn, mà
  log bot thì im ru vì lỗi nằm phía trình duyệt. `node --check panel.js` **không bắt được**:
  bản thân file đúng cú pháp, thứ hỏng là cái **chuỗi nó sinh ra**.
  → Muốn ra `'` ở trang đích thì nguồn phải viết **`\'`** (xem `palSetName`, `gvGive`).
  → Giờ có `kiemtra/panel-test.js`: dựng panel thật, lấy trang về, **kiểm cú pháp JS của trang**.

- **`daBo.clear()` trong `danh()` — SAI LUẬT, sửa 20/09.** Dòng cũ có lời chú *"có người đánh ->
  vòng mới mở lại cho mọi người"*, nghĩa là cứ ai đánh một lá là xoá sạch sổ bỏ lượt. Hậu quả:
  người vừa bỏ lượt được đánh lại ngay vòng sau. Luật đúng: **bỏ lượt là nghỉ hết vòng**, tới khi
  **cả bàn bỏ hết** thì vòng mới mở lại mới được vô. Chỗ xoá đúng là `chuyenLuot()`.
  `van-test` có mục dựng nguyên ca chủ server đưa.
- **Quên xoá chỗ ĐỌC khi bỏ một trường ở máy chủ.** Bỏ `giaLa` ở `van.js`/`web.js` nhưng trang
  vẫn `vnd(b.giaLa)` → `undefined` → in ra **"· lá 0"**, người chơi tưởng bàn không tính tiền lá.
  Lặng lẽ sai, không nổ. Giờ có phép kiểm `!/giaLa/.test(JS)`.

- **Hai thẻ cùng `id`.** Tiêu đề trang và chữ-to-giữa-bàn cùng mang `id="banTen"`.
  `getElementById` trả thẻ **đầu tiên** nên hàm bắn chữ ghi đè lên **tiêu đề**, còn thẻ giữa bàn
  nằm chết; CSS `#banTen` (absolute + animation mờ dần) cũng dính vào tiêu đề, mà `.top` không
  `position` nên tiêu đề bị ném ra giữa màn hình rồi **tan biến sau 1,7 giây**. Nhìn mắt không ra
  vì nó *trông như* đang chạy đúng. `trang-test` giờ **quét id trùng cả trang**.
- **Đổi phòng mà vứt kết quả của `/roi` phòng cũ.** Đang giữa ván thì phòng cũ từ chối, người đó
  **vẫn ngồi phòng cũ** mà **vẫn được** ngồi phòng mới → một ví hai bàn cùng trừ, đúng cái mà luật
  *"mỗi lúc một phòng"* sinh ra để chặn. Phải **kiểm lại ghế phòng cũ** sau khi gọi `/roi`.
  `web-test` có phép kiểm dựng đúng cảnh này.
- **Bỏ `giaLa` thì phải bỏ ở CẢ panel, trang, và bộ kiểm.** Sót một chỗ là ô rỗng ghi đè 0 vào
  cấu hình rồi cả bàn tính sai tiền mà không ai thấy. Giờ `datCauHinh` **trả lỗi** nếu ai còn gửi
  `giaLa` — thà đỏ ngay còn hơn im lặng tính sai.
- **`panel.js` lưu kiểu CRLF**, mấy file trong `TienLen/` thì LF. Tệp vá viết bằng LF sẽ **không
  khớp mỏ neo nào** trong panel. Chuẩn hoá về LF, vá xong đổi lại CRLF.
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
- **Hover mà DI CHUYỂN lá là lá RUNG vô tận.** Rê chuột vào mép dưới lá bài: lá nhấc lên → mép dưới
  chạy khỏi con trỏ → mất hover → tụt xuống → dính hover lại → lặp mãi. Luật: hover **chỉ được** đổi
  `z-index` / viền / màu, **cấm** `transform`/`margin`. `trang-test` dò mọi luật `.tay .the…:hover`.
- **Hover cũng không được đụng lá ĐÃ CHỌN.** Đẩy `z-index` lá chọn đầu lên là nó che lá chọn kế bên
  (chọn 3 lá, rê vào lá đầu thì lá giữa biến mất). Luật hover phải có `:not(.chon)`.
- **Đừng ghép câu lỗi của mình vào câu `kq.vi` đã có.** Từng ra *"Mấy lá này không thành bộ · Mấy lá
  này không thành bộ hợp lệ"*. Mớ lá không thành bộ thì để `cDanhDuoc` nói, web chỉ in lại.
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
