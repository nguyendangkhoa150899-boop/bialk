# Cách bật WISHLIST đồng bộ (Firebase) — ~10 phút, miễn phí

Wishlist cần một "kho chứa chung trên mạng" để cả Khoa và Hạnh cùng thêm/tick và đều thấy.
Dùng **Firebase Firestore** (của Google, miễn phí cho mức xài này). Làm 1 lần, xong là chạy mãi.

---

## Bước 1 — Tạo dự án Firebase
1. Vào **https://console.firebase.google.com** → đăng nhập bằng Google.
2. Bấm **Add project / Thêm dự án**.
3. Đặt tên bất kỳ (vd `chuyen-tinh-minh`) → **Continue**.
4. Tới bước Google Analytics: **tắt** đi cho nhanh (gạt off) → **Create project** → đợi xíu → **Continue**.

## Bước 2 — Tạo Firestore Database
1. Menu trái: **Databases & Storage → Firestore Database**.
   (Giao diện cũ ghi là "Build → Firestore Database".)
2. Bấm **Create database**. Nếu hỏi tên/edition: để **mặc định** (Standard).
3. Chọn **location**: `asia-southeast1 (Singapore)` (gần VN nhất) → **Next**.
4. Chọn **Start in test mode** → **Create / Enable**.
   (Bước phân quyền an toàn hơn ở Bước 5.)

## Bước 3 — Lấy config (firebaseConfig)
1. Bấm **bánh răng ⚙ (góc trên trái) → Project settings**.
2. Kéo xuống mục **Your apps** → bấm icon **web `</>`**.
3. Đặt nickname bất kỳ → **Register app** (KHÔNG cần Hosting).
4. Nó hiện đoạn `const firebaseConfig = { ... }`. **Copy các giá trị** trong đó.

## Bước 4 — Dán vào noi-dung.js
Mở **noi-dung.js**, tìm phần `const WISHLIST_FB = { ... }` (gần cuối file), điền vào:

```js
const WISHLIST_FB = {
  apiKey: "AIza.......",
  authDomain: "chuyen-tinh-minh.firebaseapp.com",
  projectId: "chuyen-tinh-minh",
  storageBucket: "chuyen-tinh-minh.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abcdef..."
};
```
Lưu file → mở web → **Ctrl+F5**. Wishlist sẽ chạy.

## Bước 5 — (Nên làm) Đặt luật phân quyền
Mặc định "test mode" sẽ **hết hạn sau 30 ngày**. Để chạy lâu dài:
1. Firestore Database → tab **Rules**.
2. Xoá hết, dán đoạn này vào rồi bấm **Publish**:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /wishlist/{doc} {
      allow read, write: if true;
    }
  }
}
```

---

## ⚠ Nói thật về bảo mật
Luật trên cho **bất kỳ ai có link web** đều đọc/thêm/xoá được wishlist. Với danh sách điều ước thì rủi ro thấp (cùng lắm bị ai đó nghịch). Nếu sau này muốn **chỉ 2 đứa mới sửa được** (cần đăng nhập/mật khẩu), báo mình ráp thêm — phức tạp hơn chút.

## Nếu wishlist báo lỗi
- "Không tải được Firebase (cần có mạng)": đang mở offline → cần internet.
- "Lỗi kết nối / permission-denied": kiểm tra lại Rules (Bước 5) đã Publish chưa, và config (Bước 4) dán đúng chưa.
- Vẫn hiện ô hướng dẫn: nghĩa là `WISHLIST_FB` còn trống — điền config vào là xong.
