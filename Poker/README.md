# Poker — giải Texas Hold'em 2–8 người cho server Bialk

> **Viết cho người/AI tiếp nhận.** Đây là **trạng thái hiện tại**, không phải nhật ký. Lịch sử: `git log -- Poker/`.
> Chủ server: **Khoa** — không rành code. Trả lời tiếng Việt, chỉ rõ file và dòng.

Giải poker **loại dần**, chip trong bàn là **chip ảo**. Không ai ăn Dogcoin của ai. Giải chỉ đẻ ra
**thứ hạng 1→8**; thưởng Pal / phạt là admin tự trao trong game. Bàn tối đa 8, tối thiểu 2, admin mở.

**Chạy NHÚNG trong web BotDoMin** (chủ server chốt "gộp chung, xài chung 1 link"): cùng cổng web cược,
tab thứ 3 **🃏 GIẢI POKER** trên trang chính (admin bật/tắt ở panel SUPER), cùng phiên đăng nhập.
Trang poker là file `trang.html` phục vụ tại `/poker/`, API ở `/api/poker/*`. Mọi thao tác giải
(chip, Bắt đầu, Giải tán, Tạm nghỉ) ở **panel SUPER → tab 🃏 Poker**. Không có tiến trình riêng trên VPS.

---

## 0. Luật làm việc (giống BotDoMin, thêm 3 điều riêng)

| Luật | Vì sao |
|---|---|
| **Poker KHÔNG đụng logic tiền của BotDoMin.** Chỉ đọc hồ sơ (`points`, `ingameName`, `webPin`) qua `dbCache`; hai khoá riêng `_pokerAdmin` / `_pokerOn` do panel ghi. BotDoMin bị đụng đúng 3 chỗ: ctx (`index.js`), `/poker/` + `/api/poker/*` (`webplay.js`), tab 🃏 (`panel.js`). | Cùng tiến trình với bot — poker ném exception ra ngoài là kéo bot theo. Nên `web.js` nuốt MỌI lỗi (trả 400), nhịp 1 giây tự bắt lỗi; `giai.js` không có I/O. Bộ kiểm `web-test` so nguyên file DB giả trước/sau. |
| **Client không bao giờ tự quyết lộ bài.** Mọi thứ lộ ra (khoe bài, lật bài) đều do `giai.js` quyết định và gửi về. | Lộ bài là hỏng cả tính năng. `web-test` soi **từng byte** HTTP trả về cho từng người. |
| **Mọi chỗ vẽ lại trang phải qua `datHTML()`** hoặc mang dấu `/*CHAN-ROI*/`. | Trang hỏi máy chủ mỗi giây; gán thẳng `innerHTML` là cuốn mất thanh kéo, ô nhập, hiệu ứng. Đã dính 3 lần trong repo. `trang-test` dò dấu này. |
| Chỉ commit / push khi chủ server nói. Sửa xong chạy đủ 5 bộ kiểm (mục 6). | |

---

## 1. Bản đồ file

| File | Việc | Kiểm bằng |
|---|---|---|
| `bai.js` | Bộ 52 lá, xáo (`crypto`), chấm 5–7 lá, so bài, xếp hạng bàn | `kiemtra/bai-test.js` (67) · `kiemtra/bai-daydu-test.js` (duyệt hết 2.598.960 bộ, khớp bảng xác suất chuẩn) |
| `giai.js` | Máy trạng thái giải: ván, blind, lượt, hũ phụ, loại, hạng, AFK, tạm ngưng, khoe bài | `kiemtra/giai-test.js` (~160) |
| `web.js` | **Mô-đun gắn vào web BotDoMin**: phòng chờ 8 ghế, cổng vào, `xuLy(req,res,sendJSON)` cho `/api/poker/*`, `nhip()` mỗi giây, `quanLy.*` cho panel SUPER. Nhận `userId` đã xác thực từ ngoài, không có login riêng | `kiemtra/web-test.js` (~61, qua vỏ `index.js`) |
| `index.js` | **Chỉ để dev/test**: vỏ đứng riêng cổng 4003 bọc `web.js` + đăng nhập riêng + phục vụ file. **Prod không chạy file này** | `kiemtra/web-test.js` |
| `trang.html` | Trang người chơi — **file HTML thật**, không nhét vào chuỗi JS | `kiemtra/trang-test.js` (~75) |
| `bai/` | 53 ảnh `.webp` (52 lá + lưng), **public domain**, tự thu về 136px. Xem `bai/NGUON.md` | |

