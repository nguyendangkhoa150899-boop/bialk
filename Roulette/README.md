# 🎡 Roulette, bàn thứ ba của BotDoMin (thuần web, ăn Dogcoin thật)

Trạng thái hiện tại. Sửa gì ở `cua.js` / `ban.js` thì sửa đúng mục ở đây, không viết nhật ký ngày.

## Luật chơi (dựng theo ảnh "Cách chơi" chủ server gửi)

Bàn châu Âu một số 0, 37 ô, thứ tự trên vòng quay là mảng `VONG` trong `cua.js` (web vẽ vòng theo đúng mảng này, đừng gõ tay lần hai).

| Kiểu cược | Cửa | Phủ | Trả | Chip đặt ở đâu |
|---|---|---|---|---|
| Trực tiếp `s0..s36` | 37 | 1 số | **29:1** (đã cắt, xem dưới) | trong ô số |
| Tác `t<a>_<b>` | 60 | 2 số kề nhau (24 ngang + 33 dọc + 3 của số 0) | 17:1 | vạch giữa 2 ô |
| Dãy `d<đầu>` | 12 | 3 số một hàng | 11:1 | cuối hàng |
| Góc `g<trên-trái>` | 22 | 4 số | 8:1 | giao điểm 4 ô |
| Hàng `h<đầu>` | 11 | 6 số, 2 hàng liền | 5:1 | cuối vạch giữa 2 hàng |
| Cột `cot1..3` · Tá `ta1..3` | 6 | 12 số | 2:1 | ô riêng |
| Đỏ/Đen · Chẵn/Lẻ · 1-18/19-36 | 6 | 18 số | 1:1 | ô riêng |

Tổng **154 cửa**. Ra **0** thì mọi cửa vòng ngoài, Dãy, Góc, Hàng thua sạch; chỉ `s0` và 3 cửa Tác của số 0 ăn.

## Hệ số nhân ("số sét") chỉ rơi vào SỐ ĐƠN

Chủ server chốt 25/09: *"chip đặt được ở ngã 4 chứ không phải nhân ở ngã 4"*. Huy hiệu nhân phải nằm gọn trong một ô số; treo ở giao điểm thì không ai biết nó thuộc ô nào. Đúng luật game thật.

Tiền nuôi hệ số nhân lấy từ chính cửa số đơn: trả **29:1** thay vì 35:1 (RTP gốc tụt từ 97,30% còn 81,08%), phần **16,22 điểm** thiếu do hệ số nhân bù. Số ô sét trung bình mỗi ván do thang quyết định: **T = 37·6 / (E_thang − 29)**. Thang mặc định 7 bậc `so: 50×100, 75×50, 100×28, 150×12, 200×6, 300×3, 500×1` (E ≈ 79,8) cho **≈4,4 số sét mỗi ván**, sát Lightning Roulette thật (1-5 số, x50-x500). Người đặt một số trúng sét khoảng 0,33% ván (game thật 0,25%; bản 2-11 ô x30-x500 thử ngày 25/09 là 0,46%, bị chê "nhân nhiều sợ mặc định trúng"). Hạ thang là nhiều ô sáng hơn nhưng mỗi ô nhỏ hơn; tổng tiền trả cho sét không đổi.

### Số ô sét mỗi ván: bảng tỉ lệ, luôn trong khoảng (chủ server 25/09: "không rải đều, ít ô hay gặp, nhiều ô hiếm")

Không bốc từng ô độc lập nữa (kiểu đó hay ra 0 hoặc 1 ô). Máy bốc **SỐ Ô K** từ bảng `SET_HIEN` `[[số ô, độ hiếm], ...]`, mặc định `2×30, 3×26, 4×20, 5×13, 6×7, 7×4` (2 ô hay gặp nhất, 7 ô hiếm nhất), rồi chọn K ô số khác nhau đều nhau, mỗi ô một hệ số từ thang. Để tiền đúng, máy **nghiêng** bảng bằng một hệ số duy nhất `w_k · x^k` (giải bằng chia đôi) sao cho E[K] = T; xác suất một ô sáng khi đó = T/37 = đúng `qHieu`. Hình dạng bảng admin đặt được giữ, chỉ nghiêng nhẹ; `thongKe().phanPhoiSet` in xác suất THẬT từng K, panel hiện dòng đó. Bảng phải **bao được T** (số ô nhỏ nhất ≤ T ≤ số ô lớn nhất), không thì `datThang` / `datKhoangSet` từ chối và nói rõ phải hạ/nâng thang hay bảng. Admin đổi ở panel (`/api/rl/set`), lưu `_rlSet`.

Mọi cửa khác trả chuẩn nên RTP gốc đều đúng **36/37 = 97,2973%**, không cần nhân.

## Nhà cái ăn: MỘT mức phí duy nhất, suy ra chứ không gõ tay

Roulette chuẩn chỉ để nhà cái ăn 2,7027%. Muốn ăn 8% mà không phá bảng trả quen thuộc thì thu phí trên tiền cược:

```
phí = (36/37) / (1 − nhà_cái_ăn) − 1
```

