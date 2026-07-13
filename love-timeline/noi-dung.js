/* =============================================================
   👉 ĐÂY LÀ FILE DUY NHẤT BẠN CẦN SỬA 👈

   Cách dùng:
   1. Sửa tên, ngày ở phần THONG_TIN bên dưới.
   2. Bỏ file vào thư mục Lib/ (Sticker · HinhAnh · Video) rồi ghi đường dẫn vào từng mốc.
   3. Mỗi mốc là một khối { ... }. Chép thêm khối để có thêm mốc.
   4. Lưu file, mở lại index.html (F5) là thấy thay đổi.

   Lưu ý: giữ nguyên dấu phẩy, ngoặc. Chữ để trong "dấu nháy".
   ============================================================= */

const THONG_TIN = {
  ten1: "Khoa",
  ten2: "Hạnh",

  // Ảnh mặt kiểu sticker ở trang bìa. Để trống "" thì hiện ô trống chờ thêm ảnh.
  anh1: "",   // ảnh mặt Khoa, vd "Lib/HinhAnh/mat-khoa.jpg"
  anh2: "",   // ảnh mặt Hạnh, vd "Lib/HinhAnh/mat-hanh.jpg"

  // ⚠️ Ngày bắt đầu đếm "số ngày bên nhau" -> dùng ngày hẹn hò chính thức
  ngayQuen: "2023-07-15",

  // Sinh nhật hai đứa (NĂM-THÁNG-NGÀY). Để trống "" nếu không muốn hiện.
  sinhNhat1: "1999-08-15",   // Khoa
  sinhNhat2: "2002-07-01",   // Hạnh

  loiKet: "Giữa rất nhiều lựa chọn của cuộc đời, mình vẫn chọn quay về với nhau. Đi tiếp nha, Hạnh 💍"
};