Mã lá = tên file: `As` `Kh` `10d` `2c` → `bai/As.webp`. Chất `s`♠ `h`♥ `d`♦ `c`♣.

---

## 2. Chạy

**Prod (VPS):** không có gì riêng — poker chạy **trong** `pm2 BotDoMin`. Deploy như mọi khi:

```bash
cd /root/tts-bot && git pull && pm2 restart BotDoMin
```
Thư mục `Poker/` phải nằm **cạnh** `BotDoMin/` trong repo (`BotDoMin/index.js` và `webplay.js` tìm `../Poker`).
Sau khi lên: panel SUPER → tab **🃏 Poker** → điền **Admin poker** (ID Discord) → tick **Hiện tab** → người chơi thấy tab **GIẢI POKER** trên web cược.

**Bản test local:** `node Desktop/bialk-test.js 5 → 3 → 4`. Script này chép 7 file BotDoMin sang `bialk-test/` nhưng **đọc `Poker/` thẳng từ repo** qua biến `POKER_DIR` (đặt sẵn trong bước 4) → sửa `trang.html` là bản test ăn ngay. Bước 6 có nhánh kiểm poker.

**Vỏ đứng riêng (chỉ dev / `web-test.js`):**
```bash
POKER_PORT=4003 POKER_DB="c:/Users/nguye/Desktop/bialk-test/database.json" node Poker/index.js
```

| Biến (chỉ vỏ đứng riêng / bản test) | Mặc định | Ghi chú |
|---|---|---|
| `POKER_DIR` | `../Poker` | BotDoMin dùng để tìm `web.js`, `trang.html`, `bai/`. `bialk-test.js` tự đặt |
| `POKER_PORT` | 3003 (test 4003) | vỏ đứng riêng |
| `POKER_DB` | `../BotDoMin/database.json` | vỏ đứng riêng, chỉ đọc |
| `POKER_ADMIN` | *(trống)* | vỏ đứng riêng. **Prod: đặt ở panel SUPER → tab 🃏 → "Admin poker"** (khoá `_pokerAdmin`) |
| `POKER_AFK_GIAY` / `POKER_GIAY_LAT` | 25 / 3 | vỏ đứng riêng (test đặt LAT=1) |

`trang.html` đọc từ đĩa **mỗi lần gửi** → sửa là ăn ngay, cả prod lẫn test. Sửa `web.js`/`giai.js` phải restart bot.

---

## 3. Luồng chơi

1. Đăng nhập bằng **ID Discord + PIN web** của bot (đối chiếu `webPin` trong DB).
2. **Cổng vào:** phải có `ingameName` (đã liên kết) **và** ví ≥ `DOGCOIN_VAO_GIAI = 10.000`. **Chỉ kiểm, không trừ.** Kiểm lại lần nữa lúc admin bấm Bắt đầu.
**Toàn màn hình:** bấm tab 🃏 là khung nhúng phủ kín màn (che thanh số dư + 2 hàng tab của web cược), thoát bằng nút **✕ Thoát poker** góc phải trên. Cơ chế: `go()` bật lớp `body.pokerFull` trong `webplay.js`.

