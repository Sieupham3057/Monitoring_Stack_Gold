# Grafana Dashboard — Hướng dẫn đọc & phân tích cho Tech Lead

> Dashboard: `monitoring-overview-wsl.json`
> Nguồn dữ liệu: Prometheus + cAdvisor + ShopApi metrics

---

## Mục lục

1. [Tổng quan kiến trúc Dashboard](#1-tổng-quan-kiến-trúc-dashboard)
2. [Giải thích từng Panel](#2-giải-thích-từng-panel)
   - 2.1 [Row 1 — KPI Stats (4 ô tổng quan nhanh)](#21-row-1--kpi-stats)
   - 2.2 [Row 2 — Container Detail Table](#22-row-2--container-detail-table)
   - 2.3 [Row 3 — CPU & Memory Time Series](#23-row-3--cpu--memory-time-series)
   - 2.4 [Row 4 — Network I/O](#24-row-4--network-io)
   - 2.5 [Row 5 — All Services: Application Metrics (multi-service)](#25-row-5--all-services-application-metrics)
   - 2.6 [Row 6 — Advanced: Throttling & Working Set](#26-row-6--advanced-throttling--working-set)
3. [PXX Percentiles là gì — P50, P99 đọc như nào](#3-pxx-percentiles-là-gì)
4. [Tech Lead cần chú ý gì khi nhìn vào Dashboard](#4-tech-lead-cần-chú-ý-gì)
5. [Dashboard còn thiếu Panel nào quan trọng](#5-dashboard-còn-thiếu-panel-nào-quan-trọng)
6. [Thêm Backend API mới — 3 bước + Troubleshooting](#6-thêm-backend-api-mới--chỉ-2-bước)
7. [Quick Reference — Lệnh restart / reload hay dùng](#7-quick-reference--lệnh-restart--reload-hay-dùng)

---

## 1. Tổng quan kiến trúc Dashboard

Dashboard này được thiết kế theo mô hình **"từ tổng quan → chi tiết → ứng dụng"**:

```
┌──────────────────────────────────────────────────────────┐
│  Row 1: KPI nhanh — bao nhiêu container? CPU? RAM?      │  ← Nhìn 5 giây biết hệ thống ổn không
├──────────────────────────────────────────────────────────┤
│  Row 2: Bảng chi tiết — container nào ăn RAM nhiều?      │  ← Drill-down xem thủ phạm
├──────────────────────────────────────────────────────────┤
│  Row 3: CPU & RAM theo thời gian — trend như nào?        │  ← Xem xu hướng, phát hiện leak
├──────────────────────────────────────────────────────────┤
│  Row 4: Network — băng thông vào/ra host                 │  ← Phát hiện traffic bất thường
├──────────────────────────────────────────────────────────┤
│  Row 5: All Services — request rate, error rate, latency │  ← Sức khỏe ứng dụng ($service filter)
├──────────────────────────────────────────────────────────┤
│  Row 6: CPU throttle & Memory working set                 │  ← Resource limit bị vi phạm
└──────────────────────────────────────────────────────────┘
```

**Nguồn dữ liệu:**
- **cAdvisor** → cung cấp container_cpu, container_memory, container_network metrics
- **ShopApi, BankingApi, (mọi API mới)** → expose `/metrics` → Prometheus scrape → HTTP request/latency metrics
- **Template variable `$service`** → tự động discover mọi job có `http_requests_received_total` → không cần sửa dashboard khi thêm API

---

## 2. Giải thích từng Panel

### 2.1 Row 1 — KPI Stats

Bốn ô stat ở hàng đầu là **"Health Check nhanh"** — Tech Lead nhìn vào đây trong 5 giây biết hệ thống có vấn đề không.

---

#### Panel: "Containers đang chạy"
**Query:** `count(container_memory_usage_bytes{image!=""})`

**Ý nghĩa:** Đếm số container đang chạy có image (loại bỏ các process nội bộ của Docker).

**Tại sao cần:**
- Phát hiện container bị crash và không restart được
- Đột ngột giảm từ 5 → 3 = có 2 container chết

**Tech Lead cần làm gì:**
| Tình huống | Ngưỡng | Hành động |
|---|---|---|
| Con số ổn định | Bằng với số service deploy | Bình thường |
| Giảm đột ngột | Bất kỳ | `docker ps -a` → xem container nào exit, đọc log |
| Tăng đột biến | Vượt quá expected | Có thể có container restart loop |

---

#### Panel: "Prometheus Time Series (đang theo dõi)"
**Query:** `prometheus_tsdb_head_series`

**Ý nghĩa:** Số lượng time series Prometheus đang lưu trong bộ nhớ (head block).

**Tại sao cần:**
- Mỗi metric với mỗi bộ label khác nhau = 1 time series
- Quá nhiều series → **cardinality explosion** → Prometheus OOM

**Ngưỡng cần quan tâm:**
- < 100,000: Bình thường
- 100,000 – 500,000: Cần xem lại label có bị unique quá không (ví dụ: dùng user_id làm label)
- > 1,000,000: Nguy hiểm, cần giảm cardinality ngay

---

#### Panel: "CPU tổng đang dùng (cores)"
**Query:** `sum(rate(container_cpu_usage_seconds_total{image!=""}[5m]))`

**Ý nghĩa:** Tổng số CPU core mà tất cả container đang dùng tính trung bình 5 phút.

**Đọc như nào:**
- Giá trị `1.5` = đang dùng 1.5 CPU cores
- Nếu server có 4 cores → đang dùng 37.5%

**Ngưỡng:**
- **Xanh** (< 5 cores trong dashboard này): Bình thường
- **Vàng** (5-10): Cần theo dõi
- **Đỏ** (> 10): Quá tải, cần scale

---

#### Panel: "RAM tổng (tất cả containers)" — Gauge
**Query:** `sum(container_memory_usage_bytes{image!=""}) / 1024 / 1024`

**Ý nghĩa:** Tổng RAM (MB) tất cả container đang dùng — hiển thị dạng Gauge có kim chỉ.

**Tại sao dùng Gauge thay vì Stat:**
- Gauge có thanh màu trực quan — nhìn kim ở đâu biết ngay gần ngưỡng chưa
- Ngưỡng đỏ ở 3584 MB (3.5 GB) — phù hợp server nhỏ 4-8 GB RAM

---

### 2.2 Row 2 — Container Detail Table

#### Panel: "Container đang chạy — Chi tiết (Service | Image | RAM)"

**Ý nghĩa:** Bảng liệt kê mỗi container: tên service, image đầy đủ, RAM đang dùng — sắp xếp giảm dần theo RAM.

**Transformations được dùng:**
1. `labelsToFields` — chuyển labels (image, service, ...) từ Prometheus thành cột
2. `merge` — gộp nhiều data frame thành 1 bảng
3. `organize` — ẩn cột không cần (Time, __name__, job...), đổi tên cột, sắp xếp thứ tự

**Tại sao cần:**
- Khi "RAM tổng" vượt ngưỡng, cần biết **thủ phạm** là container nào
- Không cần nhớ tên image dài, `label_replace` đã extract tên service ngắn gọn

**label_replace hoạt động thế nào:**
```promql
label_replace(metric, "service", "$1", "image", ".*/([^/:]+):.*")
```
- Regex `.*/([^/:]+):.*` capture phần tên image trước dấu `:`
- Ví dụ: `ghcr.io/shopapi/shopapi:latest` → service = `shopapi`
- Trường hợp đặc biệt: `.*mssql.*` → service = `sqlserver` (override thủ công)

---

### 2.3 Row 3 — CPU & Memory Time Series

#### Panel: "CPU Usage (%) theo container"

**Query:**
```promql
rate(container_cpu_usage_seconds_total{image!=""}[5m]) * 100
```

**Ý nghĩa:** % CPU mỗi container dùng trong 5 phút gần nhất — mỗi container 1 đường màu khác nhau.

**Cách đọc:**
- Mỗi line = 1 container
- Y-axis: % (100% = 1 full CPU core)
- Legend dưới: mean/max/lastNotNull — xem giá trị đỉnh vs trung bình

**Tình huống và cách xử lý:**
| Tình huống | Triệu chứng | Xử lý |
|---|---|---|
| Spike ngắn | 1 container tăng vọt 1-2 phút rồi về | Xem log lúc đó — có batch job? GC? |
| Cao liên tục | 1 container luôn > 80% | Tăng CPU limit hoặc scale horizontal |
| Tất cả tăng đồng thời | Nhiều container tăng cùng lúc | Traffic spike — xem network/request rate |

---

#### Panel: "Memory Usage (MB) theo container"

**Ý nghĩa:** RAM mỗi container theo thời gian.

**Memory leak pattern:**
```
Normal:    ───────  (phẳng)
Leak:      ╱╱╱╱╱╱  (tăng dần không giảm)
GC burst:  ╱╲╱╲╱╲  (răng cưa đều)
```

**Khi thấy đường tăng dần không về:** Đó là **memory leak** — cần:
1. Xem heap dump hoặc memory profiler của app
2. Restart container tạm thời để giải phóng
3. Fix code (dispose objects, close connections...)

---

### 2.4 Row 4 — Network I/O

#### Panel: "Network Receive" & "Network Transmit"

**Query:**
```promql
rate(container_network_receive_bytes_total{id="/", interface!="lo"}[5m])
```

**Lưu ý quan trọng:** `id="/"` — đây là **host-level** metrics, không phải per-container.
- `interface!="lo"` — loại bỏ loopback (127.0.0.1)
- Mỗi line = 1 network interface của host (eth0, ens3, docker0...)

**Tại sao host-level thay vì per-container:**
- cAdvisor với Docker runtime không expose per-container network metrics đầy đủ
- Host-level đủ để biết tổng băng thông vào/ra

**Cách đọc:**
- Unit: `Bps` (Bytes per second) — ÷ 1024 = KB/s, ÷ 1024² = MB/s
- Receive tăng đột biến → có ai đang download/gửi data về server nhiều
- Transmit tăng → server đang gửi response nhiều → traffic người dùng tăng

---

### 2.5 Row 5 — All Services: Application Metrics

Đây là phần **quan trọng nhất từ góc độ business** — không phải infrastructure mà là ứng dụng có đang phục vụ người dùng tốt không.

> **Thiết kế multi-service:** Dashboard dùng template variable `$service` + `group by (job)` thay vì hardcode từng API. Thêm API mới chỉ cần thêm scrape job vào Prometheus — dashboard tự nhận diện. Xem mục 6 để hiểu chi tiết.

---

#### Panel: "HTTP Request Rate — tất cả services (req/s theo service + status)"

**Query:**
```promql
sum by (job, code) (rate(http_requests_received_total{job=~"$service"}[5m]))
```

**legendFormat:** `{{job}} — HTTP {{code}}`

**Ý nghĩa:** Số request/giây, phân loại theo **cả tên service lẫn HTTP status** — nhìn thấy ngay shopapi và banking-api trên cùng 1 panel.

**Cách đọc:**
- `shopapi — HTTP 200` cao = ShopApi đang phục vụ bình thường
- `banking-api — HTTP 500` xuất hiện = BankingApi có lỗi server
- `$service` dropdown ở đầu dashboard cho phép filter chỉ 1 service hoặc xem tất cả

**Tại sao phân loại theo (job, code) thay vì chỉ code:**
- Nếu chỉ `group by (code)`: 2 service cộng chung → không biết service nào lỗi
- `group by (job, code)`: mỗi service có đường riêng → pinpoint ngay thủ phạm

---

#### Panel: "Error Rate % (5xx) — so sánh tất cả services"

**Query:**
```promql
100 * sum by (job) (rate(http_requests_received_total{job=~"$service", code=~"5.."}[5m]))
      / sum by (job) (rate(http_requests_received_total{job=~"$service"}[5m]))
```

**legendFormat:** `{{job}}`

**Ý nghĩa:** % request 5xx của **từng service** — đường riêng cho mỗi API, cùng 1 panel.

**Tại sao đổi từ stat → timeseries:**
- Stat chỉ hiển thị được 1 giá trị tại 1 thời điểm — không phù hợp khi có nhiều service
- Timeseries cho thấy xu hướng theo thời gian + so sánh trực tiếp giữa các service

**SLO thông thường:**
| Loại hệ thống | Error Rate chấp nhận |
|---|---|
| Internal tool | < 5% |
| B2B API | < 1% |
| Consumer app | < 0.1% |
| Payment/banking critical | < 0.01% |

**Ngưỡng trong dashboard:** Vàng ở 1%, Đỏ ở 5% (threshold line hiển thị trên biểu đồ).

---

#### Panel: "P99 Latency — so sánh tất cả services"

**Query:**
```promql
histogram_quantile(0.99, sum by(job, le) (rate(http_request_duration_seconds_bucket{job=~"$service"}[5m])))
```

**legendFormat:** `{{job}} — P99`

**Ý nghĩa:** P99 latency của từng service theo thời gian — quan trọng: phải `sum by (job, le)` không phải chỉ `by (le)`, nếu không các service bị cộng gộp lại thành 1 histogram sai.

**Ngưỡng:** Vàng 0.5s, Đỏ 1s (threshold line+area).

---

#### Panel: "P50 Latency / Median — so sánh tất cả services"

**Query:**
```promql
histogram_quantile(0.50, sum by(job, le) (rate(http_request_duration_seconds_bucket{job=~"$service"}[5m])))
```

**legendFormat:** `{{job}} — P50`

**Tại sao tách P50 và P99 thành 2 panel riêng (thay vì gộp):**
- Với 1 service: P50+P99 cùng panel là ổn (2 đường)
- Với 2+ services: P50+P99 cùng panel = 4+ đường → khó đọc, màu sắc lẫn lộn
- Tách ra: mỗi panel so sánh cùng loại metric giữa các service → dễ thấy service nào chậm hơn

---

### 2.6 Row 6 — Advanced: Throttling & Working Set

#### Panel: "CPU Throttling % — container bị giới hạn CPU"

**Query:**
```promql
rate(container_cpu_cfs_throttled_seconds_total{image!=""}[5m])
/ clamp_min(rate(container_cpu_cfs_periods_total{image!=""}[5m]), 0.001)
* 100
```

**Ý nghĩa:** % thời gian container bị Linux kernel **bóp** CPU vì đã đạt CPU limit.

**Cơ chế hoạt động:**
```
Docker: --cpu-limit=0.5 (50% của 1 core)
Linux CFS scheduler: cứ mỗi 100ms, container chỉ được dùng 50ms
Nếu container cần 80ms/100ms → bị throttle 30ms → 30% throttle rate
```

**Tại sao nguy hiểm:**
- Container bị throttle → response chậm hơn → latency tăng
- App không biết mình bị throttle — không có error, không có log
- Rất khó debug nếu không có panel này

**Ngưỡng:**
- < 10%: Bình thường
- 10-25%: Cần theo dõi, cân nhắc tăng CPU limit
- > 25%: **[BẮT BUỘC]** tăng CPU limit hoặc optimize code

---

#### Panel: "Memory Working Set (MB)"

**Query:** `container_memory_working_set_bytes / 1024 / 1024`

**Khác gì với Memory Usage:**
| Metric | Bao gồm | Dùng để |
|---|---|---|
| `memory_usage_bytes` | RSS + cache + swap | Tổng RAM đang chiếm |
| `memory_working_set_bytes` | RSS + anon pages (không tính cache) | **Giá trị Kubernetes dùng để OOM Kill** |

**Tại sao Tech Lead cần quan tâm:**
- Kubernetes OOM Killer nhìn vào `working_set`, không phải `usage`
- App có thể bị kill dù `usage` vẫn dưới limit nếu `working_set` vượt
- Nếu không dùng Kubernetes, vẫn cần để phát hiện memory leak chính xác hơn

---

## 3. PXX Percentiles là gì

### Khái niệm cơ bản

**Percentile (phân vị)** là câu trả lời cho câu hỏi: *"Bao nhiêu % request hoàn thành trong thời gian X hoặc nhanh hơn?"*

Hoặc ngược lại: *"PXX giây là thời gian mà XX% request hoàn thành trong đó."*

### Ví dụ thực tế

Giả sử có 100 requests với latency (ms):
```
10, 12, 15, 18, 20, 22, 25, 28, 30, 35,
40, 45, 50, ... (90 requests dưới 200ms) ...
800, 1200, 2000, 3000, 5000  (10 requests chậm)
```

| Percentile | Giá trị | Ý nghĩa |
|---|---|---|
| **P50** (median) | ~50ms | 50% request xong trong 50ms — trải nghiệm người dùng trung bình |
| **P90** | ~150ms | 90% request xong trong 150ms |
| **P95** | ~400ms | 95% request xong trong 400ms |
| **P99** | ~2000ms | 99% request xong trong 2s — người dùng "tệ số" trải nghiệm này |
| **P99.9** | ~5000ms | 99.9% request xong trong 5s — cực hiếm nhưng vẫn xảy ra |

### Tại sao không dùng Average?

**Average (trung bình) rất nguy hiểm để đo latency:**

```
Scenario: 99 requests = 10ms, 1 request = 10,000ms
Average = (99×10 + 10000) / 100 = 109.9ms
→ Nhìn vào average thấy "ok"
→ Nhưng có 1% user đợi 10 GIÂY
```

**P99 bắt được điều này ngay lập tức.**

### SLO/SLA dựa trên Percentiles

Trong thực tế, Tech Lead thường cam kết:

```
SLO: P99 latency < 500ms
     P50 latency < 100ms
     Error rate < 0.1%
     Availability > 99.9%
```

### Cách đọc Latency Trend trong Dashboard

```
P50: ─────────────────  (ổn định ~50ms)
P99: ────────╱╲────────  (spike lên 800ms rồi về)
              ↑
         Điều tra lúc này:
         - Có GC pause không?
         - Database query chậm?
         - External API timeout?
```

**Khoảng cách P99 - P50 nói lên gì:**
- Khoảng cách nhỏ → phân phối latency đều → hệ thống ổn định
- Khoảng cách lớn → có outlier → thường do: GC, cold start, N+1 query, external call

### Khi nào dùng P50 vs P99 vs P99.9

| Mục đích | Dùng |
|---|---|
| Báo cáo business ("API chúng ta nhanh bao nhiêu?") | P50 |
| SLO/SLA cam kết với khách hàng | P99 |
| Hệ thống critical (payment, banking) | P99.9 |
| Phát hiện memory/GC issue | So sánh P99 spike với GC metrics |
| Load testing baseline | P50 + P95 + P99 |

---

## 4. Tech Lead cần chú ý gì

### 4.1 Checklist khi xem Dashboard hàng ngày

```
□ Số container đúng với số service đã deploy chưa?
□ Error rate < ngưỡng SLO chưa?
□ P99 latency trong giới hạn cam kết chưa?
□ Có container nào memory tăng dần (leak pattern) không?
□ CPU throttle > 25% ở container nào không?
□ Network có spike bất thường không?
```

### 4.2 Các Pattern nguy hiểm cần nhận biết

#### Memory Leak Pattern
```
Dấu hiệu: RAM tăng dần đều, không bao giờ giảm
Timeline: từ 200MB → 400MB → 600MB sau 6 tiếng
Xử lý:
  1. Restart container ngay (giải phóng tạm)
  2. Lấy memory dump để phân tích
  3. Xem dispose pattern, connection pool, static collection
```

#### CPU Spike Pattern
```
Dấu hiệu: CPU tăng đột ngột 1-2 phút rồi về
Nguyên nhân thường gặp:
  - Cron job / batch processing
  - GC Full Collection (.NET LOH)
  - N+1 query bùng nổ
  - Cold start sau deploy
```

#### Error Rate Spike
```
Dấu hiệu: Error 5xx tăng đột ngột
Checklist:
  1. Xem log container ngay lúc đó (docker logs --since 10m)
  2. Check database connection pool có đầy không
  3. Check external dependency (API third-party, email service...)
  4. Check deploy gần nhất có thay đổi gì không
```

#### Latency Degradation (chậm dần)
```
Dấu hiệu: P99 tăng dần theo ngày, không spike
Nguyên nhân:
  - Database query chậm dần do data tăng, thiếu index
  - Cache hit rate giảm dần
  - Connection pool bắt đầu bão hòa
  - Memory pressure → GC nhiều hơn
```

### 4.3 Khi nào cần Scale?

| Tín hiệu | Hành động |
|---|---|
| CPU > 70% liên tục | Scale horizontal (thêm instance) hoặc tăng CPU limit |
| CPU throttle > 25% | Tăng CPU limit trước, sau đó scale nếu cần |
| RAM > 80% limit | Tăng memory limit hoặc tìm leak |
| P99 > SLO liên tục | Profile app, tối ưu query, thêm cache |
| Error rate > 1% | **P0 incident** — họp ngay, rollback nếu cần |

### 4.4 Correlation — Nhìn nhiều panel cùng lúc

Kỹ năng quan trọng nhất của Tech Lead là **tương quan** giữa các panel:

```
Ví dụ 1: P99 tăng + CPU throttle tăng → tăng CPU limit → P99 về bình thường

Ví dụ 2: P99 tăng + CPU bình thường + RAM bình thường
→ Không phải resource issue → Xem external dependency, database

Ví dụ 3: Error rate tăng + Container count giảm
→ Container crash → docker logs → OOM Kill → tăng memory limit

Ví dụ 4: Request rate giảm + Error rate giảm + Latency bình thường
→ Ít traffic thật sự (off-peak) — không phải vấn đề
```

---

## 5. Dashboard còn thiếu Panel nào quan trọng

### 5.1 Thiếu — Ưu tiên cao [BẮT BUỘC]

#### Disk I/O & Disk Usage
```promql
-- Disk write rate
rate(container_fs_writes_bytes_total{image!=""}[5m])

-- Disk read rate
rate(container_fs_reads_bytes_total{image!=""}[5m])

-- Disk usage %
container_fs_usage_bytes{image!=""} / container_fs_limit_bytes{image!=""}
```
**Tại sao quan trọng:** Database (SQL Server) ghi/đọc disk liên tục. Disk full = toàn bộ service down.

---

#### Uptime / Restart Count
```promql
-- Số lần container restart
increase(kube_pod_container_status_restarts_total[1h])
-- hoặc với Docker thuần:
time() - container_start_time_seconds{image!=""}
```
**Tại sao quan trọng:** Container restart nhiều = crash loop. Không có panel này, bạn không biết service đang crash và tự restart liên tục.

---

#### HTTP Request Rate — chi tiết theo endpoint
```promql
sum by (method, path, code) (rate(http_requests_received_total{job="shopapi"}[5m]))
```
**Tại sao quan trọng:** Biết endpoint nào bị lỗi, endpoint nào chậm — không chỉ biết tổng.

---

### 5.2 Thiếu — Ưu tiên trung bình [KHUYẾN NGHỊ]

#### Container Restart Timeline (Event panel)
Hiển thị mốc thời gian có container restart — correlation với latency spike.

#### Database Connection Pool
```promql
-- Nếu ShopApi expose metric này
dotnet_sql_connections_active{job="shopapi"}
dotnet_sql_connections_max{job="shopapi"}
```
**Tại sao quan trọng:** Pool đầy → request xếp hàng → latency tăng nhưng CPU bình thường — pattern khó tìm nguyên nhân.

#### GC (Garbage Collection) Metrics — .NET
```promql
dotnet_gc_collections_total{job="shopapi", generation="2"}
dotnet_gc_pause_seconds{job="shopapi"}
```
**Tại sao quan trọng:** GC Gen 2 (Full GC) = stop-the-world → P99 spike. Correlation với CPU throttle.

#### Alerting Status Panel
Danh sách alert đang firing — nhìn vào 1 chỗ biết có incident nào đang xảy ra không.

---

### 5.3 Thiếu — Ưu tiên thấp [TÙY CHỌN]

- **Prometheus scrape duration** — Prometheus mất bao lâu để scrape, phát hiện target chậm
- **Grafana dashboard load time** — dashboard có bị nặng không
- **Node Exporter metrics** — CPU/RAM/Disk của host machine (không phải container)

---

## 6. Thêm Backend API mới — Chỉ 2 bước

### 6.1 Tại sao chỉ cần 2 bước?

Dashboard hiện tại đã được thiết kế theo kiến trúc **multi-service scalable**:

```
Cách cũ (hardcode):                    Cách mới (Template Variable):
─────────────────────────────          ─────────────────────────────
Panel: ShopApi Request Rate            Panel: HTTP Request Rate
  query: job="shopapi"       →           query: job=~"$service"
Panel: ShopApi Error Rate              Panel: Error Rate %
  query: job="shopapi"                    query: job=~"$service"
Panel: ShopApi P99 Latency             Panel: P99 Latency
  query: job="shopapi"                    query: job=~"$service"

Thêm banking-api → nhân 3 panels      Thêm banking-api → 0 thay đổi dashboard
Thêm auth-api → nhân 6 panels         Thêm auth-api → 0 thay đổi dashboard
Thêm N api → nhân 3N panels           Thêm N api → 0 thay đổi dashboard
```

**`$service` variable** tự động query Prometheus:
```promql
label_values(http_requests_received_total, job)
```
Prometheus scrape job nào có metric `http_requests_received_total` → tự xuất hiện trong dropdown. Không cần sửa dashboard.

---

### 6.2 Step 1 — API mới phải expose `/metrics`

#### 1a. Thêm NuGet package vào `.csproj`

```xml
<ItemGroup>
  <!-- ... các package khác ... -->
  <PackageReference Include="prometheus-net.AspNetCore" Version="8.2.1" />
</ItemGroup>
```

Hoặc chạy lệnh trong thư mục project:
```bash
dotnet add package prometheus-net.AspNetCore
```

---

#### 1b. Cập nhật `Program.cs` — đúng thứ tự middleware

```csharp
using Prometheus;  // [BẮT BUỘC] thêm namespace ở đầu file

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddControllers();
// ... các service khác ...

var app = builder.Build();

// ... Swagger, HTTPS, v.v. ...

app.UseRouting();      // [BẮT BUỘC] phải có trước UseHttpMetrics

app.UseHttpMetrics();  // [BẮT BUỘC] đo mọi HTTP request → tạo 2 metric:
                       //   http_requests_received_total{code, method, controller, action}
                       //   http_request_duration_seconds{code, method, controller, action}

app.UseAuthorization();

app.MapControllers();
app.MapMetrics("/metrics");  // [BẮT BUỘC] expose endpoint cho Prometheus scrape

app.Run();
```

**Thứ tự middleware — [QUAN TRỌNG]:**
```
UseRouting()       ← phải trước UseHttpMetrics
UseHttpMetrics()   ← phải trước UseAuthorization và MapControllers
UseAuthorization()
MapControllers()
MapMetrics()       ← đặt sau cùng
```

> Nếu đặt `UseHttpMetrics()` **sau** `MapControllers()` → middleware chạy sau khi request đã được route xong → không capture được đầy đủ metadata (controller, action) → metric vẫn tạo nhưng thiếu label.

---

#### 1c. Kiểm tra sau khi deploy

```bash
# Gọi thử 1 request vào API trước
curl http://localhost:{PORT}/api/health

# Sau đó kiểm tra /metrics — phải thấy cả 2 loại metric
curl http://localhost:{PORT}/metrics | grep "http_requests_received_total"
curl http://localhost:{PORT}/metrics | grep "http_request_duration_seconds_bucket"
```

Kỳ vọng:
```
http_requests_received_total{code="200",method="GET",...} 1
http_request_duration_seconds_bucket{le="0.025",...} 1
http_request_duration_seconds_bucket{le="0.05",...} 1
...
```

Nếu thiếu `http_request_duration_seconds_bucket` → P99/P50 panels trong Grafana sẽ không có data (histogram metric cần riêng, không tự sinh từ counter).

---

### 6.3 Step 2 — Đảm bảo API container cùng Docker network với Prometheus

**Có 2 trường hợp:**

#### Trường hợp A — API nằm trong cùng docker-compose.wsl.yml

```bash
# Thêm service vào docker-compose.wsl.yml rồi deploy
docker compose -f docker-compose.wsl.yml up -d banking-api

# Container tự join monitoring_net → Prometheus dùng được tên container ngay
```

#### Trường hợp B — API từ project Docker Compose khác (thực tế phổ biến hơn)

Khi API đã chạy từ project riêng (khác folder, khác compose file), container đó nằm ở network riêng. Prometheus không thể resolve hostname.

```bash
# Bước 1: Tìm tên network của monitoring stack
docker network ls | grep monitoring
# → Kết quả: monitoring_stack_gold_monitoring_net

# Bước 2: Join container API vào network của monitoring
docker network connect monitoring_stack_gold_monitoring_net banking-api
# "banking-api" là tên container (docker ps → cột NAMES)

# Bước 3: Verify — Prometheus giờ có thể ping đến container
docker exec monitoring_prometheus wget -qO- http://banking-api:8080/metrics | head -5
```

**Tại sao dùng port 8080 (nội bộ) thay vì 8089 (host port):**
```
Host:       banking-api:8089  ← port mapping ra ngoài, dùng từ máy tính của bạn
Docker net: banking-api:8080  ← port thật trong container, dùng từ Prometheus
```
Prometheus giao tiếp qua Docker network nội bộ → luôn dùng port bên trong container.

> **Lưu ý:** `docker network connect` chỉ tồn tại đến khi container restart. Nếu API container restart → phải chạy lại lệnh này. Để persistent, cần thêm network vào docker-compose của project API (xem 6.4).

---

### 6.4 (Nếu dùng Trường hợp B) Cấu hình persistent — không cần connect lại sau restart

Thêm `external network` vào docker-compose của **project BankingApi**:

```yaml
# docker-compose.yml của project BankingApi (project khác)
services:
  banking-api:
    # ... các config khác giữ nguyên ...
    networks:
      - default          # network riêng của project
      - monitoring_net   # join thêm vào network monitoring

networks:
  monitoring_net:
    external: true       # báo Docker đây là network có sẵn, không tạo mới
    name: monitoring_stack_gold_monitoring_net  # tên thực tế của network
```

Sau đó restart project BankingApi:
```bash
docker compose up -d
```

Container sẽ tự join `monitoring_net` mỗi lần start — không cần `docker network connect` thủ công nữa.

---

### 6.6 Step 4 — Thêm scrape job vào Prometheus và reload

Mở [prometheus.wsl.yml](src/monitoring/prometheus/prometheus.wsl.yml) và thêm 1 block:

```yaml
  - job_name: 'banking-api'            # [BẮT BUỘC] tên job → thành label "job" trong mọi metric
    static_configs:
      - targets: ['banking-api:8080']  # [BẮT BUỘC] tên service Docker + port nội bộ container
        labels:
          app: 'banking-api'
          env: 'production'
```

Sau đó **reload Prometheus** — [BẮT BUỘC], sửa file mà không reload thì Prometheus vẫn dùng config cũ:

```bash
# Cách 1: HTTP API (không cần restart, không mất data đang scrape)
curl -X POST http://localhost:9090/-/reload

# Cách 2: Restart container (chậm hơn nhưng chắc chắn)
docker restart monitoring_prometheus
```

---

### 6.7 Kết quả — Dashboard tự cập nhật

Sau khi Step 3 xong và Prometheus scrape thành công, **không cần chạm vào JSON dashboard**:

| Grafana dropdown `$service` | Hiển thị |
|---|---|
| All | Tất cả services trên cùng 1 panel |
| shopapi | Chỉ ShopApi |
| banking-api | Chỉ BankingApi |
| shopapi + banking-api | 2 services, legend: `shopapi — HTTP 200`, `banking-api — HTTP 200` |

> **Tại sao $service tự nhận diện?** Variable dùng query `label_values(http_requests_received_total, job)` — Prometheus tự liệt kê mọi job đang có metric này. Không cần sửa dashboard.

---

### 6.8 Troubleshooting — API không xuất hiện trong dropdown $service

Khi thêm API mới nhưng dropdown không hiện, chạy lần lượt các lệnh sau để tìm điểm gãy:

```
Luồng data cần hoàn chỉnh:
API /metrics → Prometheus scrape → metric có job label → $service variable query → dropdown
     ↑               ↑                     ↑                      ↑
  Step 1          Step 3/4            Step 3/4              tự động
```

**Bước 1 — Kiểm tra container có đang chạy không:**
```bash
docker ps --format "table {{.Names}}\t{{.Status}}" | grep -i banking
# Kỳ vọng: monitoring_banking_api   Up X minutes
# Nếu không có → chưa deploy: docker compose -f docker-compose.wsl.yml up -d banking-api
# Nếu Exited → xem log: docker logs monitoring_banking_api
```

**Bước 2 — Kiểm tra API có expose /metrics không:**
```bash
# Thay 5066 bằng port của banking-api
curl -s http://localhost:5066/metrics | grep "http_requests_received_total"
# Kỳ vọng: có dòng metric
# Nếu không có → chưa cài prometheus-net hoặc chưa gọi app.UseHttpMetrics()
# Nếu connection refused → container chưa chạy hoặc sai port
```

**Bước 3 — Kiểm tra Prometheus đã scrape chưa:**
```
Mở trình duyệt: http://localhost:9090/targets
→ Tìm job "banking-api"
→ State phải là UP (xanh)
→ Nếu không có job → chưa reload Prometheus sau khi sửa prometheus.wsl.yml
→ Nếu UNKNOWN/DOWN → Prometheus không kết nối được đến container (sai tên host hoặc port)
```

**Bước 4 — Reload Prometheus nếu chưa:**
```bash
curl -X POST http://localhost:9090/-/reload
# Sau đó refresh http://localhost:9090/targets để kiểm tra
```

**Bước 5 — Kiểm tra metric tồn tại trong Prometheus:**
```
Mở: http://localhost:9090/graph
Query: http_requests_received_total{job="banking-api"}
→ Nếu không có data → API chưa nhận request nào, hoặc metric tên khác
→ Gửi 1 request thử: curl http://localhost:5066/api/health
→ Query lại sau 15s (bằng scrape_interval)
```

**Bước 6 — Refresh variable trong Grafana:**
```
Dashboard → click icon refresh (🔄) ở góc trên phải
HOẶC
Nhấn F5 để reload trang
→ $service dropdown phải xuất hiện "banking-api"
```

**Bảng tóm tắt nguyên nhân phổ biến:**

| Triệu chứng | Nguyên nhân | Fix |
|---|---|---|
| Dropdown không có banking-api | Metric chưa tồn tại trong Prometheus | Kiểm tra steps 1-5 |
| Prometheus target = UNKNOWN | Config chưa reload | `curl -X POST localhost:9090/-/reload` |
| Prometheus target = DOWN | Sai hostname/port hoặc container chưa chạy | Kiểm tra `docker ps`, sửa target |
| Target = UP nhưng dropdown vẫn không có | API không expose `http_requests_received_total` | Thêm `app.UseHttpMetrics()` |
| Target = UP, metric có, dropdown vẫn trống | Grafana variable chưa refresh | F5 hoặc click nút refresh dashboard |

---

### 6.9 Checklist đầy đủ khi thêm API mới

```
□ Step 1 — API code:
  □ Đã cài prometheus-net package chưa?
  □ Đã thêm app.UseHttpMetrics() chưa?
  □ Đã thêm app.MapMetrics("/metrics") chưa?
  □ curl http://localhost:{PORT}/metrics | grep http_requests_received_total → có data?

□ Step 2 — Docker:
  □ Đã thêm service vào docker-compose.wsl.yml chưa?
  □ Đã chạy: docker compose up -d {service-name} chưa?
  □ docker ps | grep {service-name} → Status = Up?
  □ docker logs {container-name} → không có error?

□ Step 3 — Prometheus:
  □ Đã thêm job_name vào prometheus.wsl.yml chưa?
  □ Đã reload: curl -X POST http://localhost:9090/-/reload chưa?
  □ http://localhost:9090/targets → job mới Status = UP?
  □ http://localhost:9090/graph → query http_requests_received_total{job="..."} có data?

□ Step 4 — Grafana:
  □ Đã F5 hoặc click refresh dashboard chưa?
  □ Dropdown $service → thấy job mới chưa?
  □ Gửi vài request đến API → graph cập nhật data chưa?
```

---

### 6.10 Lưu ý quan trọng về tên job_name

`job_name` trong `prometheus.wsl.yml` trở thành label `job` trong mọi metric:
```
http_requests_received_total{job="banking-api", code="200"} 42
```

Vì vậy:
- Đặt `job_name` = tên service trong docker-compose để nhất quán
- Không dùng dấu cách, dùng dấu `-` hoặc `_`
- Một khi đã có data, **đừng đổi tên** — Grafana sẽ mất lịch sử (label cũ và mới là 2 series khác nhau)

---

---

## 7. Quick Reference — Lệnh restart / reload hay dùng

### Prometheus

```bash
# [KHUYẾN NGHỊ] Reload config — không mất data, không ngắt scrape đang chạy
# Dùng sau khi sửa prometheus.wsl.yml (thêm job, đổi scrape_interval...)
curl -X POST http://localhost:9090/-/reload

# Restart container — chậm hơn (~5s), dùng khi reload không ăn
docker restart monitoring_prometheus

# Xem log Prometheus (hữu ích khi reload lỗi config)
docker logs monitoring_prometheus --tail 50

# Kiểm tra config hợp lệ trước khi reload (chạy trong container)
docker exec monitoring_prometheus promtool check config /etc/prometheus/prometheus.yml
```

**Khi nào dùng reload vs restart:**
| Tình huống | Dùng |
|---|---|
| Thêm/sửa scrape job | `curl -X POST /-/reload` |
| Sửa alert rules | `curl -X POST /-/reload` |
| Prometheus không phản hồi / bị treo | `docker restart monitoring_prometheus` |
| Cập nhật image Prometheus version mới | `docker compose up -d prometheus` |

---

### Grafana

```bash
# Restart Grafana — áp dụng khi sửa provisioning hoặc env var
docker restart monitoring_grafana

# Xem log Grafana (hữu ích khi dashboard không load, datasource lỗi)
docker logs monitoring_grafana --tail 50

# Reload provisioning config (datasource, dashboard) không cần restart
# Grafana 10.x: dùng API
curl -X POST http://admin:admin123@localhost:3000/api/admin/provisioning/dashboards/reload
curl -X POST http://admin:admin123@localhost:3000/api/admin/provisioning/datasources/reload
```

**Khi nào restart Grafana:**
| Tình huống | Dùng |
|---|---|
| Sửa file dashboard JSON (provisioning tự reload) | Không cần restart — Grafana watch file |
| Thêm datasource mới vào provisioning | `curl .../datasources/reload` hoặc restart |
| Sửa env var (GF_SECURITY_ADMIN_PASSWORD...) | `docker restart monitoring_grafana` |
| Grafana UI bị trắng / không load | `docker restart monitoring_grafana` |
| Cập nhật image Grafana version mới | `docker compose up -d grafana` |

---

### Toàn bộ stack

```bash
# Khởi động tất cả service (lần đầu hoặc sau khi down)
docker compose -f docker-compose.wsl.yml up -d

# Dừng tất cả (giữ nguyên data volumes)
docker compose -f docker-compose.wsl.yml down

# Restart tất cả service cùng lúc
docker compose -f docker-compose.wsl.yml restart

# Restart chỉ 1 service cụ thể
docker compose -f docker-compose.wsl.yml restart prometheus
docker compose -f docker-compose.wsl.yml restart grafana
docker compose -f docker-compose.wsl.yml restart shopapi

# Xem status tất cả container
docker compose -f docker-compose.wsl.yml ps

# Xem log realtime của 1 service
docker compose -f docker-compose.wsl.yml logs -f prometheus
docker compose -f docker-compose.wsl.yml logs -f grafana
docker compose -f docker-compose.wsl.yml logs -f shopapi

# Rebuild và restart 1 service (sau khi thay đổi code)
docker compose -f docker-compose.wsl.yml up -d --build shopapi
```

---

### Kiểm tra nhanh hệ thống

```bash
# Tất cả container có đang chạy không?
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# Prometheus có đang scrape đúng không?
# → Mở browser: http://localhost:9090/targets

# Grafana có up không?
curl -s http://localhost:3000/api/health | python3 -m json.tool
# Kỳ vọng: {"commit": "...", "database": "ok", "version": "10.4.2"}

# ShopApi /metrics có data không?
curl -s http://localhost:5065/metrics | grep "http_requests_received_total"

# BankingApi /metrics có data không?
curl -s http://localhost:5066/metrics | grep "http_requests_received_total"
```

---

*Tạo: 2026-06-10 | Cập nhật: 2026-06-10 — Refactor sang multi-service (Template Variable `$service` + `group by (job)`). Thêm banking-api vào prometheus.wsl.yml và docker-compose.wsl.yml.*