/* Mỗi mốc:
   ngay    : ngày hiển thị (gõ sao cũng được)
   chuong  : tên chương (mốc cùng chương sẽ gom lại dưới 1 badge)
   tieuDe  : tiêu đề mốc
   ke      : kể chuyện
   noi     : (tuỳ chọn) địa điểm / thời gian ở  -> hiện dưới dạng thẻ "📍 ..."
   anh     : danh sách ảnh/video (để [] nếu chưa có). Bấm vào -> mở to toàn màn hình, lướt qua từng cái.
             • Ảnh thường:        "Lib/HinhAnh/01.jpg"
             • Video:             "Lib/Video/01.mp4"
             • Kèm note nhỏ:      { src: "Lib/HinhAnh/01.jpg", ghi: "chú thích tấm này" }
             • Chọn màu băng keo:  { src: "Lib/HinhAnh/01.jpg", keo: "hong" }
                                   (màu: "vang" "hong" "mint" "tim" "xanh", không ghi thì tự đổi màu)
             • Nhiều cái:         ["Lib/HinhAnh/a.jpg", { src: "Lib/HinhAnh/b.jpg", ghi: "..." }, "Lib/Video/c.mp4"]
   kieu    : "polaroid" (mặc định) hoặc "chat"
*/
const TIMELINE = [

  /* ========== CHƯƠNG 1: LÚC QUEN ========== */
  {
    ngay: "28 · 06 · 2023",
    chuong: "Lúc quen",
    tieuDe: "Gặp nhau ở sân bay Tân Sơn Nhất",
    ke: "Hạnh theo ba về Việt Nam chơi, cần tìm một homestay. Một người bạn thân kết nối Hạnh với Khoa qua Facebook. Cuộc gặp đầu tiên diễn ra ngay giữa sân bay Tân Sơn Nhất, rất bình thường, rất tình cờ. Không ai nghĩ đó lại là điểm bắt đầu của một hành trình dài.",
    noi: "Sân bay Tân Sơn Nhất",
    anh: [],
    kieu: "polaroid"
  },
  {
    ngay: "Ngày đầu",
    chuong: "Lúc quen",
    tieuDe: "Ấn tượng đầu tiên",
    ke: "Khoa nhớ mãi hình ảnh Hạnh ôm theo một chú heo gấu bông. Còn Hạnh ấn tượng Khoa là một anh chàng cao ráo và… hơi “ẹo” một chút. Ấn tượng ban đầu có thể chỉ thoáng qua, nhưng điều giữ hai đứa ở lại là cách tụi mình quan tâm yêu thương với nhau sau đó.",
    anh: [],   // gợi ý: ảnh chú heo gấu bông / ảnh Hạnh
    kieu: "polaroid"
  },
  {
    ngay: "Vũng Tàu",
    chuong: "Lúc quen",
    tieuDe: "Lời tỏ tình ở Vũng Tàu",
    ke: "Ở Vũng Tàu, Khoa nói ra lời tỏ tình. Nơi này về sau sẽ còn quay lại trong câu chuyện của tụi mình, theo một cách chẳng ai ngờ.",
    noi: "Vũng Tàu",
    anh: [],   // gợi ý: ảnh ở Vũng Tàu lần đầu
    kieu: "polaroid"
  },
  {
    ngay: "15 · 07 · 2023",
    chuong: "Lúc quen",
    tieuDe: "Chính thức hẹn hò 💛",
    ke: "Từ hôm nay, tụi mình bắt đầu đếm ngày bên nhau. Không còn là hai người xa lạ tình cờ gặp ở sân bay nữa.",
    anh: [],
    kieu: "polaroid"
  },

  /* ========== CHƯƠNG 2: BỐN LẦN EM VỀ ========== */
  /* Yêu xa: Hạnh ở Mỹ, mỗi lần về Việt Nam là một lần ở bên nhau thật lâu. */
  {
    ngay: "Lần 1",
    chuong: "Bốn lần em về",
    tieuDe: "mVillage Võ Thị Sáu",
    ke: "Lần đầu em về ở lại. Còn lạ nước lạ cái, còn giữ ý với nhau, nhưng cũng là những ngày đầu tiên hai đứa được ở gần nhau mỗi ngày.",
    noi: "mVillage Võ Thị Sáu · ở 3 tuần",
    anh: [],
    kieu: "polaroid"
  },
  {
    ngay: "Lần 2",
    chuong: "Bốn lần em về",
    tieuDe: "Airbnb Nam Kỳ Khởi Nghĩa",
    ke: "Lần này em ở lâu hơn nhiều. Đủ để hai đứa quen dần nhịp sống của nhau, quen cả những điều nhỏ nhặt mà chỉ ở gần mới thấy.",
    noi: "Airbnb Nam Kỳ Khởi Nghĩa · ở 3 tháng",
    anh: [],
    kieu: "polaroid"
  },
  {
    ngay: "Lần 3",
    chuong: "Bốn lần em về",
    tieuDe: "Khách sạn Ngọc Dung",
    ke: "Thuê qua Airbnb ở khách sạn Ngọc Dung. Mỗi lần về là một lần thương nhau thêm một chút, và mỗi lần tiễn nhau ra sân bay lại một lần khó hơn lần trước.",
    noi: "Khách sạn Ngọc Dung · ở 3 tháng",
    anh: [],
    kieu: "polaroid"
  },
  {
    ngay: "Lần 4",
    chuong: "Bốn lần em về",
    tieuDe: "Về nhà mình ở Sài Gòn",
    ke: "Lần này em không ở homestay nữa, em về nhà anh. Hơn bốn tháng bên nhau, cũng là quãng thời gian tụi mình lo cưới xin: chụp hình, chuẩn bị lễ, đón ngày về chung một nhà.",
    noi: "Nhà mình · Sài Gòn · ở hơn 4 tháng",
    anh: [],
    kieu: "polaroid"
  },

  /* ========== CHƯƠNG 3: CÙNG NHAU ĐI ========== */
  /* Mỗi chuyến 1 mốc riêng để có album ảnh riêng. Sửa lời kể cho từng nơi nha. */
  {
    ngay: "Đà Lạt",
    chuong: "Cùng nhau đi",
    tieuDe: "Đà Lạt",
    ke: "👉 Kể kỷ niệm chuyến Đà Lạt của tụi mình ở đây.",
    noi: "Đà Lạt",
    anh: [],
    kieu: "polaroid"
  },
  {
    ngay: "Singapore",
    chuong: "Cùng nhau đi",
    tieuDe: "Singapore",
    ke: "👉 Kể kỷ niệm chuyến Singapore.",
    noi: "Singapore",
    anh: [],
    kieu: "polaroid"
  },
  {
    ngay: "Hàn Quốc",
    chuong: "Cùng nhau đi",
    tieuDe: "Hàn Quốc (Jeju)",
    ke: "👉 Kể kỷ niệm chuyến Hàn Quốc (Jeju).",
    noi: "Hàn Quốc (Jeju)",
    anh: [],
    kieu: "polaroid"
  },
  {
    ngay: "Nha Trang",
    chuong: "Cùng nhau đi",
    tieuDe: "Nha Trang",
    ke: "👉 Kể kỷ niệm chuyến Nha Trang.",
    noi: "Nha Trang",
    anh: [],
    kieu: "polaroid"
  },
  {
    ngay: "Hà Nội",
    chuong: "Cùng nhau đi",
    tieuDe: "Hà Nội",
    ke: "👉 Kể kỷ niệm chuyến Hà Nội.",
    noi: "Hà Nội",
    anh: [],
    kieu: "polaroid"
  },
  {
    ngay: "Hạ Long",
    chuong: "Cùng nhau đi",
    tieuDe: "Hạ Long",
    ke: "👉 Kể kỷ niệm chuyến Hạ Long.",
    noi: "Hạ Long",
    anh: [],
    kieu: "polaroid"
  },

  /* ========== CHƯƠNG 4: CẦU HÔN ========== */
  {
    ngay: "14 · 02 · 2026",
    chuong: "Cầu hôn",
    tieuDe: "Điều hạnh phúc nhất đời anh là được cưới em 💍",
    ke: "Đúng ngày Valentine, tại Vũng Tàu, nơi anh tỏ tình ngày trước, anh chọn quỳ xuống cầu hôn. Anh nhận ra mình muốn cưới Hạnh khi hiểu rằng dù có chuyện gì xảy ra, người anh muốn quay về đầu tiên vẫn là cô ấy. Khép lại một hành trình yêu, để mở ra một hành trình mới mang tên gia đình.",
    noi: "Vũng Tàu",
    anh: [],   // gợi ý: ảnh khoảnh khắc cầu hôn / chiếc nhẫn
    kieu: "polaroid"
  },

  /* ========== CHƯƠNG 5: VỀ CHUNG MỘT NHÀ ========== */
  {
    ngay: "01 · 03 · 2026",
    chuong: "Về chung một nhà",
    tieuDe: "Ngày cưới",
    ke: "👉 .",
    anh: [],
    kieu: "polaroid"
  },
  {
    ngay: "17 · 04 · 2026",
    chuong: "Về chung một nhà",
    tieuDe: "Lễ cưới trong nhà thờ ⛪",
    ke: "👉 ",
    anh: [],
    kieu: "polaroid"
  }
];