3. Phòng chờ là **bàn oval 8 ghế** — bấm ghế trống để ngồi, bấm ghế mình để rời/đổi. **Trang người chơi không có nút admin.** Admin vào **panel SUPER → tab 🃏 Poker**: chọn **chip khởi điểm** (2.000 / 5.000 / 10.000 / 20.000, thang blind tự sinh theo), **▶️ Bắt đầu (N người)**, **🧹 Giải tán**, **⏸️ Tạm nghỉ / ▶️ Chơi tiếp**, và công tắc **Hiện tab 🃏** trên web.
4. Trong giải: ghế xoay để **mình luôn ở đáy**. Nút cái ván đầu **ngẫu nhiên**, có **viền vàng** + nhãn **D**; nhãn **SB/BB** cạnh tên. Bài mình vừa chia thì **phóng to giữa màn hình để nặn** (kéo/bấm), mở xong giữ 2 giây rồi hạ về ghế; qua vòng bài chung mà chưa mở thì máy **lật giùm**.
5. Hết ván: người thắng có hiệu ứng + số chip bay lên, bài người bỏ **tối đen**, đếm ngược **3 giây** rồi chia ván mới. Cháy hết chip → báo *"Bạn đã bị loại — hạng N/M"*, ngồi xem tiếp (chỉ thấy bài lúc lật).
6. Giải xong → bảng hạng 1→8. Admin **Giải tán** để mở giải mới.

**Khán giả** (không trong giải, kể cả người đã cháy) nhận `xemChung()` — không có bài riêng của ai.

---

## 4. Luật đã chốt (khác sòng thật một chút — cố ý)

Ghi ở đầu `giai.js`. Tóm:

| # | Luật | Lý do |
|---|---|---|
| 1 | Tố ngắn (all-in < mức tố tối thiểu) **vẫn mở lại lượt** | Luật thật đẻ nhiều ca hiếm, bàn người quen lợi bất cập hại |
| 2 | Blind chỉ lên **giữa hai ván** | |
| 3 | Hết 30s: miễn phí → **tự theo**; phải bỏ tiền → **tự bỏ** | |
| 4 | Cháy cùng ván: vào ván **nhiều chip hơn** → hạng cao hơn | |
| 5 | **AFK vẫn đóng blind**, tới lượt máy đánh giùm ngay (theo nếu miễn phí, bỏ nếu phải trả) | Giống mọi phần mềm poker, công bằng với người rớt mạng. Chủ server chốt giữ |
| 6 | **Tạm ngưng:** mỗi người **1 lần/giải**, **cả bàn đồng ý** mới ngưng; bị từ chối **vẫn mất lượt**; người AFK **không tính phiếu**. Đông cứng **cả 2 đồng hồ**, chơi tiếp cộng bù đúng thời gian nghỉ | Chống câu giờ; không kẹt vì người vắng |
| 7 | **Khoe bài:** mỗi ván **1 lá**, cả bàn thấy **4 giây**. Đã bỏ bài vẫn khoe được | Quyết định ở máy chủ |
| 8 | Chip lẻ khi chia hũ → người **còn bài** sát trái nút cái nhất | Có bài kiểm dựng ca 85 chip / 3 người bằng bài / 1 người bỏ |

---

## 5. Thang blind & nhịp giải (đã mô phỏng, đừng chỉnh mò)

**Thang** sinh từ chip khởi điểm (`taoLichBlind`): BB đầu = **1% stack** (sâu 100 BB), chạy trên bậc số đẹp
`50 → 100 → 150 → 200 → 300 → 400 → 600 → 800 → 1.000 → 1.500 → …`, **phải leo tới BB ≥ chipDau × 8**
(tổng chip tối đa của bàn). Dừng sớm hơn là bot chỉ-bỏ-bài treo giải vô hạn (BB ăn đúng tiền SB, giáp vòng hoà) — `giai-test` "cả bàn AFK" từng bắt được đúng lỗi này.

**Lên mức** khi **cái nào tới trước**: hết **8 phút**, hoặc đánh đủ **max(số người còn sống, 6) ván**.
Sàn 6 là bắt buộc: không sàn thì 2 người cứ 2 ván lên một mức (~1 phút), giải tàn trong 10 phút.

Mô phỏng 40 giải/ô, lối chơi gần người thật (30% bỏ · 55% theo · 15% tố), ~15 + 6×N giây mỗi ván:

