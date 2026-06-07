# CLAUDE.md — Dự án Monitoring Stack

## Thông tin người dùng

- **Vai trò:** Technical Leader (.NET & Angular)
- **Mục tiêu:** Nghiên cứu và nắm vững hệ thống Monitoring từ cơ bản đến nâng cao
- **Môi trường:** VMware tại `192.168.1.35` — đã cài sẵn Docker

---

## Monitoring Stack cần nghiên cứu

| Công cụ | Mục đích |
|---|---|
| **Prometheus** | Thu thập & lưu trữ metrics theo dạng time-series |
| **Grafana** | Visualization — vẽ dashboard từ Prometheus, InfluxDB |
| **K6** | Load testing — tạo Virtual Users (VU), đẩy kết quả vào InfluxDB |
| **InfluxDB** | Time-series database — nhận dữ liệu từ K6 |
| **cAdvisor** | Thu thập metrics hệ thống: RAM, CPU, Network, Disk của container |
| **AlertManager** | Nhận alert từ Prometheus và gửi thông báo (email, Slack, webhook...) |

---

## Yêu cầu khi Claude trả lời

1. **Luôn giải thích mọi câu lệnh và cấu hình**, không bỏ qua bước nào
2. **Đánh dấu rõ ràng:**
   - `[BẮT BUỘC]` — thiếu thì không chạy được
   - `[TÙY CHỌN]` — có thể bỏ qua, nhưng nên có
   - `[KHUYẾN NGHỊ]` — best practice, phù hợp nhất với production
3. **Ngôn ngữ:** Trả lời bằng **tiếng Việt**
4. **Phong cách:** Giải thích như đang dạy một Tech Lead muốn hiểu sâu, không chỉ copy-paste

---

## Kiến trúc tổng thể (mục tiêu)

```
┌─────────────┐     scrape      ┌───────────────┐
│  cAdvisor   │ ──────────────► │               │
├─────────────┤                 │  Prometheus   │ ──► AlertManager ──► Slack/Email
│  App (.NET) │ ──────────────► │               │
└─────────────┘                 └───────┬───────┘
                                        │ query
┌─────────────┐   write results         ▼
│    K6       │ ──────────────► ┌───────────────┐
└─────────────┘   to InfluxDB  │    Grafana    │
                                │  Dashboard    │
                 ◄──────────── └───────────────┘
                   query InfluxDB & Prometheus
```

---

## Môi trường triển khai

- **Host:** `192.168.1.35` (VMware, Ubuntu/Linux)
- **Runtime:** Docker + Docker Compose
- **Tất cả service chạy trong container**, giao tiếp qua Docker network

---

## Ghi chú bổ sung

- Mọi `docker-compose.yml`, config file đều phải có comment giải thích từng dòng
- Ưu tiên dùng **Docker Compose** thay vì `docker run` riêng lẻ để dễ quản lý
- Tất cả port mặc định cần được ghi rõ để tránh conflict

---

## Quy tắc viết hướng dẫn theo từng bước

**Mỗi khi người dùng hoàn thành một bước học và chuyển sang bước tiếp theo:**

1. **Tạo branch git mới** theo quy ước `buoc-{số}-{mô-tả-ngắn-không-dấu}` (ví dụ: `buoc-2-prometheus-cadvisor-docker`)
2. **Commit toàn bộ thay đổi** của bước đó lên branch mới — mỗi bước = 1 branch riêng
3. Viết hướng dẫn triển khai, thực hành và sử dụng của bước mới vào **cuối file README.md**
4. Cập nhật **Mục lục** trong README.md để phản ánh nội dung mới
5. Hướng dẫn phải bao gồm:
   - Tổng quan: mục tiêu bước này dạy gì
   - Cấu trúc file mới tạo ra
   - Nội dung từng file config — giải thích từng dòng quan trọng
   - Lệnh triển khai — giải thích từng lệnh
   - Kiểm tra xác nhận hệ thống chạy đúng
   - Thực hành: bài tập khám phá để hiểu sâu hơn
6. Luôn dùng nhãn `[BẮT BUỘC]`, `[TÙY CHỌN]`, `[KHUYẾN NGHỊ]`
7. Cập nhật trạng thái trong bảng **Thứ tự học đề xuất** (⬜ Todo → ✅ Done)
8. **Mọi thay đổi file config thực tế (docker-compose.yml, prometheus.yml, ...) phải được đồng bộ ngay vào ví dụ tương ứng trong README.md** — không để tài liệu lạc hậu so với code thực tế. Cập nhật ngay, không hỏi lại.
