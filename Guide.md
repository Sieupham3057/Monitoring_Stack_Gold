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
rate(container_cpu_usage_seconds_total{container_label_com_docker_compose_service="shopapi"}[5m]) * 100
```
> Khi cAdvisor dùng **containerd factory** (Ubuntu 22.04+ với Docker containerd snapshotter), label `name` chứa container ID hash thay vì tên thân thiện. Filter đúng là dùng label Docker Compose tự động gắn: `container_label_com_docker_compose_service`.
>
> **Bảng so sánh cách filter container:**
>
> | Mục tiêu | Label filter | Ví dụ |
> |---|---|---|
> | Theo service Compose | `container_label_com_docker_compose_service` | `="shopapi"` |
> | Theo image | `image=~".*pattern.*"` | `=~".*prometheus.*"` |
> | Tất cả container thật | `image!=""` | — |

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