| Người | 5.000 chip | 10.000 chip |
|---|---|---|
| 2 | 23 phút | 26 phút |
| 4 | **36** | **41** |
| 6 | **48** | **52** |
| 8 | **60** | 68 |

Mục tiêu chủ server 30–60 phút. Tay đôi nhanh là đúng bản chất. Bàn 8 muốn gọn hơn → chọn 5.000.

Bằng chứng: `node Poker/kiemtra/mo-phong-blind.js` (~1–2 phút, in bảng p10/p50/p90 cho từng cỡ bàn × sàn × phút/mức).
**Muốn đổi `PHUT_MOI_MUC`, `VAN_TOI_THIEU_MOI_MUC` hay bậc `BB_DEP` thì chạy lại script này rồi mới chốt.**
Công thức ở `giai.js`: `taoLichBlind` (thang) + đầu `vanMoi` (lên mức).

---

## 6. Kiểm thử — chạy đích danh, không wildcard

```bash
node Poker/kiemtra/bai-test.js          # bộ bài + chấm bài
node Poker/kiemtra/bai-daydu-test.js    # duyệt hết 2.598.960 bộ 5 lá (~4s) — chỉ chạy khi đụng chamNam
node Poker/kiemtra/giai-test.js         # máy giải — chạy 3 lần để dò chập chờn (có ngẫu nhiên)
node Poker/kiemtra/web-test.js          # HTTP thật, DB giả trong thư mục tạm, soi từng byte chống lộ bài
node Poker/kiemtra/trang-test.js        # cú pháp JS trang, mọi id/onclick tồn tại, luật datHTML, 3 hiệu ứng
node Poker/kiemtra/mo-phong-blind.js    # KHÔNG phải bài kiểm — mô phỏng thời lượng giải, chạy khi đổi luật blind
```

Bài kiểm để **trong repo** (`Poker/kiemtra/`), không để thư mục tạm — thư mục tạm lẫn script vá tên `*test*.js`, chạy nhầm là hỏng file nguồn (đã xảy ra bên BotDoMin).

Nguyên tắc: bài kiểm hỏng thì **đọc lý do trước khi sửa** — trong đợt này ~1/3 số lần hỏng là **bài kiểm khoá luật cũ** (nút cái ngẫu nhiên, sàn 6 ván), ~1/3 là **lỗi thật** (thang blind dừng dưới trần, `vanConLai` quên sàn, người cháy vẫn thấy "đang chờ"), còn lại là dò biểu thức sai.

---

## 7. Cạm bẫy đã dính

