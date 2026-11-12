# ScreenGap — Xem YouTube Giữ Khoảng Cách An Toàn Cho Mắt Bé (iPad PWA)

**ScreenGap** là ứng dụng Web/PWA thiết kế riêng cho **mọi dòng iPad** (không cần Face ID hay tài khoản Apple Developer), giúp theo dõi khoảng cách từ khuôn mặt của bé đến màn hình theo thời gian thực và **tự động Pause / Play video YouTube**.

## Tính năng chính

- **Đo khoảng cách bằng AI ngay trên thiết bị (MediaPipe Face Landmarker):**
  - Chạy 100% cục bộ bằng WebAssembly/WebGL trên Safari (không gửi bất kỳ hình ảnh camera nào ra khỏi iPad).
  - Kết hợp khoảng cách liên đồng tử (IPD) có bù góc nghiêng đầu 3D và đường kính mống mắt để ước lượng khoảng cách (cm) mượt mà.
  - Tối ưu tần số quét (~12 FPS) giúp iPad mát và tiết kiệm pin khi xem lâu.
- **Tự động Pause & Play tức thì:**
  - Khi mặt bé gần hơn ngưỡng (mặc định `< 35 cm` liên tục sau `1.2 giây`), video YouTube tự động **Pause**, phủ màn chắn nhắc nhở kèm thanh đo trực quan + chuông báo + giọng đọc Tiếng Việt (*"Ôi gần quá rồi! Con ngồi lùi ra xa..."*).
  - Khi bé ngồi lùi ra khoảng cách an toàn (`≥ 38 cm`), màn chắn tự tắt và video **tự động Play tiếp** mà không cần chạm tay.
- **Chống lách luật & Khóa Phụ huynh:**
  - Tùy chọn **Tạm dừng khi che Camera / Không thấy mặt** sau 3.5 giây.
  - Phần **Cài đặt Phụ huynh** có khóa phép tính nhân để bé nhỏ không tự ý chỉnh ngưỡng hay tắt bảo vệ.
  - Có nút **Chuẩn hóa 40 cm** 1 chạm để khớp chính xác tuyệt đối với từng đời camera trước của iPad (kể cả camera góc siêu rộng Center Stage).
  - Thống kê trong ngày: tổng thời gian xem, số lần ngồi quá gần, khoảng cách ngồi trung bình.

## Chạy thử trên máy tính

```bash
python3 -m http.server 8080
```
Sau đó mở `http://localhost:8080` (có sẵn nút **Thử giả lập** bằng thanh trượt nếu máy tính không có webcam).

## Cài đặt lên iPad cho bé (Miễn phí qua GitHub Pages HTTPS)

> **Lưu ý quan trọng:** Safari trên iPad yêu cầu trang web chạy qua **HTTPS** mới cho phép bật Camera.

1. Push mã nguồn lên nhánh `main` của GitHub repo `mrhocuong/screengap`.
2. Trên GitHub, vào **Settings → Pages → Build and deployment → Source**, chọn **GitHub Actions**.
3. Mở đường dẫn `https://mrhocuong.github.io/screengap/` bằng **Safari** trên iPad.
4. Nhấn nút **Chia sẻ (Share ↑)** → **Thêm vào Màn hình chính (Add to Home Screen)** để cài thành ứng dụng toàn màn hình.
5. *(Khuyên dùng)* Vào **Cài đặt iPad → Trợ năng → Truy cập được hướng dẫn (Guided Access)**, bật lên và đặt mật khẩu. Khi cho bé xem trên **ScreenGap**, bấm **3 lần nút Nguồn** để khóa bé cố định trong ứng dụng (bé không thể thoát ra mở app YouTube gốc).
