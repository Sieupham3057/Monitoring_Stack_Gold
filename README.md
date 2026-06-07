# Monitoring Stack — Nghiên cứu từ cơ bản đến nâng cao

> Tech Lead: .NET & Angular | Môi trường: VMware `192.168.1.35` (Docker)

---

## Mục lục

- [Mục tiêu](#mục-tiêu)
- [Monitoring Stack](#monitoring-stack)
- [Kiến trúc tổng thể](#kiến-trúc-tổng-thể)
- [Demo API — ShopApi (.NET 8)](#demo-api--shopapi-net-8)
- [Khái niệm quan trọng](#khái-niệm-quan-trọng--tech-lead-phải-biết)
- [Thứ tự học đề xuất](#thứ-tự-học-đề-xuất)
- [Môi trường](#môi-trường)
- [.NET Metrics — Expose ra Prometheus](#net-metrics--expose-ra-prometheus)
- **Hướng dẫn triển khai từng bước**
  - [Bước 1: Tạo ShopApi (.NET 8)](#-bước-1-tạo-shopapi-net-8)
  - [Bước 2: Prometheus + cAdvisor bằng Docker Compose](#-bước-2-prometheus--cadvisor-bằng-docker-compose)

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

## .NET Metrics — Expose ra Prometheus

### Tại sao cần expose `/metrics` từ app?

cAdvisor chỉ thấy metrics **bên ngoài container**: CPU, RAM, Network của cả process.
Nó **không biết** bên trong app đang xử lý bao nhiêu request/giây, có bao nhiêu đơn hàng lỗi, hay database pool đang dùng bao nhiêu connection.

Để Prometheus biết được những thứ đó, **chính app phải tự expose ra**:

```
Prometheus ──(scrape /metrics)──► ShopApi
                                  (app tự tính toán và trả về metrics của chính nó)
```

---

### Bốn loại metric cơ bản

Hiểu 4 loại này trước khi đọc code — đây là nền tảng của mọi monitoring system:

| Loại | Đặc điểm | Ví dụ thực tế |
|---|---|---|
| **Counter** | Chỉ tăng, không bao giờ giảm | Tổng request, tổng lỗi, tổng đơn hàng |
| **Gauge** | Tăng giảm tùy thời điểm | Active connections, queue size, RAM đang dùng |
| **Histogram** | Đo phân phối giá trị → tính P95/P99 | Request duration, response size |
| **Summary** | Giống Histogram nhưng tính percentile phía **client** (app) | Ít dùng hơn, tốn CPU hơn |

> **Tech Lead cần nhớ:** Counter dùng `rate()` trong PromQL để ra req/giây. Histogram dùng `histogram_quantile(0.95, ...)` để ra P95 latency. Gauge dùng trực tiếp.

---

### Hai cách expose metrics trong .NET

#### Cách 1 — `prometheus-net` (đơn giản, thuần Prometheus)

**Khi nào dùng:** Dự án chỉ dùng Prometheus, không cần multi-backend, muốn setup nhanh.

**Cài NuGet:**
```xml
<PackageReference Include="prometheus-net.AspNetCore" Version="8.*" />
```

**Đăng ký trong `Program.cs`:**
```csharp
// [BẮT BUỘC] Đăng ký metrics middleware
app.UseHttpMetrics();          // tự động đo duration, count mọi HTTP request
app.MapMetrics("/metrics");    // expose endpoint /metrics cho Prometheus scrape
```

**Built-in metrics có sẵn ngay** (không cần code thêm):
```
http_requests_received_total          → tổng request theo method, route, status code
http_request_duration_seconds         → histogram latency (dùng để tính P95/P99)
process_cpu_seconds_total             → CPU của .NET process
process_resident_memory_bytes         → RAM đang dùng
dotnet_collection_count_total         → số lần GC chạy
dotnet_total_memory_bytes             → tổng memory được allocate
```

**Custom metrics cho nghiệp vụ:**
```csharp
// Khai báo static — tạo 1 lần, dùng mãi
public static class ShopMetrics
{
    // Counter: đếm tổng đơn hàng, chia theo status
    public static readonly Counter OrdersTotal = Metrics
        .CreateCounter("shopapi_orders_total", "Tổng số đơn hàng",
            labelNames: new[] { "status" });   // label: success | failed

    // Gauge: số connection DB đang active
    public static readonly Gauge DbConnectionsActive = Metrics
        .CreateGauge("shopapi_db_connections_active", "DB connections đang dùng");

    // Histogram: đo thời gian xử lý order (ms)
    // Buckets định nghĩa các "nhóm" để tính percentile
    public static readonly Histogram OrderProcessingMs = Metrics
        .CreateHistogram("shopapi_order_processing_ms", "Thời gian xử lý đơn hàng (ms)",
            new HistogramConfiguration
            {
                Buckets = Histogram.LinearBuckets(start: 10, width: 50, count: 10)
                // → tạo buckets: 10, 60, 110, 160, 210, 260, 310, 360, 410, 460 ms
            });
}
```

**Dùng trong `OrdersController.cs`:**
```csharp
public async Task<IActionResult> CreateOrder([FromBody] CreateOrderDto dto)
{
    using var timer = ShopMetrics.OrderProcessingMs.NewTimer(); // tự động đo thời gian
    try
    {
        var order = await _orderService.CreateAsync(dto);
        ShopMetrics.OrdersTotal.WithLabels("success").Inc();   // tăng counter
        return Ok(order);
    }
    catch (Exception ex)
    {
        ShopMetrics.OrdersTotal.WithLabels("failed").Inc();    // đếm lỗi riêng
        throw;
    }
}
```

**Query PromQL sau khi có data:**
```promql
# Req/giây của ShopApi (tính trong 5 phút gần nhất)
rate(http_requests_received_total{job="shopapi"}[5m])

# P95 latency của endpoint tạo order
histogram_quantile(0.95,
  rate(http_request_duration_seconds_bucket{handler="/api/orders"}[5m])
)

# Tổng đơn hàng thành công theo phút
rate(shopapi_orders_total{status="success"}[1m]) * 60

# Tỷ lệ lỗi
rate(shopapi_orders_total{status="failed"}[5m])
/ rate(shopapi_orders_total[5m]) * 100
```

---

#### Cách 2 — OpenTelemetry (chuẩn industry, vendor-neutral)

**Khi nào dùng:** Dự án cần gửi telemetry tới nhiều backend (vừa Prometheus, vừa Jaeger, vừa Azure Monitor...). Đây là hướng Microsoft khuyến nghị cho .NET 8+.

**Cài NuGet:**
```xml
<PackageReference Include="OpenTelemetry.Extensions.Hosting" Version="1.*" />
<PackageReference Include="OpenTelemetry.Instrumentation.AspNetCore" Version="1.*" />
<PackageReference Include="OpenTelemetry.Instrumentation.Runtime" Version="1.*" />
<PackageReference Include="OpenTelemetry.Exporter.Prometheus.AspNetCore" Version="1.*-rc*" />
```

**Đăng ký trong `Program.cs`:**
```csharp
builder.Services.AddOpenTelemetry()
    .WithMetrics(metrics => metrics
        // [BẮT BUỘC] Metrics HTTP của ASP.NET Core (request count, duration)
        .AddAspNetCoreInstrumentation()
        // [KHUYẾN NGHỊ] GC, thread pool, exception count của .NET runtime
        .AddRuntimeInstrumentation()
        // [BẮT BUỘC] Expose /metrics endpoint cho Prometheus
        .AddPrometheusExporter()
        // [TÙY CHỌN] Đăng ký custom Meter của bạn
        .AddMeter("ShopApi")
    );

// Đăng ký endpoint scrape
app.MapPrometheusScrapingEndpoint("/metrics");
```

**Custom metrics dùng `System.Diagnostics.Metrics` (built-in .NET 6+):**
```csharp
// Meter là "factory" tạo ra các instrument đo lường
// Tên meter phải khớp với .AddMeter("ShopApi") ở trên
public class OrderMetrics
{
    private readonly Counter<long> _ordersTotal;
    private readonly Histogram<double> _processingMs;
    private readonly ObservableGauge<int> _activeConnections;

    public OrderMetrics(IMeterFactory meterFactory)
    {
        // [KHUYẾN NGHỊ] Dùng IMeterFactory thay vì new Meter() trực tiếp
        // để tích hợp với DI và lifecycle management
        var meter = meterFactory.Create("ShopApi");

        _ordersTotal = meter.CreateCounter<long>(
            "shopapi.orders.total",           // tên theo chuẩn OpenTelemetry: dùng dấu chấm
            unit: "orders",
            description: "Tổng số đơn hàng");

        _processingMs = meter.CreateHistogram<double>(
            "shopapi.order.processing_duration",
            unit: "ms",
            description: "Thời gian xử lý đơn hàng");

        // ObservableGauge: tự động gọi callback mỗi khi scrape
        _activeConnections = meter.CreateObservableGauge<int>(
            "shopapi.db.connections_active",
            observeValue: () => DbConnectionPool.ActiveCount,  // đọc giá trị hiện tại
            unit: "connections");
    }

    public void RecordOrder(string status, double durationMs)
    {
        _ordersTotal.Add(1, new TagList { { "status", status } });
        _processingMs.Record(durationMs, new TagList { { "status", status } });
    }
}
```

**Đăng ký DI:**
```csharp
builder.Services.AddSingleton<OrderMetrics>();
```

---

### So sánh hai cách

| Tiêu chí | `prometheus-net` | OpenTelemetry |
|---|---|---|
| **Setup** | Nhanh, ít code | Phức tạp hơn một chút |
| **API** | Prometheus-specific | Chuẩn OpenTelemetry (vendor-neutral) |
| **Multi-backend** | Chỉ Prometheus | Prometheus + Jaeger + Azure + OTLP... |
| **Built-in metrics** | Tốt (process, GC, HTTP) | Rất tốt + runtime instrumentation |
| **Microsoft hỗ trợ** | Community | Chính thức (Microsoft là contributor) |
| **Khi nào chọn** | Stack thuần Prometheus | Muốn thêm tracing, hoặc đa cloud |

> **Khuyến nghị cho dự án này:** Dùng **prometheus-net** cho Bước 7 vì đơn giản, đủ dùng, và thấy rõ cơ chế. Sau khi hiểu xong, nâng lên OpenTelemetry là dễ dàng.

---

### Prometheus scrape ShopApi như thế nào?

Sau khi ShopApi expose `/metrics`, cập nhật `prometheus.yml`:

```yaml
scrape_configs:
  - job_name: 'shopapi'
    static_configs:
      - targets: ['shopapi:8080']   # tên service trong docker-compose
        labels:
          app: 'shopapi'
          env: 'production'
```

Prometheus sẽ gọi `http://shopapi:8080/metrics` mỗi 15s và lưu toàn bộ metrics vào TSDB.

---

## Thứ tự học đề xuất

| # | Tên bước | Branch | Trạng thái |
|---|---|---|---|
| 1 | Tạo ShopApi (.NET 8) để có API thực tế | `buoc-1-tao-shopapi-dotnet8` | ✅ Done |
| 2 | Chạy Prometheus + cAdvisor bằng Docker Compose | `buoc-2-prometheus-cadvisor-docker` | ✅ Done |
| 3 | Kết nối Grafana → Prometheus, tạo dashboard đầu tiên | `buoc-3-grafana-prometheus-dashboard` | ⬜ Todo |
| 4 | Cấu hình AlertManager (alert rule + Slack notification) | `buoc-4-alertmanager-slack` | ⬜ Todo |
| 5 | Cài InfluxDB, viết K6 script load test ShopApi | `buoc-5-influxdb-k6-loadtest` | ⬜ Todo |
| 6 | Kết nối Grafana → InfluxDB, xem P95/P99 của K6 | `buoc-6-grafana-influxdb-k6-metrics` | ⬜ Todo |
| 7 | Expose .NET metrics ra Prometheus (prometheus-net / OpenTelemetry) | `buoc-7-dotnet-prometheus-metrics` | ⬜ Todo |
| 8 | Dashboard tổng hợp — 1 màn hình thấy toàn bộ hệ thống | `buoc-8-dashboard-tong-hop` | ⬜ Todo |

### Quy ước đặt tên branch

```
buoc-{số}-{mô-tả-ngắn-không-dấu}
```

- Viết thường, không dấu tiếng Việt
- Dùng `-` thay dấu cách
- Mỗi bước = 1 branch riêng, commit khi hoàn thành bước đó

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

---

## Hướng dẫn triển khai từng bước

> Mỗi bước được ghi lại đầy đủ: cấu hình, lệnh, kiểm tra, và bài thực hành.

---

### ✅ Bước 1: Tạo ShopApi (.NET 8)

Xem hướng dẫn chi tiết tại phần [Demo API — ShopApi (.NET 8)](#demo-api--shopapi-net-8) phía trên.

**Kết quả đạt được:** ShopApi + SQL Server chạy trên Docker, Swagger UI tại `http://192.168.1.35:5065`.

---

### ✅ Bước 2: Prometheus + cAdvisor bằng Docker Compose

#### Mục tiêu bước này

Sau bước này bạn sẽ:
- Hiểu cơ chế **pull-based** của Prometheus (ngược với push-based của InfluxDB)
- Có Prometheus scrape được metrics container từ cAdvisor
- Biết cách đọc và query metrics bằng **PromQL** cơ bản
- Nhìn thấy CPU/RAM của từng container trong thời gian thực

#### Cấu trúc file mới

```
MORNITORING/
├── docker-compose.yml                    ← Bổ sung prometheus + cadvisor
└── src/
    └── monitoring/
        └── prometheus/
            └── prometheus.yml            ← [MỚI] Cấu hình scrape targets
```

---

#### File cấu hình: `src/monitoring/prometheus/prometheus.yml`

```yaml
global:
  scrape_interval: 15s      # Cứ 15s Prometheus gọi /metrics của từng target
  evaluation_interval: 15s  # Cứ 15s tính toán alert rules

scrape_configs:
  - job_name: 'prometheus'   # Prometheus tự monitor chính mình
    static_configs:
      - targets: ['localhost:9090']

  - job_name: 'cadvisor'     # metrics Docker containers
    static_configs:
      - targets: ['cadvisor:8080']
        labels:
          host: '192.168.1.35'
```

**Tại sao dùng `cadvisor:8080` thay vì `192.168.1.35:8080`?**

Docker Compose tạo một internal DNS. Mỗi service có thể gọi nhau bằng **tên service** (`cadvisor`, `prometheus`, `shopapi`...). Dùng tên service thay vì IP vì:
- IP có thể thay đổi mỗi lần restart
- Tên service được resolve ngay trong Docker network, không đi ra ngoài host

---

#### Giải thích các service trong `docker-compose.yml`

**Prometheus:**

```yaml
prometheus:
  image: prom/prometheus:v2.51.2
  volumes:
    - ./src/monitoring/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml:ro
    - prometheus_data:/prometheus      # persist metrics data
  command:
    - '--storage.tsdb.retention.time=15d'   # xóa data cũ hơn 15 ngày
    - '--web.enable-lifecycle'              # cho phép POST /-/reload
```

> `--web.enable-lifecycle` rất quan trọng trong thực tế: thay vì restart container mỗi khi sửa `prometheus.yml`, bạn chỉ cần chạy `curl -X POST http://192.168.1.35:9090/-/reload` là Prometheus reload config tại chỗ — **zero downtime**.

**cAdvisor:**

```yaml
cadvisor:
  image: gcr.io/cadvisor/cadvisor:v0.49.1
  privileged: true          # cần đọc cgroups, namespace của kernel
  volumes:
    - /:/rootfs:ro          # filesystem host (đọc disk usage)
    - /var/run:/var/run:ro  # Docker daemon socket
    - /sys:/sys:ro          # thông tin cgroups (CPU, memory limits)
    - /var/lib/docker/:/var/lib/docker:ro  # metadata containers
```

> cAdvisor cần `privileged: true` vì nó đọc **cgroups** — cơ chế kernel Linux dùng để cô lập tài nguyên cho container. Không có quyền này, nó không đọc được CPU/RAM thật của từng container.

---

#### Triển khai lên server VMware

**Bước 2.1 — Upload code lên server** (nếu chưa có)

```bash
# Trên máy Windows của bạn — copy toàn bộ project lên server
scp -r e:/TECHLEAD_PROJECT/MORNITORING user@192.168.1.35:/opt/monitoring
```

**Bước 2.2 — SSH vào server và chạy**

```bash
# SSH vào VMware
ssh user@192.168.1.35

# Di chuyển vào thư mục project
cd /opt/monitoring

# Pull image và khởi động các service mới (không làm gián đoạn service cũ)
docker compose up -d prometheus cadvisor

# Xem log xem có lỗi không
docker compose logs -f prometheus cadvisor
```

> **Tại sao dùng `docker compose up -d prometheus cadvisor` thay vì `docker compose up -d`?**
>
> Khi chỉ định tên service, Docker Compose chỉ start/restart đúng các service đó. Giúp không làm gián đoạn `shopapi` và `sqlserver` đang chạy từ Bước 1.

**Bước 2.3 — Kiểm tra service đã chạy**

```bash
# Xem trạng thái tất cả container
docker compose ps

# Kết quả mong đợi:
# NAME                     STATUS          PORTS
# monitoring_cadvisor      Up              0.0.0.0:8080->8080/tcp
# monitoring_prometheus    Up              0.0.0.0:9090->9090/tcp
# monitoring_shopapi       Up              0.0.0.0:5065->8080/tcp
# monitoring_sqlserver     Up (healthy)    0.0.0.0:1433->1433/tcp
```

---

#### Kiểm tra hoạt động

**Kiểm tra 1 — Prometheus UI:**

Mở trình duyệt: `http://192.168.1.35:9090`

Vào **Status → Targets** — bạn phải thấy:
- `prometheus (1/1 up)` — Prometheus tự scrape chính nó
- `cadvisor (1/1 up)` — Prometheus scrape được cAdvisor

Nếu thấy `UNKNOWN` hoặc `DOWN` → xem log: `docker compose logs prometheus`

**Kiểm tra 2 — cAdvisor UI:**

Mở trình duyệt: `http://192.168.1.35:8080`

Bạn sẽ thấy danh sách container và biểu đồ CPU/RAM thời gian thực.

---

#### Thực hành: Query PromQL đầu tiên

Vào Prometheus UI → tab **Graph** → thử các query sau:

**Query 1 — CPU usage của tất cả container:**
```promql
rate(container_cpu_usage_seconds_total{image!=""}[5m])
```
> `rate()` tính tốc độ thay đổi trong 5 phút. `image!=""` lọc bỏ các process system không phải container thật.

**Query 2 — RAM đang dùng (bytes) theo container:**
```promql
container_memory_usage_bytes{image!=""}
```
> Chia cho `1024*1024` để đổi sang MB:
> ```promql
> container_memory_usage_bytes{image!=""} / 1024 / 1024
> ```

**Query 3 — Số container đang chạy:**
```promql
count(container_last_seen{image!=""})
```

**Query 4 — CPU của riêng ShopApi:**
```promql
rate(container_cpu_usage_seconds_total{name="monitoring_shopapi"}[5m]) * 100
```

**Query 5 — Prometheus scrape được bao nhiêu metric:**
```promql
prometheus_tsdb_head_series
```
> Con số này cho biết Prometheus đang theo dõi bao nhiêu time-series. Bình thường với cAdvisor sẽ vào khoảng vài nghìn series.

---

#### Reload config không cần restart

Khi bạn sửa `prometheus.yml` (thêm target mới), không cần restart container:

```bash
# Reload config Prometheus tại chỗ
curl -X POST http://192.168.1.35:9090/-/reload

# Kiểm tra config có lỗi syntax trước khi reload
docker run --rm \
  -v /opt/monitoring/src/monitoring/prometheus/prometheus.yml:/prometheus.yml \
  prom/prometheus:v2.51.2 \
  promtool check config /prometheus.yml
```

---

#### Khái niệm cốt lõi — Tech Lead cần nắm

| Khái niệm | Ý nghĩa |
|---|---|
| **Pull vs Push** | Prometheus chủ động gọi target lấy data (pull). InfluxDB nhận data được gửi tới (push). |
| **Scrape interval** | Tần suất Prometheus poll metrics. Nhỏ hơn = chi tiết hơn nhưng tốn tài nguyên hơn. |
| **job_name** | Nhãn phân loại target. Dùng để filter trong Grafana sau này. |
| **cgroups** | Cơ chế Linux kernel cô lập CPU/RAM/Network cho container. cAdvisor đọc trực tiếp từ đây. |
| **time-series** | Mỗi cặp `{metric_name + labels}` = 1 time-series. Prometheus lưu dạng (timestamp, value). |
| **PromQL** | Ngôn ngữ query của Prometheus. Cú pháp khác SQL — làm quen dần qua Graph UI. |

---

#### Bài tập kiểm tra hiểu biết

1. Vào Prometheus UI → **Status → Configuration** — đọc và giải thích từng phần trong config hiển thị
2. Vào **Status → TSDB Status** — xem có bao nhiêu series đang được lưu, top 10 metric chiếm nhiều series nhất
3. Thử tắt cAdvisor: `docker compose stop cadvisor` → chờ 30s → vào Targets xem trạng thái đổi thế nào → bật lại: `docker compose start cadvisor`
4. Mở cAdvisor UI (`http://192.168.1.35:8080`) → click vào container `monitoring_shopapi` → quan sát biểu đồ CPU/Memory thời gian thực

**Kết quả bước 2:** Prometheus đang thu thập metrics từ cAdvisor mỗi 15 giây, bạn có thể query bằng PromQL. Bước 3 sẽ kết nối Grafana để vẽ dashboard trực quan hơn.