Ăn 8% thì phí **5,7579%**: đặt 10.000 trừ ví 10.575. Vì mọi cửa cùng RTP gốc 36/37 nên một mức phí là đủ, **kiểu cược nào cũng ra đúng 8%** (bộ kiểm đo từng nhóm trên 1 triệu ván).

- **Sàn 3%**: dưới 2,7027% phí thành ÂM, đặt 10.000 chỉ trừ 9.928, bàn tự phát tiền. Đã suýt dính, có phép kiểm chặn.
- **Trần 20%**: lúc đó phí đã 21,6%.

## Trần cược

Chỉ số đơn mới ăn đậm được (nhờ x500) nên trần nó thấp nhất. Nhóm khác trả chuẩn, trần đặt sao cho thắng đậm nhất một ô quanh 300.000, đúng nết roulette thật (cược trong hạn mức thấp, cược ngoài hạn mức cao).

| Nhóm | Trần mặc định | Thắng đậm nhất một ô |
|---|---|---|
| so | 5.000 | 2.500.000 (×500) |
| tac | 20.000 | 340.000 |
| day | 30.000 | 330.000 |
| goc | 40.000 | 320.000 |
| hang | 60.000 | 300.000 |
| ta (tá + cột) | 150.000 | 300.000 |
| deu | 300.000 | 300.000 |

Trần mỗi người mỗi ván mặc định 300.000 (0 = bỏ). Sàn mỗi ô 1.000.

## Nhịp ván (`ban.js`)

`bet 15s` bi đứng yên, nhận cược → `quay 5s` bi được hút lên vành ngoài và chạy, **vẫn nhận cược** (cờ `biChay`) → `roi 14s` **khoá sổ**: kết quả và số sét **chốt ngay lúc khoá** (web cần ô đích để vẽ bi rơi đúng), +2s (`NHAN_TRE_S`) web mới hiện nhân, bi giảm tốc dần rồi rơi ở giây thứ 11, 3s cuối (`KQ_S`) khoe kết quả, hết 14s trả tiền và mở ván mới. (Mặc định `roi` từng là 10, chủ server nâng lên 14 ngày 25/09 vì bi quay ngắn quá.) Đổi nhịp ở panel, `bet 5-600 · quay 0-60 · roi 6-60`.

## Luật tiền không được mất (chép từ bàn Siêu)

- Cược là tiền đã trừ ví. Xoá sổ cược phải qua `donSoCuoc()`: đã chốt thì trả nốt theo bảng, chưa chốt thì hoàn cược kèm phí.
- Không dựng lại bảng trả tiền khi không thấy bảng cũ. Cờ `paid` ghi đĩa ngay.
- Bật lại giữa ván: hoàn theo `_rlBets` nhưng bỏ qua ai đã có trong `_rlPlan`.
- **Hoàn tiền dùng `b.phi` đã ghi trên phiếu, không tính lại.** Phí suy từ mức ăn; admin đổi mức giữa ván mà tính lại thì hoàn sai (có phép kiểm).

## DB

`_rlOn _rlTime _rlTran _rlMaxBet _rlAn _rlThang _rlSet _rlGameId _rlBets _rlPlan _rlHist _rlHistCuoc _rlEp _rlEpNhan`. `_rlHistCuoc` là sổ riêng ván có cược, ván trống không đẩy đi được (bài học log Siêu trắng).

## Đường gọi

Web `/api/rl/state|bet|x2|datlai|xoacuoc|xoacua|doicua`. Panel (chỉ SUPER) `/api/rl/on|time|tran|an|thang|set|maxbet|ep|epclear|epnhan|epnhanclear`. Ép kết quả 0-36, ép số sét chỉ nhận mã `s<n>` với hệ số 30..bậc cao nhất thang (0 = tắt ô), dùng một lần rồi tự xoá. `timEpReNhat()` duyệt 37 số bằng lõi tiền.

## Bộ kiểm

```
node Roulette/kiemtra/cua-test.js    # 103 phép: 154 cửa, RTP, phí, nhân chỉ số đơn, bảng số ô sét 2..11, mô phỏng 1 triệu ván
node Roulette/kiemtra/ban-test.js    # 76 phép: đặt/xoá/dời, khoá sổ, trả tiền, ép, bật lại, tắt bàn
```
`kiemtra/rnd.js` là mulberry32 cho bộ kiểm. Bản đầu dùng LCG kiểu C bị tràn 2^53 nên mô phỏng báo sai 3 điểm phần trăm; lõi không sai, cái thước cong.

## Cạm bẫy đã dính khi dựng (25/09)

1. Cho mọi cửa có nhân với phí cố định 20%: huy hiệu nhân của Góc không biết vẽ vào đâu, còn bỏ nhân của Góc thì riêng ô đó ăn 18,92%. Bỏ cả mô hình, làm theo game thật.
2. Mức ăn 2% cho phí âm. Sàn giờ 3%.
3. Bộ kiểm cộng dồn 0,0005 bị trôi số thực vượt trần, báo hỏng oan. Đếm bằng số nguyên rồi chia.
4. Góc đặt tên theo số trên-trái: `g29` có thật (29-30-32-33), `g30` không (cột 3 không có góc bên phải).

## Chưa có

Bảng kết quả trên Discord (Siêu có, Roulette chưa). Cược "trio" 0-1-2 / 0-2-3 và "first four" 0-1-2-3.
