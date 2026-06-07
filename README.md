# Monitoring Stack — Nghiên cứu từ cơ bản đến nâng cao

> Tech Lead: .NET & Angular | Môi trường: VMware `192.168.1.35` (Docker)

---

## Mục tiêu

Hiểu và kiểm soát toàn bộ hệ thống monitoring — từ thu thập metrics, visualization, load testing, đến cảnh báo tự động.

---

## Monitoring Stack

| Công cụ | Vai trò | Port |
|---|---|---|
| **Prometheus** | Thu thập & lưu metrics time-series từ các service | `9090` |
| **Grafana** | Vẽ dashboard từ Prometheus + InfluxDB | `3000` |
| **K6** | Load testing — tạo hàng nghìn Virtual Users | — |
| **InfluxDB** | Nhận kết quả từ K6, lưu time-series | `8086` |
| **cAdvisor** | Metrics container: RAM, CPU, Network, Disk | `8080` |
| **AlertManager** | Nhận alert từ Prometheus → gửi Email/Slack | `9093` |
| **Node Exporter** | Metrics OS của host (Linux) | `9100` |

---

## Kiến trúc tổng thể

```
┌──────────────┐   scrape     ┌────────────────┐
│  cAdvisor    │ ──────────►  │                │
├──────────────┤              │   Prometheus   │──► AlertManager ──► Slack/Email
│ Node Exporter│ ──────────►  │                │
├──────────────┤              └───────┬────────┘
│  ShopApi     │ ──────────►          │ query
│  (.NET 8)    │                      ▼
└──────────────┘             ┌────────────────┐
                             │    Grafana     │
┌──────────────┐  write      │   Dashboard    │
│     K6       │──────────►  │                │
│  Load Test   │  InfluxDB   └────────────────┘
└──────────────┘               ▲
                               │ query InfluxDB
```

---

## Demo API — ShopApi (.NET 8)

Project .NET 8 Web API dùng để thực hành K6 load testing.

**Đường dẫn:** [`src/ShopApi/`](src/ShopApi/)

### Tech Stack
- ASP.NET Core 8 Web API
- Entity Framework Core 8 + SQL Server
- JWT Bearer Authentication
- Swagger UI

### Database
```
Server=192.168.1.35,1433
Database=Mornitordb
User=sa
```

### Entities

```
User ──< Order ──< OrderItem >── Product >── Category
```

### Endpoints

| Method | Endpoint | Auth | Mô tả |
|---|---|---|---|
| POST | `/api/auth/register` | Không | Đăng ký tài khoản |
| POST | `/api/auth/login` | Không | Đăng nhập, nhận JWT |
| GET | `/api/categories` | JWT | Danh sách category |
| POST | `/api/categories` | JWT | Tạo category |
| GET | `/api/products?page=1&pageSize=20` | JWT | Danh sách sản phẩm (phân trang) |
| GET | `/api/products/{id}` | JWT | Chi tiết sản phẩm |
| POST | `/api/orders` | JWT | Đặt hàng |
| GET | `/api/orders` | JWT | Lịch sử đơn hàng |
| GET | `/health` | Không | Health check cho K6 |

### Chạy API

```powershell
cd src/ShopApi
dotnet run
# Swagger UI: http://localhost:5065
```

### Luồng K6 test

```
1. POST /api/auth/register  → tạo user ảo
2. POST /api/auth/login     → lấy JWT token
3. GET  /api/products       → browse sản phẩm (read-heavy)
4. POST /api/orders         → đặt hàng (write + transaction)
5. GET  /api/orders         → xem lịch sử
```

---

## Khái niệm quan trọng — Tech Lead phải biết

### Percentile (P95, P99)

| Metric | Ý nghĩa | Ngưỡng tốt |
|---|---|---|
| **P50** | 50% request xong trong X ms (median) | < 100ms |
| **P95** | 95% request xong trong X ms | < 500ms |
| **P99** | 99% request xong trong X ms | < 1000ms |
| **P99.9** | 99.9% request xong trong X ms | < 2000ms |

> **Tại sao không dùng Average?**
> 99 request = 10ms, 1 request = 10,000ms → Average = 110ms (đánh lừa).
> P99 = 10,000ms → mới thấy vấn đề thật sự.

### Các chỉ số cần theo dõi trên Grafana

| Chỉ số | Ý nghĩa |
|---|---|
| **RPS** (Requests/sec) | Throughput — API xử lý bao nhiêu req/giây |
| **Error Rate** | % request lỗi (5xx) — ngưỡng < 1% |
| **P95 Latency** | Độ trễ 95th percentile |
| **CPU Usage** | Nếu > 80% liên tục → cần scale |
| **Memory Usage** | Theo dõi memory leak |
| **DB Connection Pool** | Số connection đang dùng |
| **GC Collections** | .NET Garbage Collection frequency |

---

## Thứ tự học đề xuất

- [x] **Bước 1:** Tạo ShopApi (.NET 8) để có API thực tế
- [ ] **Bước 2:** Chạy Prometheus + cAdvisor bằng Docker Compose
- [ ] **Bước 3:** Kết nối Grafana → Prometheus, tạo dashboard đầu tiên
- [ ] **Bước 4:** Cấu hình AlertManager (alert rule + Slack notification)
- [ ] **Bước 5:** Cài InfluxDB, viết K6 script load test ShopApi
- [ ] **Bước 6:** Kết nối Grafana → InfluxDB, xem P95/P99 của K6
- [ ] **Bước 7:** Expose .NET metrics ra Prometheus (prometheus-net)
- [ ] **Bước 8:** Dashboard tổng hợp — 1 màn hình thấy toàn bộ hệ thống

---

## Môi trường

| Thành phần | Địa chỉ |
|---|---|
| VMware Host | `192.168.1.35` |
| SQL Server | `192.168.1.35:1433` |
| Grafana | `http://192.168.1.35:3000` |
| Prometheus | `http://192.168.1.35:9090` |
| InfluxDB | `http://192.168.1.35:8086` |
| cAdvisor | `http://192.168.1.35:8080` |
| AlertManager | `http://192.168.1.35:9093` |
| ShopApi (dev) | `http://localhost:5065` |