- **Gọi `kiemTraVong()` ngay sau khi đặt lượt đầu** → lượt bị đẩy thêm một bước, nút cái đi trước UTG.
- **Sau flop lấy nút cái đi đầu** → phải là người **bên trái** nút cái.
- **Ván xong mà `luot` còn trỏ vào người** → `hanhDong` vẫn lọt, vòng lặp vô tận (bộ kiểm treo 400s). Giờ `chotVan` xoá `luot`, `hanhDong` chặn `LAT/XONG`.
- **Chốt "đang nghỉ" đứng sau chốt "chưa tới lượt"** → người chơi nhận câu báo lạc đề. Phải xét đầu tiên.
- **Đường lạ trả 401** → nghe như "đăng nhập là thấy file". Mọi đường không `/api/` trả 404 ngay.
- **`VIEWONLY_PATHS` trong `panel.js` là danh sách CHẶN** trên cổng thường — thêm route admin mới mà quên ghi vào là cổng thường gọi được. `/api/poker/admin` đã ghi.
- **Tiến trình dev cũ giữ cổng** — `pkill` không diệt được process do harness quản; dùng `Get-NetTCPConnection -LocalPort … | Stop-Process`.
- **Khoe bài dùng đồng hồ thật** — bài kiểm truyền mốc giả (1000) là lá coi như hết hạn ngay.
- **Bash nuốt backslash / backtick** khi viết script vá → viết bằng Write tool.
- **`webplay.js` che tên `path`**: trong handler có `const path = url.pathname` (chuỗi) → `path.join()` nổ "is not a function" → `/poker/` trả 500 dù API vẫn chạy. Mô-đun đặt tên `nodePath`.
- **Panel `/api/state` bọc `{ ok, state }`** — probe đọc `j.pokerOn` ra `undefined` tưởng thiếu trường; đúng là `j.state.pokerOn`. Client panel đọc `STATE.*` đã đúng.
- **`VIEWONLY_PATHS` là danh sách CHẶN** trên cổng thường — 7 route `/api/poker/*` của panel đều phải ghi vào, quên một cái là cổng thường mở được giải.
- **Bản test không có `../Poker`** (`bialk-test.js` chỉ chép 7 file BotDoMin) → bot test sập lúc nạp. `POKER_DIR` do bước 4 của script đặt; đừng bỏ.
- **Tên trường lỗi**: `web.js` trả `{ ok:false, error }` theo BotDoMin, không phải `{ loi }` như bản đứng riêng cũ. `trang.html` đọc `j.error || j.loi`.
- **Vòng ghế ghim cứng 43% → ghế thò ra ngoài sân.** Ghế đặt `left:x%` + `translate(-50%,-50%)`, hộp ghế rộng 96–168px, nên ghế ngoài cùng chỉ vừa khi sân rộng **≥ ~690px**. Khung nhúng trong web cược rộng ~550px → **Ghế 7 bị cắt mất nửa**, Ghế 3 đội mép phải; điện thoại 380px còn tệ hơn. Đã thay bằng `banKinhX(san)` — đo bề ngang sân + hộp ghế rồi kéo vòng ghế vào (tối đa vẫn 43% như cũ trên màn ≥ ~1280px). Dùng ở **cả 2 chỗ vẽ ghế** (phòng chờ + trong ván). Đổi `width` của `.ghe` thì phải sửa công thức trong `banKinhX` cho khớp.
- **`style=` gắn thẳng trên thẻ đè MỌI rule CSS.** Khung nhúng từng có `style="height:calc(100vh - 150px)"` nên `body.pokerFull #pokerFrame{height:100%}` không ăn — toàn màn hình mà khung vẫn cao cũ. Kích thước cả 2 trạng thái phải nằm trong khối CSS.
- **Bàn phải vừa CẢ CHIỀU CAO.** Chỉ `width:100%` + `aspect-ratio` thì điện thoại ngang (740×360) ra bàn cao 503px, tràn màn. `.san` nay lấy `width:min(100%, (100dvh − chừa) × tỉ lệ)`; riêng màn ngang thấp (`orientation:landscape` + `max-height:520px`) bỏ tỉ lệ, cho bàn ăn trọn màn.
- **Mốc `@media` 520px là mốc điện thoại, không phải mốc khung hẹp.** Khung nhúng 550px rơi vào khoảng giữa → ăn bố cục máy tính trong hộp hẹp (bàn dẹp, ghế to). Đã nâng mốc lên **700px**.

---

## 8. Việc mở

- **Không lưu trạng thái giải** — `pm2 restart BotDoMin` (deploy) giữa giải là mất giải, vì poker giờ chạy chung tiến trình bot. Chủ server không deploy lúc có giải nên chấp nhận. Muốn chắc: panel SUPER → tab 🃏 xem `poker.giai` trống rồi mới restart.
- **Phiên đăng nhập không hết hạn, không chặn dò PIN** (6 số = 1 triệu tổ hợp).
- **Không báo Discord** khi giải kết thúc — admin đọc màn hình rồi tự trao.
- **Lịch sử ván** (`G.nhatKy`) có ghi nhưng chưa hiện.
- **Thông đồng** giữa 2 người quen cùng bàn — chưa có hướng xử lý.
- Hình phạt cho người bét: chủ server tự có cách, bot chỉ báo hạng.
- Điện thoại **cầm dọc bị che hẳn** (lớp "Xoay ngang điện thoại để chơi", hiện khi rộng < 700px và cao > rộng) — chủ server chốt chỉ chơi PC hoặc điện thoại xoay ngang. Xoay ngang thì bàn ăn trọn màn (844×390 → bàn 836×286). Chưa có ai thử trên điện thoại thật.

