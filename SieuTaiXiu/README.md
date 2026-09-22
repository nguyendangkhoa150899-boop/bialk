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
- Còn lại y bàn thường: bấm ô là đặt, đồng Dogcoin trên ô, 3 nút thao tác nhanh, nặn chén,
  4 giây cuối tự mở, ô trúng sáng / ô trượt chìm.
- ⚠️ **Nút MAX CƯỢC KHÁC bàn thường** — xem §5c. Bàn thường không phí nên MAX = trọn ví; bàn
  Siêu MAX = `floor(ví / 1,2)` để còn chỗ trả phí.
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

## 5c. "Có tròn 100.000, bấm MAX, sao chỉ cược 83.333?" (22/09)

Bạn của chủ server báo *bug*: ví tròn **100.000**, bấm **MAX CƯỢC** vào XỈU → ô hiện **83.333**,
thắng nhận **166.667**. **Máy tính không sai về nguyên lý.** Phí 20% **cộng thêm** trên tiền
cược (§1), nên với 100.000 trong ví KHÔNG THỂ cược trọn 100.000 — phải chừa chỗ cho phí.

Nhưng bộ kiểm quét 2.006 mức ví lại lòi thêm một lệch nhỏ: trang tính MAX bằng
`floor(ví / 1,2)` trong khi máy chủ tính phí bằng `floor(cược × 0,2)`, nên MAX **bỏ sót
1 Dogcoin** ở 2/3 số ví. Với ví 100.000:

    bản CŨ  floor(100.000/1,2) = 83.333 · phí 16.666 · trừ  99.999 (dư 1) · thắng 1:1 = 166.667
    bản MỚI stMaxTheoVi(100.000) = 83.334 · phí 16.666 · trừ 100.000 (đúng) · thắng 1:1 = 166.668
                                                                              → lãi thật +66.668

`stMaxTheoVi(bal)`: bắt đầu từ `floor(bal/1,2)` rồi nhích lên tới khi thêm 1 là vượt ví (tối đa
1–2 vòng). **Cả nút MAX lẫn dòng preview cùng gọi hàm này** — hai chỗ tự tính riêng là lại lệch
số như vụ +83.333 / +66.667 bên dưới.

Cái **sai thật với người chơi** là ba chỗ **nói dối**, đã sửa:

| Chỗ | Trước | Sau |
|---|---|---|
| Dòng preview khi chọn MAX | *"ví bị trừ **thêm** 20% phí"* → ngụ ý cược trọn ví rồi phí cộng thêm | tính thẳng từ ví đang có: *"đổ trọn ví 100.000: cược 83.333 + phí 16.666. Không cược được trọn 100.000 vì phí 20% cộng THÊM"* |
| Tooltip đồng chip trên ô | chỉ số cược | *"Cược 83.333 + phí 16.666 = trừ ví 99.999"* |
| Lịch sử, dòng từng ô | `nhận − cược` = **+83.333**, trong khi dòng tổng bên phải ghi **+66.667** → hai số lệch trên cùng một dòng | cả hai cùng `nhận − cược` = **+83.334**, khớp nhau (xem §5d vì sao KHÔNG trừ phí) |

**Nếu muốn MAX = cược trọn 100.000** thì phải đổi mô hình phí (thu phí từ tiền THẮNG thay vì
cộng thêm lúc đặt) — đó là đổi kinh tế cả bàn, RTP phải giải lại (§2). **Chưa làm**, chờ chủ
server quyết. Bộ kiểm: `TaiXiu/kiemtra/trang-test.js` khối *"MAX bàn Siêu nói thật"*.

## 5d. "Đặt 1.200.000 thành 1.000.000, lúc ăn chỉ hiện 800.000" (22/09, cùng ngày)

Cùng gốc với §5c, lần này ở **số bay lúc nặn xong**. Ví 1.200.000 → MAX → cược 1.000.000 + phí
200.000. Thắng 1:1: máy chủ trả **về ví 2.000.000** (`traNguoi → congVi(e.win)`). Số bay là
`showNet(j.net)` = 2.000.000 − 1.000.000 − 200.000 = **+800.000 = lãi thật**. Đúng, nhưng đứng một
mình thì đọc thành *"chỉ nhận 800.000"*.

Chủ server chốt ngay sau đó: *"**chỉ trừ 20% lúc đầu thôi** chứ sao trừ thêm 20% sau cược nữa"*
(ảnh: cược XỈU 100.000, phí 20.000 đã trừ lúc đặt, thắng về ví 200.000, số dư 1.080.001 =
1.000.001 − 120.000 + 200.000 — **tiền đúng**, nhưng số bay in **+80.000** vì đem phí trừ thêm
lần nữa trên màn hình).

