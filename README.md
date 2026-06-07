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

**Custom metrics cho nghiệp vụ — Tại sao cần? Khi nào dùng?**

Built-in metrics (`http_request_duration_seconds`, `process_cpu_seconds_total`...) chỉ trả lời được câu hỏi về **infrastructure**: app có chạy không, có chậm không, có tốn RAM không.

Nhưng chúng **không thể** trả lời câu hỏi kinh doanh:

> *"Có bao nhiêu đơn hàng bị từ chối vì hết hàng trong 10 phút qua?"*
> *"Tỷ lệ thanh toán thất bại đang tăng hay giảm?"*
> *"Bao nhiêu user đang ở trong luồng checkout nhưng chưa hoàn tất?"*

Đây là lý do **custom metrics** tồn tại — để đưa logic nghiệp vụ vào hệ thống monitoring.

**Bộ câu hỏi xác định khi nào cần custom metric:**

| Câu hỏi | Nếu YES → cần custom metric |
|---|---|
| Built-in metrics có trả lời được không? | Nếu NO |
| Đây có phải thông tin cần alert khi có vấn đề? | Nếu YES |
| Team business/product có cần xem số này không? | Nếu YES |
| Nếu con số này bất thường, bạn có muốn biết ngay không? | Nếu YES |

---

**Use case thực tế theo domain:**

**E-commerce (ShopApi context):**
```
shopapi_orders_total{status}         → phát hiện spike lỗi "hết hàng" = có bug inventory
shopapi_checkout_abandoned_total     → user vào checkout nhưng không hoàn thành = UX có vấn đề
shopapi_coupon_applied_total{valid}  → tỷ lệ mã giảm giá hết hạn bị apply = bug validation
shopapi_payment_duration_seconds     → payment gateway chậm → cần switch provider
```

**Fintech / Ngân hàng:**
```
bank_transactions_total{type, status}    → giao dịch thất bại tăng đột biến = sự cố core banking
bank_fraud_score_histogram               → phân phối fraud score → điều chỉnh threshold
bank_kyc_pending_gauge                   → số hồ sơ KYC đang chờ xử lý → cần thêm nhân sự
bank_settlement_delay_seconds            → độ trễ quyết toán → vi phạm SLA với đối tác
```

**SaaS / B2B:**
```
saas_trial_conversions_total             → tỷ lệ chuyển đổi từ trial → paid
saas_api_quota_usage{tenant_id}          → tenant nào đang dùng gần đến giới hạn → upsell
saas_background_job_duration_seconds     → job email/report chậm → user không nhận được thông báo
saas_feature_flag_evaluations_total      → feature nào đang được dùng nhiều nhất
```

**Healthcare / EHR:**
```
ehr_prescription_pending_gauge           → đơn thuốc chờ duyệt → bác sĩ bị quá tải
ehr_critical_alert_delivery_seconds      → thời gian gửi cảnh báo nguy hiểm đến bác sĩ
ehr_sync_lag_seconds{source}             → dữ liệu từ thiết bị y tế bị trễ → nguy hiểm
```

**Nguyên tắc thiết kế custom metric:**

1. **Đặt tên theo chuẩn** `{app}_{domain}_{action}_{unit}` — ví dụ: `shopapi_order_processing_duration_seconds`
2. **Labels phải có cardinality thấp** — `{status="success|failed"}` ✅, `{user_id="123456"}` ❌ (hàng triệu giá trị → Prometheus OOM)
3. **Dùng đúng loại metric** — Counter cho thứ chỉ tăng, Gauge cho thứ tăng giảm, Histogram để tính P95/P99
4. **Đừng đo quá nhiều** — mỗi metric thêm vào là chi phí memory và scrape time. Chỉ đo thứ mà bạn sẽ thực sự dùng để ra quyết định

---

**Triển khai trong ShopApi** (`src/ShopApi/Metrics/ShopMetrics.cs`):

```csharp
// Khai báo static — tạo 1 lần khi app khởi động, dùng suốt lifecycle
public static class ShopMetrics
{
    // Counter: đếm tổng đơn hàng, chia theo kết quả xử lý
    // WHY: HTTP 400 không nói được lý do fail là hết hàng hay product không tồn tại
    public static readonly Counter OrdersTotal = Metrics
        .CreateCounter("shopapi_orders_total", "Tổng số đơn hàng",
            labelNames: new[] { "status" });
    // status: created | failed_empty | failed_not_found | failed_stock

    // Histogram: đo thời gian xử lý toàn bộ order — từ validate đến SaveChanges
    // WHY: http_request_duration_seconds đo từ nhận request đến trả response,
    //       không tách được phần nào tốn thời gian (validate? query DB? ghi DB?)
    public static readonly Histogram OrderProcessingDuration = Metrics
        .CreateHistogram("shopapi_order_processing_duration_seconds",
            "Thời gian xử lý đơn hàng end-to-end",
            new HistogramConfiguration
            {
                Buckets = [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0]
            });
}
```

**Dùng trong `OrdersController.cs`:**
```csharp
public async Task<IActionResult> CreateOrder([FromBody] CreateOrderDto dto)
{
    // NewTimer() tự động ghi duration vào histogram khi kết thúc using block
    // Dù return ở đâu (success/fail/exception), timer vẫn được ghi
    using var timer = ShopMetrics.OrderProcessingDuration.NewTimer();

    if (req.Items.Count == 0)
    {
        ShopMetrics.OrdersTotal.WithLabels("failed_empty").Inc();
        return BadRequest(new { message = "Giỏ hàng trống" });
    }

    // ... xử lý ...

    ShopMetrics.OrdersTotal.WithLabels("created").Inc();
    return CreatedAtAction(...);
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
>
> **Xem chi tiết tại: [Guide.md](Guide.md)**

