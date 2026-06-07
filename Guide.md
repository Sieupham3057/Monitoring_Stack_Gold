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