### Nguyên tắc hiển thị (chốt 22/09): PHÍ LÀ GIAO DỊCH RIÊNG, XONG LÚC ĐẶT

Mọi con số **sau** lúc đặt so với **TIỀN CƯỢC**, không trừ phí lần nữa:

| Chỗ | In gì |
|---|---|
| Lúc đặt | *"Đặt 100.000 + phí 20.000 = trừ 120.000"* — phí xuất hiện **một lần, ở đây** |
| Số bay khi nặn xong (`stShowKet`) | **+100.000** (= về ví − cược), **không chú thích** — chủ server: *"chỉ cần show tiền ăn thôi"*. Thua: **−100.000**. Dùng chung popup `showNet` của bàn thường |
| Lịch sử, dòng tổng | `nhận − cược` = **+100.000**; tooltip *"Về ví 200.000 · cược 100.000 · phí 20.000 đã trừ lúc đặt"* |
| Lịch sử, dòng từng ô | `nhận − cược` — **cùng cách tính** với dòng tổng, không lệch nhau |

⚠️ Bản vá đầu ngày (trừ phí vào dòng lịch sử) **đi sai hướng** và đã lật lại — nó làm hai chỗ
khớp nhau nhưng đều khớp ở con số khiến người chơi tưởng bị ăn 20% lần hai. **Không đổi một đồng.**

### Quyết định còn treo: mô hình phí

Hai báo cáo liên tiếp trong một ngày đều cùng một kiểu: **phí 20% ăn mất phần người chơi tưởng
là tiền thắng**. Với mô hình *phí cộng thêm lúc đặt*, cửa 1:1 mà "thắng" chỉ lãi **0,8× tiền
bỏ ra**. Đây là **thiết kế** (§1–§2), không phải lỗi. Ba đường, chủ server chọn:

| | Phí lúc đặt (hiện tại) | Phí trừ vào tiền THẮNG | Bỏ phí, hạ bảng trả |
|---|---|---|---|
| Bỏ 1.200.000 vào cửa 1:1, thắng | cược 1.000.000 · về ví 2.000.000 · **lãi +800.000** | cược 1.200.000 · thắng 1.200.000 − phí 240.000 · **lãi +960.000** | cược 1.200.000 · trả theo bảng mới |
| Thua | mất 1.200.000 | mất 1.200.000 | mất 1.200.000 |
| Nhà cái ăn ở đâu | phí mọi ván, thắng thua đều thu | chỉ khi người chơi thắng | chênh bảng trả |
| Việc phải làm | không | giải lại RTP (§2), đổi `tienTru/tinhTra`, hoàn cược, bộ kiểm | giải lại toàn bộ bảng |

**Chưa đổi.** Đổi là đổi túi tiền cả bàn — chủ server nói một câu, dựng bản đề xuất kèm số đo
200.000 ván trước khi đụng mã.

## 5b. Bảng kết quả trên Discord (22/09)

Bàn Siêu đặt cược **thuần web**, nên bảng Discord này chỉ để **khoe kết quả + rủ vào chơi**:
đếm ngược, ai đang đặt ván này, **10 ván gần đây**, nhắc phí 20%, một nút 🌐 lấy link + PIN.
**Không có nút đặt cược ⇒ không đụng tới tiền**, bảng hỏng cũng không mất đồng nào.

Admin đăng/gỡ ở panel SUPER tab ⚡ (`/api/stx/board/start|stop`, đều trong `VIEWONLY_PATHS`).
Dữ liệu lấy từ `bangDiscord(soVan)` — tách khỏi `adminXem()` (panel hỏi 3 giây/lần, không
cần lịch sử) và khỏi `trangThai()` (của riêng từng người chơi). Dòng kết quả dùng chung
`dongVanDiscord` với bàn thường, xem `../TaiXiu/README.md` §9b.

Bảng chỉ vẽ lại khi **dấu vết** (bật/tắt · ván · pha · số lượt · tổng cược) đổi, và
`repostBoard` còn chặn thêm 10 giây/lần — không đụng trần lệnh của Discord.

### Chạy CHUNG MỘT KÊNH với bảng Tài Xỉu thường

Được. Cả hai bảng chỉ **nhảy xuống cuối kênh khi có NGƯỜI nhắn đè**, chứ không nhảy vì
bảng kia vừa cập nhật:

- `repostBoard(..., idAnhEm)` — tin cuối kênh là bảng anh em thì vẫn coi như "chưa ai
  nhắn đè" ⇒ sửa tại chỗ.
- Vòng ván bàn thường cũng xét thêm `stxBoard.message.id` khi tính `txIsLast`.

Thiếu hai chỗ này thì mỗi ván hai bảng **thay nhau xoá–đăng lại**: kênh nhấp nháy và tốn
gấp đôi lệnh Discord.

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

