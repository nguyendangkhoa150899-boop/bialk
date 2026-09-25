# Bộ bài 52 lá, nguồn và cách tạo

**Mặt bài (52 lá):** bộ *vector-playing-cards* của Byron Knoll, **public domain**, không ràng
buộc giấy phép, dùng thoải mái trong repo công khai.
Tải qua bản mirror `hayeah/playing-cards-assets` (thư mục `png/`), ảnh gốc **222×323**.

**Lưng bài (`back.webp`):** tự vẽ, không lấy từ bộ trên. Lưng gốc của bộ đó là hoa văn
**trắng nhạt**, đặt lên nỉ xanh bị chìm. Bản đang dùng là hoa văn quả trám đỏ, viền trắng,
vẽ bằng SVG rồi xuất ảnh.

## Cách tạo lại

Xuất WebP rộng **136px** (gấp đôi cỡ hiển thị 68px cho màn hình nét), chất lượng 88:

    sharp(goc).resize({width:136}).webp({quality:88})

Tổng cả 53 lá: **588 KB**. Cỡ khác nếu cần: 92px → 275 KB · 204px → 781 KB.

## Giới hạn phải nhớ

Ảnh gốc chỉ rộng 222px nên **chỉ thu nhỏ được, không phóng to** (phóng lên là mờ).
Cỡ hiển thị an toàn tối đa **~110px**. Bàn poker dùng 44–68px nên thoải mái.

## Cách gọi tên file

`<số><chất>.webp`, số là `A K Q J 10 9 8 7 6 5 4 3 2`, chất là `s` bích · `h` cơ ·
`d` rô · `c` chuồn. Ví dụ `As.webp`, `10h.webp`, `Qd.webp`. Lưng bài là `back.webp`.