---

## 9. Tiếp theo — bắt đầu từ đây (viết cho phiên làm việc sau)

**Trạng thái lúc commit này:** poker đã **nhúng xong vào BotDoMin** và kiểm bằng máy. Chưa ai **mở trình duyệt bấm thử** tab GIẢI POKER với 2+ người thật.

Đã kiểm bằng máy (đều xanh):
- 5 bộ `Poker/kiemtra/*`: 67 · 11 · 161 · 61 · 82 = **382 bài**.
- Bot test (`bialk-test.js 5→3→4`) **nạp poker nhúng không sập**; `/poker/` 200, ảnh 200, `/poker` → 302, đường bậy → 404.
- `/api/poker/state` bằng **token web chung** (`play_token`) → ok, 8 ghế. Ngồi ghế 3 → `gheCuaToi=3`. Rời → -1.
- Người **chưa liên kết** (TEST-C): xem state được, **ngồi bị 403 `chuaLienKet`** — cổng liên kết sẵn có chặn, không viết chốt riêng.
- Panel SUPER 4508: `state.pokerOn/pokerAdmin/poker.*` có đủ; `/api/poker/on` bật → web `/api/state.pokerOn=true`; đặt chip 10.000 → thang bắt đầu 100. Panel thường 4234 gọi `/api/poker/on` → **403**.
- `dom-null-check` trang web: 10/10. Client-syntax `webclient-check` 12/12, `panelclient-check` 2/2.

**Việc phải làm TAY ngay khi mở lại (theo thứ tự):**
1. `node Desktop/bialk-test.js 4` (nếu bot test chưa chạy) → mở `http://127.0.0.1:4508` (panel SUPER) → tab **🃏 Poker** → điền `111111111111111111` vào **Admin poker** → Lưu → tick **Hiện tab**.
2. Mở `http://127.0.0.1:4002` bằng **2 cửa sổ ẩn danh** (TEST-A `111…111` / TEST-B `222…222`, PIN `123456`) → bấm tab **🃏 GIẢI POKER** → mỗi người bấm một ghế.
3. Quay lại panel → **▶️ Bắt đầu (2 người)** → về web: kiểm chia bài bay, lớp nặn giữa màn hình, kéo tố không nhảy, nhãn D/SB/BB, viền nhà cái, bỏ bài đen, thắng nảy, đếm ngược 3s, khoe bài, xin nghỉ.
4. Thử **tắt tab** ở panel trong lúc đang đứng ở tab poker → trang phải tự nhảy về MINI GAME.
5. Ưng rồi → `git pull` trên VPS + `pm2 restart BotDoMin` → panel prod đặt Admin poker + Hiện tab.

**Lỗi có sẵn, KHÔNG phải của poker (để biết, đừng tưởng poker gây ra):** `bialk-test.js 6` báo 5 chỗ hỏng ở Dò Mìn / Leo Thang vì DB bot test đang để **sàn cược 400** mà bước 6 cược cứng **200**. Sửa: panel → sàn cược về 200, hoặc đổi số trong bước 6.

**Nếu muốn làm tiếp tính năng (gợi ý, chưa hứa):** báo Discord khi giải xong (dùng `quanLy.tomTat().giai.ketQua`, bắn từ `index.js` khi `trangThai` chuyển `XONG`) · lịch sử ván (`G.nhatKy` có sẵn) · lưu trạng thái giải qua restart (chỉ cần khi chủ server hay deploy giữa giải).

**Lệnh chạy nhanh:**
```bash
node Poker/kiemtra/bai-test.js; node Poker/kiemtra/giai-test.js; node Poker/kiemtra/web-test.js; node Poker/kiemtra/trang-test.js
node Desktop/bialk-test.js 5; node Desktop/bialk-test.js 3; node Desktop/bialk-test.js 4; node Desktop/bialk-test.js 6
```