/* =============================================================
   LUẬT CỦA TỤI MÌNH - hiện ở khối nổi bật riêng (không nằm trong timeline)
   Mỗi luật là một khối { icon, tieuDe, ke }. Chép thêm để có thêm luật.
   ============================================================= */
const QUY_TAC = [
  {
    icon: "⏰",
    tieuDe: "Không im lặng quá 24 tiếng",
    ke: "Có giận cũng phải nói, có buồn cũng phải chia sẻ, không để khoảng cách lớn dần trong im lặng."
  },
  {
    icon: "🤍",
    tieuDe: "Ai sai cũng làm lành trước",
    ke: "Mỗi lần cãi vã, Khoa luôn là người giải thích nhỏ nhẹ và làm lành trước."
  },
  {
    icon: "🧋",
    tieuDe: "Nhớ nhau bằng hành động nhỏ",
    ke: "Hạnh ở Mỹ đặt đồ ăn, đặt thuốc cho Khoa khi anh mệt. Khoa ở Việt Nam đặt trà sữa cho Hạnh khi cô buồn."
  },
  {
    icon: "⚖️",
    tieuDe: "Khác nhau mà dung hòa",
    ke: "Hạnh hay suy nghĩ nhiều, Khoa sống đơn giản. Một người bớt lo xa, một người học cách nhìn sâu hơn. Khoa bớt nóng tính, Hạnh không còn phải mạnh mẽ một mình."
  }
];

