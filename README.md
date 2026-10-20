# AI Reup Studio

Công cụ biên tập video chạy hoàn toàn trên trình duyệt (HTML/CSS/JS ES Modules), triển khai được trên GitHub Pages. Dùng với nội dung bạn sở hữu hoặc được cấp phép sử dụng.

**Trạng thái: Giai đoạn 2/6 hoàn thành (Subtitle Extractor).** Các module khác hiển thị rõ "Chưa triển khai".

## Chạy thử cục bộ
ES Modules không chạy qua `file://`. Trong thư mục dự án:

    python3 -m http.server 8000

rồi mở http://localhost:8000.

## Triển khai GitHub Pages
1. Tạo repository mới, tải toàn bộ nội dung thư mục này lên nhánh `main`.
2. Settings → Pages → Source: *Deploy from a branch* → `main` / `(root)` → Save.
3. Mở `https://<tên-người-dùng>.github.io/<tên-repo>/`. Mọi đường dẫn trong dự án là tương đối nên chạy được dưới đường dẫn repo.

## Phân loại chức năng
| Chức năng | Nhóm | Trạng thái |
|---|---|---|
| Dự án, lưu IndexedDB, xuất/nhập JSON | LOCAL | Đã làm, đã kiểm thử |
| Import video/audio/ảnh/SRT/VTT/TXT, URL | LOCAL | Đã làm, đã kiểm thử một phần |
| Xem trước từng tệp media | LOCAL | Đã làm |
| OCR (Tesseract.js, tải từ CDN) | LOCAL | Đã làm; logic gộp đã unit test; **chưa chạy OCR thật trên video** |
| STT (endpoint tương thích OpenAI do bạn cấu hình) | API | Đã làm; kiểm thử với máy chủ giả lập cục bộ, **chưa thử engine thật** |
| Hybrid, chỉnh sửa, xuất SRT/VTT/JSON | LOCAL | Đã làm, đã kiểm thử |
| Script, Voice, Timeline | LOCAL / API | Giai đoạn 3 |
| FFmpeg.wasm, Auto Editor, Export | LOCAL | Giai đoạn 4 |
| Tạo ảnh/video AI | API / OPTIONAL BACKEND | Giai đoạn 5 |

## Đã kiểm thử (Chromium headless)
- Tạo dự án, nhập ảnh + SRT, lưu và khôi phục sau khi tải lại trang.
- Xuất JSON kèm media, nhập lại, xóa media, xóa dự án.

## Chưa kiểm thử / giới hạn đã biết
- OCR thật (cần tải Tesseract.js + dữ liệu ngôn ngữ từ CDN; môi trường kiểm thử không truy cập được CDN). Chưa đo độ chính xác với phụ đề tiếng Việt.
- STT với dịch vụ thật; timestamp từ chữ chỉ có nếu endpoint trả `verbose_json` có `segments`.
- Giải mã âm thanh nạp cả tệp vào RAM: video rất lớn có thể thất bại.
- Thời gian cue từ OCR chỉ là ước lượng (±khoảng lấy mẫu), được đánh dấu ⚠ trong trình chỉnh sửa.
- Nhúng phụ đề vào video (Giai đoạn 4) chưa có; hiện chỉ xem trước.
- Chưa thử video thật, tệp lớn, Safari/Firefox, điện thoại, hết dung lượng lưu trữ.
- Nhập từ URL phụ thuộc CORS của nguồn; nhiều nền tảng sẽ bị chặn.
- Cài đặt API chỉ lưu cục bộ, chưa module nào dùng.
- Dữ liệu mất nếu bạn xóa dữ liệu trình duyệt; hãy xuất JSON để sao lưu.
