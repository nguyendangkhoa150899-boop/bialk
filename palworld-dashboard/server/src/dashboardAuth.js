// Tắt xác thực bằng cách để DASHBOARD_PASSWORD trống (hoặc bỏ hẳn biến đó).
//
// Chỉ nên tắt khi dashboard nghe 127.0.0.1 (mặc định) — lúc đó chỉ tiến trình trên
// cùng máy gọi được, ví dụ bot Discord. Nếu đổi HOST thành 0.0.0.0 mà không có mật
// khẩu thì bất kỳ ai trên internet cũng tặng được item vô hạn.
export function dashboardAuth(req, res, next) {
  const expected = process.env.DASHBOARD_PASSWORD;

  if (!expected) return next();

  const header = req.headers.authorization || "";
  const [, encoded] = header.split(" ");
  const decoded = encoded ? Buffer.from(encoded, "base64").toString() : "";
  const [, password] = decoded.split(":");

  if (password === expected) {
    return next();
  }

  res.set("WWW-Authenticate", 'Basic realm="Palworld Dashboard"');
  res.status(401).send("Authentication required");
}