/* =============================================================
   CHOPPER 🐩 - bé cưng của tụi mình (mục album + video riêng)
   Ảnh bỏ vào Lib/HinhAnh/ , video bỏ vào Lib/Video/ , sticker vào Lib/Sticker/
   Video dùng đuôi .mp4 là chắc chạy nhất (kể cả trên iPhone).
   ============================================================= */
const CHOPPER = {
  ten: "Chopper",
  giong: "Poodle tiny",
  // Ảnh Chopper đã tách nền (PNG trong suốt) -> hiện thành sticker die-cut, thay icon 🐩.
  // Cách tạo: iPhone nhấn giữ con chó trong app Ảnh -> Lưu ảnh; hoặc web remove.bg.
  sticker: "",
  ke: "Chopper và hành trình đáng nhớ với gia đình Chopper.",
  anh: []
};

/* =============================================================
   NHỮNG KỶ NIỆM ĐÁNG NHỚ
   👉 Phần này GIỜ QUẢN LÝ BẰNG DASHBOARD (/admin), đừng sửa ở đây nữa.
   KY_NIEM để trống chỉ để làm bản dự phòng khi mở offline không có server.
   ============================================================= */
const KY_NIEM = [];

/* =============================================================
   SỞ THÍCH / VỀ HAI ĐỨA - điền thêm cho vui nha
   Sửa danh sách "thich" của mỗi người. Thêm/bớt tuỳ ý.
   ============================================================= */
const SO_THICH = {
  nguoi1: {
    ten: "Khoa",
    emoji: "👦",
    sticker: "",   // (giờ up sticker ở Dashboard) vd "Lib/Sticker/mat-khoa.png" -> thay emoji. Để "" thì dùng emoji.
    thich: [
      "Game Game suốt ngày Game",
      "..."
    ]
  },
  nguoi2: {
    ten: "Hạnh",
    emoji: "👧",
    sticker: "",   // (giờ up sticker ở Dashboard) vd "Lib/Sticker/mat-hanh.png"
    thich: [
      "La Khoa",
      "..."
    ]
  }
};

/* =============================================================
   WISHLIST CỦA TỤI MÌNH - cả 2 cùng thêm, đồng bộ real-time (Firebase)
   👉 CÁCH LẤY CONFIG: mở file  WISHLIST-HUONG-DAN.md  làm theo (~10 phút, miễn phí).
   Chưa điền thì phần Wishlist trên web sẽ hiện hướng dẫn thay vì danh sách.
   Dán nguyên cụm firebaseConfig của Firebase vào đây:
   ============================================================= */
const WISHLIST_FB = {
  apiKey: "AIzaSyCHANTLMKPJX1mZqq33Uf0WHNtY1bnu7PE",
  authDomain: "wishlist-8ea54.firebaseapp.com",
  projectId: "wishlist-8ea54",
  storageBucket: "wishlist-8ea54.firebasestorage.app",
  messagingSenderId: "1068894046484",
  appId: "1:1068894046484:web:a2e8177dac15ad95589a01"
};
