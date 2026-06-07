# Mục lục

- [.NET Metrics — Expose ra Prometheus](#net-metrics--expose-ra-prometheus)
  - [Tại sao cần expose `/metrics` từ app?](#tại-sao-cần-expose-metrics-từ-app)
  - [Bốn loại metric cơ bản](#bốn-loại-metric-cơ-bản)
  - [Hai cách expose metrics trong .NET](#hai-cách-expose-metrics-trong-net)
    - [Cách 1 — prometheus-net](#cách-1--prometheus-net-đơn-giản-thuần-prometheus)
    - [Cách 2 — OpenTelemetry](#cách-2--opentelemetry-chuẩn-industry-vendor-neutral)
  - [So sánh hai cách](#so-sánh-hai-cách)
  - [Prometheus scrape ShopApi như thế nào?](#prometheus-scrape-shopapi-như-thế-nào)
- [Hướng dẫn triển khai từng bước](#hướng-dẫn-triển-khai-từng-bước)
  - [Bước 1: Tạo ShopApi (.NET 8)](#-bước-1-tạo-shopapi-net-8)
  - [Bước 2: Prometheus + cAdvisor bằng Docker Compose](#-bước-2-prometheus--cadvisor-bằng-docker-compose)
    - [Mục tiêu](#mục-tiêu-bước-này)
    - [Cấu trúc file mới](#cấu-trúc-file-mới)
    - [File cấu hình prometheus.yml](#file-cấu-hình-srcmonitoringprometheus prometheusyml)
    - [Triển khai lên server VMware](#triển-khai-lên-server-vmware)
    - [Kiểm tra hoạt động](#kiểm-tra-hoạt-động)
    - [Thực hành: Query PromQL đầu tiên](#thực-hành-query-promql-đầu-tiên)
    - [Khái niệm cốt lõi](#khái-niệm-cốt-lõi--tech-lead-cần-nắm)
    - [Bài tập kiểm tra hiểu biết](#bài-tập-kiểm-tra-hiểu-biết)
    - [Troubleshooting cAdvisor](#troubleshooting--cadvisor-lỗi-permission-với-non-root-user)
  - [Bước 3: Kết nối Grafana → Prometheus, tạo dashboard đầu tiên](#-bước-3-kết-nối-grafana--prometheus-tạo-dashboard-đầu-tiên)
    - [Tại sao cần Grafana?](#tại-sao-cần-grafana-prometheus-ui-không-đủ-sao)
    - [Provisioning — IaC cho Grafana](#khái-niệm-provisioning--iac-cho-grafana)
    - [Cấu trúc file mới](#cấu-trúc-file-mới-1)
    - [Triển khai lên server VMware](#triển-khai-lên-server-vmware-1)
    - [Kiểm tra hoạt động](#kiểm-tra-hoạt-động-1)
    - [Thực hành: Tạo panel đầu tiên bằng tay](#thực-hành-tạo-panel-đầu-tiên-bằng-tay)
    - [Khái niệm cốt lõi](#khái-niệm-cốt-lõi--tech-lead-cần-nắm-1)
    - [Troubleshooting Grafana](#troubleshooting--các-lỗi-hay-gặp)
    - [Bài tập kiểm tra hiểu biết](#bài-tập-kiểm-tra-hiểu-biết-1)

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

# Hướng dẫn triển khai từng bước

> Mỗi bước được ghi lại đầy đủ: cấu hình, lệnh, kiểm tra, và bài thực hành.

---

### ✅ Bước 1: Tạo ShopApi (.NET 8)

Xem hướng dẫn chi tiết tại phần [Demo API — ShopApi (.NET 8)](README.md#demo-api--shopapi-net-8) trong README.

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
  # Job 1: Prometheus tự monitor chính mình
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']

  # Job 2: cAdvisor — metrics CPU/RAM/Network của Docker containers
  - job_name: 'cadvisor'
    static_configs:
      - targets: ['cadvisor:8080']
        labels:
          host: '192.168.1.35'

  # Job 3: ShopApi — metrics nghiệp vụ qua prometheus-net (thêm ở Bước 7)
  # Expose tại: http://shopapi:8080/metrics
  - job_name: 'shopapi'
    static_configs:
      - targets: ['shopapi:8080']
        labels:
          app: 'shopapi'
          env: 'production'
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
  command:
    # Ubuntu 22.04+ Docker dùng containerd snapshotter — phải dùng containerd factory
    - '--containerd=/var/run/containerd/containerd.sock'
    # Docker containers chạy trong namespace "moby" của containerd
    - '--containerd-namespace=moby'
  volumes:
    - /:/rootfs:ro          # filesystem host (đọc disk usage)
    - /var/run/docker.sock:/var/run/docker.sock  # Docker socket (không :ro)
    - /var/run:/var/run:ro  # chứa containerd.sock tại /var/run/containerd/containerd.sock
    - /sys:/sys:ro          # thông tin cgroups (CPU, memory limits)
    - /sys/fs/cgroup:/sys/fs/cgroup:ro  # cgroup v2 hierarchy (Ubuntu 22.04+)
    - /var/lib/docker/:/var/lib/docker:ro  # metadata containers
    - /dev/disk/:/dev/disk:ro             # thông tin disk I/O
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
> `rate()` tính tốc độ thay đổi trong 5 phút. `image!=""` lọc bỏ process system, chỉ giữ Docker container thật.

**Query 2 — RAM đang dùng (bytes) theo container:**
```promql
container_memory_usage_bytes{image!=""} / 1024 / 1024
```
> Đã chia sẵn ra MB.

**Query 3 — Số container đang chạy:**
```promql
count(container_memory_usage_bytes{image!=""})
```
> `container_last_seen` không được export khi dùng containerd factory. Dùng `container_memory_usage_bytes{image!=""}` thay thế — mọi container đang chạy đều có metric này.

**Query 4 — CPU của riêng ShopApi:**
```promql
rate(container_cpu_usage_seconds_total{image=~".*shopapi.*"}[5m]) * 100
```
> Khi cAdvisor dùng **containerd factory** (Ubuntu 22.04+ với Docker containerd snapshotter), label `container_label_com_docker_compose_service` **không được export**. cAdvisor containerd factory chỉ đọc container metadata từ containerd, không đọc Docker labels. Filter đúng là dùng label `image` với regex match.
>
> **Bảng so sánh cách filter container (containerd factory):**
>
> | Mục tiêu | Label filter | Ví dụ |
> |---|---|---|
> | Theo tên image | `image=~".*pattern.*"` | `=~".*shopapi.*"` |
> | Tất cả Docker container | `image!=""` | — |
> | Theo cgroup path | `id=~"/system.slice/docker-.+\\.scope"` | (lọc Docker containers) |
>
> **Lưu ý:** `container_label_com_docker_compose_service` chỉ có khi cAdvisor dùng **Docker factory** (không phải containerd factory). Trên Ubuntu 22.04+ với Docker containerd snapshotter, phải dùng filter theo `image`.

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

---

#### Troubleshooting — cAdvisor lỗi permission với non-root user

Nếu bạn chạy với user không phải `root` (ví dụ user `bank`), cAdvisor hay gặp lỗi permission. Có **3 nguyên nhân độc lập**, mỗi cái có cách fix riêng.

---

**Bước 0 — Chẩn đoán: lỗi thuộc loại nào?**

```bash
# Xem log cAdvisor ngay sau khi start
docker compose logs cadvisor 2>&1 | head -50

# Các pattern lỗi phổ biến:
# "permission denied"  → Nguyên nhân 1 hoặc 3
# "no such file"       → Nguyên nhân 2 (cgroup v2)
# "operation not permitted" → Nguyên nhân 3 (AppArmor)
```

---

**Nguyên nhân 0 — cAdvisor thấy system cgroups nhưng không thấy Docker container metadata** *(hay gặp, dễ bỏ qua)*

**Triệu chứng:** Query `{image!=""}` hoặc `{name!=""}` trả về rỗng. `container_memory_usage_bytes` chỉ thấy entries `/system.slice/...`, không thấy `name="monitoring_shopapi"`.

**Tại sao xảy ra:**
Mount `/var/run:/var/run:ro` đôi khi không đủ để cAdvisor kết nối Docker socket bên trong container do thứ tự mount hoặc permission của socket file. cAdvisor vẫn đọc được cgroups Linux (nên thấy system data) nhưng không lấy được Docker metadata (image name, container name).

**Fix thực sự (Ubuntu 22.04+ với Docker containerd snapshotter):**

Ubuntu 22.04+ dùng Docker với `containerd snapshotter` (`driver-type: io.containerd.snapshotter.v1`). cAdvisor Docker factory đọc sai đường dẫn layer metadata → phải dùng **containerd factory** với namespace `moby`:

```yaml
cadvisor:
  command:
    - '--containerd=/var/run/containerd/containerd.sock'
    - '--containerd-namespace=moby'   # Docker containers nằm trong namespace "moby"
  volumes:
    - /var/run/docker.sock:/var/run/docker.sock  # không :ro
    - /var/run:/var/run:ro  # chứa containerd.sock
    - /sys/fs/cgroup:/sys/fs/cgroup:ro  # cgroup v2
    - ...
```

```bash
# Apply fix
docker compose up -d --force-recreate cadvisor

# Xác nhận: phải thấy container Docker trong output
curl -s http://localhost:8080/metrics | grep 'name="monitoring_shopapi"' | head -3
```

**Tại sao namespace là `moby`?** Docker Engine đặt tên namespace `moby` cho toàn bộ Docker containers khi chạy trên containerd. Khác với Kubernetes dùng namespace `k8s.io`. cAdvisor mặc định tìm ở `k8s.io` nên không thấy Docker containers.

---

**Nguyên nhân 1 — User không có quyền chạy Docker** *(phổ biến nhất)*

**Tại sao xảy ra:**
Docker daemon chạy dưới quyền `root`. Để user thường (`bank`) chạy `docker compose`, họ phải thuộc group `docker`. Nếu không → mọi lệnh `docker` đều báo `permission denied`.

`privileged: true` trong docker-compose chỉ cấp quyền **bên trong container**, không liên quan đến quyền của user chạy lệnh docker trên host.

```bash
# Kiểm tra user hiện tại có trong group docker chưa
groups $USER
# Nếu thấy "docker" trong danh sách → đã đúng
# Nếu không thấy → cần fix

# Fix: thêm user hiện tại vào group docker
sudo usermod -aG docker $USER

# Áp dụng ngay mà không cần logout
newgrp docker

# Xác nhận lại
groups $USER   # phải thấy "docker"
docker ps      # phải chạy được không cần sudo
```

> Nếu dùng `newgrp docker` mà vẫn lỗi → logout và SSH lại để session nhận group mới.

---

**Nguyên nhân 2 — cgroup v2 (Ubuntu 22.04+ / Debian 11+)**

**Tại sao xảy ra:**
Ubuntu 22.04 trở lên dùng **cgroup v2** thay vì v1. cAdvisor cần mount thêm đường dẫn `/sys/fs/cgroup` để đọc được resource limits. Thiếu mount này → metrics CPU/memory của container bị trống hoặc báo lỗi.

```bash
# Kiểm tra VM đang dùng cgroup v1 hay v2
stat -fc %T /sys/fs/cgroup/
# "cgroup2fs" → đang dùng cgroup v2 → cần fix
# "tmpfs"     → đang dùng cgroup v1 → không cần fix này
```

Nếu là cgroup v2, cập nhật service `cadvisor` trong `docker-compose.yml`:

```yaml
cadvisor:
  image: gcr.io/cadvisor/cadvisor:v0.49.1
  privileged: true
  volumes:
    - /:/rootfs:ro
    - /var/run:/var/run:ro
    - /sys:/sys:ro
    - /var/lib/docker/:/var/lib/docker:ro
    - /dev/disk/:/dev/disk:ro
    # [BẮT BUỘC nếu dùng cgroup v2] Mount trực tiếp cgroup v2 hierarchy
    - /sys/fs/cgroup:/sys/fs/cgroup:ro
  devices:
    - /dev/kmsg
```

---

**Nguyên nhân 3 — AppArmor chặn privileged container** *(Ubuntu)*

**Tại sao xảy ra:**
Ubuntu có AppArmor — một hệ thống kiểm soát truy cập bắt buộc (MAC) ở kernel level. Dù container đã khai báo `privileged: true`, AppArmor vẫn có thể chặn một số syscall cụ thể mà cAdvisor cần (đọc `/proc`, `/sys`...).

```bash
# Kiểm tra AppArmor có đang chặn docker không
sudo aa-status | grep docker
# hoặc xem kernel log
sudo dmesg | grep -i "apparmor.*DENIED" | tail -20
```

Nếu thấy `DENIED` liên quan đến docker/container, thêm vào `cadvisor` trong docker-compose:

```yaml
cadvisor:
  image: gcr.io/cadvisor/cadvisor:v0.49.1
  privileged: true
  # [TÙY CHỌN] Tắt AppArmor confinement cho container này
  # Chỉ dùng nếu đã xác nhận AppArmor là nguyên nhân
  security_opt:
    - apparmor:unconfined
  volumes:
    - /:/rootfs:ro
    - /var/run:/var/run:ro
    - /sys:/sys:ro
    - /var/lib/docker/:/var/lib/docker:ro
    - /dev/disk/:/dev/disk:ro
  devices:
    - /dev/kmsg
```

---

**Checklist fix nhanh cho user `bank` (hoặc bất kỳ non-root user nào):**

```bash
# 1. Thêm vào docker group
sudo usermod -aG docker $USER && newgrp docker

# 2. Kiểm tra cgroup version
stat -fc %T /sys/fs/cgroup/

# 3. Restart cAdvisor sau khi fix
docker compose restart cadvisor

# 4. Xác nhận cAdvisor đang scrape được
curl -s http://localhost:8080/metrics | grep container_cpu | head -5
# Nếu thấy data → đã fix xong

# 5. Xác nhận Prometheus thấy cAdvisor là UP
curl -s http://localhost:9090/api/v1/targets | grep cadvisor
```

---

### ✅ Bước 3: Kết nối Grafana → Prometheus, tạo dashboard đầu tiên

#### Mục tiêu bước này

Sau bước này bạn sẽ:
- Hiểu tại sao cần Grafana — Prometheus chỉ lưu data, Grafana mới **vẽ thành biểu đồ có nghĩa**
- Hiểu khái niệm **Provisioning** — cấu hình Grafana bằng file YAML thay vì bấm tay trên UI
- Có dashboard tự động load khi container khởi động — không bị mất khi rebuild
- Biết cách đọc CPU/RAM/Network của từng container theo thời gian thực

---

#### Tại sao cần Grafana? Prometheus UI không đủ sao?

Prometheus UI (`:9090`) chỉ phù hợp để **debug và khám phá** — chạy query, xem target, kiểm tra alert.

Grafana giải quyết những điểm yếu đó:

| Vấn đề với Prometheus UI | Grafana giải quyết thế nào |
|---|---|
| Mỗi lần reload trang mất query | Dashboard lưu vĩnh viễn, share được link |
| Chỉ 1 biểu đồ 1 lúc | Nhiều panel cùng lúc trên 1 màn hình |
| Không có màu sắc, threshold rõ ràng | Alert coloring, threshold lines, annotations |
| Khó so sánh nhiều metric cùng lúc | Multi-datasource: Prometheus + InfluxDB + ... |
| Không có access control | User/Team/Organization permissions |

> **Tech Lead cần nhớ:** Grafana không lưu data — nó chỉ **query và vẽ**. Data vẫn sống trong Prometheus. Nếu Prometheus down, Grafana trắng panel. Đây là điểm thiết kế quan trọng khi thiết kế HA.

---

#### Khái niệm Provisioning — IaC cho Grafana

**Provisioning** = cấu hình Grafana thông qua file YAML/JSON thay vì bấm tay trên UI.

```
Không có Provisioning:
  Container restart → mất toàn bộ datasource, dashboard tạo tay

Có Provisioning:
  Container restart → Grafana đọc lại file → khôi phục hoàn toàn
```

**Hai loại provisioning quan trọng:**

| Loại | File | Tác dụng |
|---|---|---|
| **Datasource** | `provisioning/datasources/*.yml` | Tự động kết nối tới Prometheus (hoặc InfluxDB, Loki...) |
| **Dashboard** | `provisioning/dashboards/*.yml` + `dashboards/*.json` | Tự động import dashboard từ file JSON |

> **Đây là cách làm đúng trong production** — mọi config được commit vào git, team nào cũng dùng cùng một bộ dashboard, không ai "vô tình xóa" dashboard đang dùng.

---

#### Cấu trúc file mới

```
MORNITORING/
├── docker-compose.yml                         ← Bổ sung service grafana + volume grafana_data
└── src/
    └── monitoring/
        ├── prometheus/
        │   └── prometheus.yml
        └── grafana/
            ├── provisioning/
            │   ├── datasources/
            │   │   └── prometheus.yml         ← [MỚI] Auto-connect tới Prometheus
            │   └── dashboards/
            │       └── dashboard.yml          ← [MỚI] Khai báo nơi chứa dashboard JSON
            └── dashboards/
                └── monitoring-overview.json   ← [MỚI] Dashboard pre-built: CPU/RAM/Network
```

---

#### File cấu hình: `src/monitoring/grafana/provisioning/datasources/prometheus.yml`

```yaml
apiVersion: 1

datasources:
  - name: Prometheus
    # [BẮT BUỘC] Loại plugin — Grafana dùng đúng query engine
    type: prometheus

    # [BẮT BUỘC] proxy = Grafana server gọi Prometheus thay browser
    # Quan trọng trong Docker: browser của bạn không cần biết địa chỉ Prometheus nội bộ
    access: proxy

    # [BẮT BUỘC] URL nội bộ Docker — "prometheus" là tên service trong docker-compose
    url: http://prometheus:9090

    # [KHUYẾN NGHỊ] Mặc định — tự chọn khi tạo panel mới
    isDefault: true

    jsonData:
      # POST tránh lỗi "URI too long" với query PromQL phức tạp
      httpMethod: POST
      # Gợi ý khoảng cách tối thiểu giữa 2 data point — phải khớp scrape_interval
      timeInterval: "15s"
```

> **Tại sao `access: proxy` chứ không phải `direct`?**
>
> Với `direct`, browser của bạn gọi thẳng `http://prometheus:9090` — địa chỉ này chỉ có nghĩa trong Docker network, không resolve được từ máy tính của bạn. Với `proxy`, Grafana server (trong container) đứng ra gọi thay bạn — hoạt động bình thường vì cùng Docker network.

---

#### File cấu hình: `src/monitoring/grafana/provisioning/dashboards/dashboard.yml`

```yaml
apiVersion: 1

providers:
  - name: "Monitoring Stack"
    orgId: 1
    folder: "Monitoring"      # Tên folder trong Grafana UI
    type: file

    # false = không xóa dashboard từ UI khi file JSON vẫn còn
    disableDeletion: false

    # Grafana check file thay đổi mỗi 30 giây — không cần restart khi sửa JSON
    updateIntervalSeconds: 30

    # true = cho phép sửa dashboard qua UI
    allowUiUpdates: true

    options:
      # Đường dẫn bên trong container — mount từ ./src/monitoring/grafana/dashboards
      path: /var/lib/grafana/dashboards
```

---

#### Giải thích dashboard `monitoring-overview.json`

Dashboard đã pre-built gồm **8 panel** sắp xếp theo grid 24 cột:

**Hàng 1 — Tổng quan nhanh (4 stat panels):**

| Panel | Query | Ý nghĩa |
|---|---|---|
| Containers đang chạy | `count(container_memory_usage_bytes{image!=""})` | Đếm số container thật đang chạy |
| Prometheus Time Series | `prometheus_tsdb_head_series` | Tổng số time-series đang theo dõi |
| CPU tổng | `sum(rate(...)) * 100` | % CPU tổng cộng của toàn bộ container |
| RAM tổng | `sum(...) / 1024 / 1024` | Tổng RAM dùng, đơn vị MB |

**Hàng 2 — Chi tiết theo container (2 time-series panels):**

| Panel | Query | Ý nghĩa |
|---|---|---|
| CPU % theo container | `rate(container_cpu_usage_seconds_total{image!=""}[5m]) * 100` | Mỗi đường = 1 container |
| Memory MB theo container | `container_memory_usage_bytes{image!=""} / 1024 / 1024` | So sánh RAM giữa các container |

**Hàng 3 — Network I/O (2 time-series panels):**

| Panel | Query | Ý nghĩa |
|---|---|---|
| Network Receive | `rate(container_network_receive_bytes_total[5m])` | Bytes/sec nhận vào từng container |
| Network Transmit | `rate(container_network_transmit_bytes_total[5m])` | Bytes/sec gửi ra từng container |

> **Legend template `{{container_label_com_docker_compose_service}}`** — label này do Docker Compose tự động gắn vào mỗi container. Khi cAdvisor dùng containerd factory, đây là label duy nhất chứa tên service thân thiện (shopapi, prometheus, grafana...).

---

#### Giải thích service Grafana trong `docker-compose.yml`

```yaml
grafana:
  image: grafana/grafana:10.4.2
  ports:
    - "3000:3000"
  environment:
    GF_SECURITY_ADMIN_USER: "admin"
    GF_SECURITY_ADMIN_PASSWORD: "admin123"
    # Tắt signup — không cần trong môi trường dev
    GF_USERS_ALLOW_SIGN_UP: "false"
  volumes:
    # Persist: user, settings, dashboard tạo tay
    - grafana_data:/var/lib/grafana
    # [BẮT BUỘC] Provisioning files — datasource + dashboard providers
    - ./src/monitoring/grafana/provisioning:/etc/grafana/provisioning:ro
    # [BẮT BUỘC] File JSON dashboard
    - ./src/monitoring/grafana/dashboards:/var/lib/grafana/dashboards:ro
  depends_on:
    - prometheus
```

> **Tại sao có cả `grafana_data` volume VÀ mount thư mục dashboards?**
>
> `grafana_data` lưu những thứ **user tạo ra trong UI** (dashboard mới, user mới, API keys). Mount `dashboards/` cung cấp **dashboard chuẩn từ code** — hai thứ này tồn tại song song. Khi provisioning tạo dashboard, Grafana ghi metadata vào `grafana_data` nhưng nguồn thật là file JSON.

---

#### Triển khai lên server VMware

**Bước 3.1 — Sync code mới lên server**

```bash
# Trên máy Windows — sync thêm thư mục grafana vừa tạo
scp -r e:/TECHLEAD_PROJECT/MORNITORING/src/monitoring/grafana user@192.168.1.35:/opt/monitoring/src/monitoring/
scp e:/TECHLEAD_PROJECT/MORNITORING/docker-compose.yml user@192.168.1.35:/opt/monitoring/
```

**Bước 3.2 — SSH và khởi động Grafana**

```bash
ssh user@192.168.1.35
cd /opt/monitoring

# Pull image Grafana và start (không ảnh hưởng các service đang chạy)
docker compose up -d grafana

# Theo dõi log — chờ thấy "HTTP server listen" là sẵn sàng
docker compose logs -f grafana
# Dừng xem log: Ctrl+C
```

**Bước 3.3 — Kiểm tra container đã chạy**

```bash
docker compose ps

# Kết quả mong đợi:
# NAME                     STATUS          PORTS
# monitoring_cadvisor      Up              0.0.0.0:8080->8080/tcp
# monitoring_grafana       Up              0.0.0.0:3000->3000/tcp
# monitoring_prometheus    Up              0.0.0.0:9090->9090/tcp
# monitoring_shopapi       Up              0.0.0.0:5065->8080/tcp
# monitoring_sqlserver     Up (healthy)    0.0.0.0:1433->1433/tcp
```

---

#### Kiểm tra hoạt động

**Kiểm tra 1 — Đăng nhập Grafana:**

Mở trình duyệt: `http://192.168.1.35:3000`
- Username: `admin`
- Password: `admin123`

Sau khi đăng nhập, **không** thấy màn hình đổi password — đó là bình thường (đã disable signup).

**Kiểm tra 2 — Datasource đã được provision:**

Vào **Connections → Data sources** → phải thấy `Prometheus` đã cấu hình sẵn với URL `http://prometheus:9090`.

Click **"Test"** → phải thấy `"Successfully queried the Prometheus API."` (màu xanh lá).

Nếu thấy lỗi `"Bad Gateway"` hoặc timeout → kiểm tra Prometheus có đang chạy không: `docker compose ps prometheus`.

**Kiểm tra 3 — Dashboard đã được import:**

Vào **Dashboards** → folder **Monitoring** → click **"Monitoring Overview — Docker Containers"**.

Phải thấy 8 panel đang hiện data. Nếu panel trắng:
- Đợi thêm 30 giây để Prometheus có đủ data
- Kiểm tra time range góc trên phải — đặt `Last 30 minutes`

---

#### Hiểu sâu hơn: Các thành phần UI của Grafana

**Time range picker (góc trên phải):**
```
Last 5 minutes / 15m / 30m / 1h / ...
```
Mọi panel trong dashboard đều lọc data theo time range này. Đây là điểm mạnh so với Prometheus UI.

**Refresh interval:**
```
Off / 5s / 10s / 30s / 1m / ...
```
Dashboard pre-built đặt sẵn `30s` — tự động cập nhật mà không cần reload trang.

**Panel title → 3 chấm → Edit:**

Click để vào edit mode. Bạn sẽ thấy:
- **Query tab**: viết PromQL, thấy kết quả ngay
- **Transform tab**: biến đổi data trước khi vẽ (rename, filter, join...)
- **Visualization tab**: chọn loại chart (timeseries, bar, gauge, table...)
- **Panel tab**: đặt tiêu đề, description, unit, thresholds

> **Tech Lead cần hiểu:** Grafana không chạy PromQL trực tiếp. Mỗi khi bạn mở dashboard, Grafana gửi query tới Prometheus (`/api/v1/query_range`), nhận JSON về và vẽ. Bạn có thể dùng browser DevTools để xem request này.

**Shared crosshair (graphTooltip: 1):**

Dashboard đã bật `graphTooltip: 1` — khi hover chuột vào 1 panel, tất cả panel khác cùng highlight tại điểm thời gian đó. Rất hữu ích khi debug: thấy CPU tăng đột biến → ngay lập tức thấy RAM và Network tại cùng thời điểm đó.

---

#### Thực hành: Tạo panel đầu tiên bằng tay

Mục tiêu: tạo panel mới đo **số request Prometheus đang xử lý**.

1. Vào dashboard `Monitoring Overview` → click **Add** → **Visualization**
2. Trong **Query**, chọn datasource `Prometheus`
3. Nhập query:
   ```promql
   rate(prometheus_http_requests_total[5m])
   ```
4. Đổi **Legend** thành `{{handler}} {{code}}`
5. Trong **Visualization** tab, chọn `Time series`
6. Trong **Panel** tab:
   - Title: `Prometheus HTTP Requests/sec`
   - Description: `Số request tới Prometheus API mỗi giây, phân loại theo endpoint và status code`
7. Click **Apply** → panel xuất hiện trong dashboard
8. Click **Save dashboard** (Ctrl+S) để lưu

> **Câu hỏi để kiểm tra hiểu biết:** Panel này khác với `prometheus_http_requests_total` như thế nào? Tại sao dùng `rate()` thay vì giá trị thô?

---

#### Khái niệm cốt lõi — Tech Lead cần nắm

| Khái niệm | Ý nghĩa |
|---|---|
| **Provisioning** | Config-as-code cho Grafana — datasource và dashboard được khai báo bằng YAML/JSON, không bấm tay |
| **Datasource** | Kết nối tới nguồn data (Prometheus, InfluxDB, Loki...). 1 Grafana có thể kết nối nhiều datasource |
| **Dashboard** | Tập hợp các panel. Lưu dưới dạng JSON — có thể import/export, commit git |
| **Panel** | 1 biểu đồ = 1 query (hoặc nhiều query) + 1 visualization type |
| **Variable** | Dashboard template variable (`${datasource}`) — cho phép 1 dashboard dùng được nhiều datasource |
| **graphTooltip** | Chế độ tooltip: 0=default, 1=shared crosshair (hover đồng bộ toàn bộ panel), 2=shared tooltip |

---

#### Troubleshooting — Các lỗi hay gặp

**Lỗi 1: Panel hiện "No data"**

```bash
# Kiểm tra Prometheus có data không
curl -s "http://192.168.1.35:9090/api/v1/query?query=container_memory_usage_bytes" | python3 -m json.tool | head -20
```

Nếu có data trong Prometheus nhưng Grafana vẫn trắng → kiểm tra time range trong Grafana có quá nhỏ không (đặt `Last 30 minutes`).

**Lỗi 2: Datasource test fail — "Bad Gateway"**

Grafana không gọi được Prometheus. Nguyên nhân phổ biến:
```bash
# Kiểm tra Prometheus có chạy không
docker compose ps prometheus

# Kiểm tra Grafana có cùng network không
docker inspect monitoring_grafana | grep -A 10 "Networks"
docker inspect monitoring_prometheus | grep -A 10 "Networks"
# Cả hai phải cùng trong "monitoring_net"
```

**Lỗi 3: Dashboard không tự load — folder "Monitoring" trống**

```bash
# Xem log Grafana tìm lỗi provisioning
docker compose logs grafana | grep -i "provision\|dashboard\|error"

# Kiểm tra file JSON có hợp lệ không
docker exec monitoring_grafana cat /var/lib/grafana/dashboards/monitoring-overview.json | python3 -m json.tool > /dev/null && echo "JSON hợp lệ" || echo "JSON lỗi"
```

**Lỗi 5: Legend panel hiện chuỗi trống / Panel Network không có data**

**Triệu chứng:**
- Các time series panel (CPU, Memory, Network) hiện data nhưng legend trống hoặc ghi `{{}}`
- Panel Network (RX/TX) không có data dù CPU/Memory bình thường
- Query `{container_label_com_docker_compose_service="shopapi"}` trả về empty

**Nguyên nhân:**
cAdvisor với `--containerd` flag (containerd factory) **không export Docker Compose labels** như `com.docker.compose.service`. Labels này chỉ tồn tại khi cAdvisor dùng Docker factory (không có `--containerd` flag).

Với containerd factory, container chỉ được nhận dạng qua:
- `image` label: tên image đầy đủ (ví dụ: `docker.io/library/monitoring_stack_gold-shopapi:latest`)
- `name` label: container ID hash (không thân thiện)
- `id` label: cgroup path (ví dụ: `/system.slice/docker-{hash}.scope`)

**Fix — dùng `label_replace` để trích tên service từ `image`:**

```promql
# Thay vì: rate(container_cpu_usage_seconds_total{container_label_com_docker_compose_service="shopapi"}[5m])
# Dùng:
rate(container_cpu_usage_seconds_total{image=~".*shopapi.*"}[5m])

# Cho legend thân thiện, dùng label_replace:
label_replace(
  rate(container_cpu_usage_seconds_total{image!=""}[5m]) * 100,
  "service", "$1", "image", ".*/([^/:]+):.*"
)
```

Legend template sau khi dùng `label_replace`: `{{service}}`

**Fix cho panel Network (không có data):**

Network metrics với containerd factory dùng cgroup `id` pattern thay vì `image` filter:
```promql
# Filter đúng cho Docker containers:
rate(container_network_receive_bytes_total{id=~"/system.slice/docker-.+\\.scope", interface!="lo"}[5m])
```

`/system.slice/docker-{hash}.scope` là cgroup path cố định mà Docker daemon tạo cho mỗi container. `interface!="lo"` loại bỏ loopback traffic.

**Lỗi 4: Grafana khởi động rất chậm**

Bình thường. Lần đầu Grafana cần ~20-30 giây để:
- Init database (SQLite mặc định trong `grafana_data`)
- Load plugins
- Apply provisioning

```bash
# Xem tiến trình khởi động
docker compose logs -f grafana | grep -E "started|ready|listen|error"
```

---

#### Bài tập kiểm tra hiểu biết

1. **Đổi time range** về `Last 5 minutes` → quan sát data thay đổi. Hiểu tại sao một số panel có thể trống khi time range quá ngắn.

2. **Duplicate panel CPU** → đổi query thành chỉ lấy `shopapi`:
   ```promql
   rate(container_cpu_usage_seconds_total{image=~".*shopapi.*"}[5m]) * 100
   ```
   → thấy sự khác biệt giữa filter toàn bộ và filter 1 service cụ thể.
   > **Lưu ý:** Với cAdvisor containerd factory, filter phải dùng `image=~".*shopapi.*"` thay vì `container_label_com_docker_compose_service="shopapi"` vì Docker Compose labels không được export qua containerd interface.

3. **Tạo panel Alert threshold**: Duplicate panel Memory → vào Panel tab → Thresholds → thêm threshold 500MB màu vàng, 1GB màu đỏ → **quan trọng**: trong phần "Graph styles" tìm mục **"Thresholds style"** và chọn **"As lines"** (mặc định là Off) → mới thấy đường kẻ ngang màu vàng/đỏ xuất hiện trên biểu đồ.

4. **Export dashboard**: Click **Share** (icon trên dashboard title) → **Export** → **Save to file** → xem file JSON được tạo ra. Đây chính xác là format của `monitoring-overview.json`.

5. **Thử tắt 1 container** rồi xem dashboard:
   ```bash
   docker compose stop cadvisor
   # Quan sát: panel "Containers đang chạy" giảm, CPU/RAM panel mất series của cadvisor
   docker compose start cadvisor
   ```

**Kết quả bước 3:** Grafana đang chạy tại `http://192.168.1.35:3000`, datasource Prometheus được cấu hình tự động, dashboard `Monitoring Overview` hiện CPU/RAM/Network của tất cả container. Bước 4 sẽ cấu hình AlertManager để tự động gửi thông báo khi có bất thường.