## 6b. ✋ Ép HỆ SỐ NHÂN — TÀI · XỈU · CHẴN · LẺ + 🌪️ BÃO (22/09)

Bảng RIÊNG trong tab ⚡ Siêu Tài Xỉu. Admin ép thẳng hệ số nhân của bốn cửa `deu` —
chỗ người chơi đổ tiền nhiều nhất. 52 cửa còn lại vẫn để máy bốc.

| Nhập | Nghĩa |
|---|---|
| (để trống) | máy tự bốc như thường |
| **0** | TẮT — ô không sáng ván đó |
| **số** | ép đúng hệ số đó, trong khoảng riêng của ô |

**Khoảng ép = (gốc + 1) → bậc cao nhất của thang riêng ô đó** (22/09 mở thêm bão — chủ server:
*"can thiệp luôn hệ số nhân của 3 con giống nhau nữa"*):

| Ô | Gốc | Ép được |
|---|---|---|
| TÀI · XỈU · CHẴN · LẺ | 1:1 | **x2 → x14** |
| 🌪️ Bão bất kỳ | 30:1 | **x31 → x499** |
| 🌪️ Bão 1 … Bão 6 | 150:1 | **x151 → x1999** |

Dưới gốc là vô nghĩa (thắng còn ít hơn không nhân), trên thang là phá bài toán RTP. Máy bàn gửi
`cuaEp` (11 ô, mỗi ô kèm min/max/nhóm) — panel vẽ **hai hàng** (đều tiền / bão), trần và placeholder
từng ô lấy theo đó, **không tự bịa**. Nút nhanh riêng: *🌪️ Bão: tối đa* (mỗi ô đúng trần của nó) /
*🌪️ Bão: tắt hết*.

⚠️ **Ép được cả bậc thang KHÔNG có** (x7, x9, x11, x13). Thang chỉ quy định máy **bốc ngẫu
nhiên** ra số nào; admin ép là cố ý nên không bị bó theo bậc. Trần lấy theo hệ số cao nhất
của thang `deu` đang chạy → nâng thang thì trần tự nới, khỏi sửa hai chỗ.

⚠️ **DÙNG MỘT LẦN rồi tự xoá**, y khuôn ép kết quả (`_stxEpNhan` xoá ngay lúc áp).
Ép x14 cửa TÀI mà để thường trực là nhà cái đổ tiền mỗi ván.

**Khi nào ăn:** áp đúng lúc **khoá sổ**, tức hệ số hiện ra ngay ở **4 giây khoe hệ số nhân**.
Bấm lúc bàn còn nhận cược → ăn ván đang chạy. Bấm lúc đã khoá sổ → ván sau. Panel ghi rõ
bằng dòng 🟢 CÒN Ns / 🔒 ĐÃ KHOÁ SỔ, giống khối ép kết quả.

⚠️ **Phải áp NGAY khi sinh bảng nhân.** Cả ván tính tiền theo đúng bảng đó; áp muộn hơn là
người chơi thấy một đằng, trả tiền một nẻo.

Panel **không tự bịa** tên cửa hay khoảng hệ số — lấy từ `cuaDeu` / `epNhanKhoang`,
y cách khối trần cược đã chốt. Ô nhập chỉ vẽ lại khi danh sách đổi (`STX_NHAN_VE`),
không thì admin đang gõ bị mất chữ mỗi 3 giây.

Route: `/api/stx/epnhan` · `/api/stx/epnhanclear` — đều nằm trong `VIEWONLY_PATHS`.

## 7. Bộ kiểm

```
node SieuTaiXiu/kiemtra/cua-test.js   # lõi tiền: bảng trả, phí, RTP, trần (34 phép)
node SieuTaiXiu/kiemtra/ban-test.js   # máy bàn: đặt/xoá/3 nút/kéo thả/ép/báo cược/trọn ván/cứu tiền (74 phép)
node SieuTaiXiu/kiemtra/epnhan-test.js # ✋ ép hệ số nhân 4 cửa đều + 7 ô bão: chạy bàn thật, soi bảng nhân + tiền (70 phép)
# bảng Discord + dòng kết quả gọn: TaiXiu/kiemtra/trang-test.js soi (khối "bảng Discord bàn Siêu")
```

Cả hai **không cần bot**. `ban-test` ép mốc giờ nên chạy trọn một ván trong tích tắc.

⚠️ Vòng ván xét **chốt trước, quay sau**. Muốn ép tới mốc quay thì `targetTime` phải còn
ở phía trước ít nhất 1 giây — đặt bằng `now` là rơi thẳng vào nhánh chốt, ván chưa kịp
quay. Bộ kiểm từng dính đúng bẫy này.
