# K6 Load Testing Lab — ShopApi

> Thực hành đo CCU và sức chịu tải khi scale từ 1 → 2 → 3 backend API.  
> Mỗi test chạy đúng cùng một script — chỉ thay Nginx config, kết quả có thể so sánh trực tiếp.

---

## Mục lục

- [Khái niệm quan trọng: Test Users ≠ VUs (CCU)](#khái-niệm-quan-trọng-test-users--vus-ccu)
- [1. Mục tiêu lab](#1-mục-tiêu-lab)
- [2. Cấu trúc thư mục](#2-cấu-trúc-thư-mục)
- [3. Điều kiện tiên quyết](#3-điều-kiện-tiên-quyết)
- [4. Cài đặt K6](#4-cài-đặt-k6)
- [5. Cấu hình nhanh BASE\_URL](#5-cấu-hình-nhanh-base_url)
- [6. Mô tả các script](#6-mô-tả-các-script)
- [7. Luồng thực hành chuẩn](#7-luồng-thực-hành-chuẩn)
  - [Bước 0: Chuẩn bị Nginx](#bước-0-chuẩn-bị-nginx)
  - [Bước 1: Smoke Test — bắt buộc](#bước-1-smoke-test--bắt-buộc)
  - [Bước 2: Case A — 1 backend](#bước-2-case-a--1-backend)
  - [Bước 3: Case B — 2 backend](#bước-3-case-b--2-backend)
  - [Bước 4: Case C — 3 backend](#bước-4-case-c--3-backend)
  - [Bước 5: Mixed Realistic Test](#bước-5-mixed-realistic-test)
  - [Bước 6: Stress Breakpoint Test](#bước-6-stress-breakpoint-test)
  - [Bước 7: Failover Test](#bước-7-failover-test)
- [8. Cách đọc kết quả K6](#8-cách-đọc-kết-quả-k6)
- [9. Dấu hiệu BẮT BUỘC phải scale](#9-dấu-hiệu-bắt-buộc-phải-scale)
- [10. Bảng so sánh kết quả](#10-bảng-so-sánh-kết-quả)
- [11. Theo dõi Nginx log khi test](#11-theo-dõi-nginx-log-khi-test)
- [12. Xử lý lỗi thường gặp](#12-xử-lý-lỗi-thường-gặp)

---

## Khái niệm quan trọng: Test Users ≠ VUs (CCU)

> Đây là điểm dễ nhầm nhất — hiểu rõ trước khi chạy.

```text
Test Users trong CSV  = tài khoản đăng ký trong database (1000 rows)
VUs (Virtual Users)   = luồng đồng thời đang gửi request (CCU)
```

**Vấn đề khi users.csv ít hơn VUs:**

```
100 users + 200 VU  → 1 account bị 2 VU dùng chung
100 users + 1000 VU → 1 account bị 10 VU dùng chung

Hệ quả:
  - Race condition: 10 VU cùng tạo order bằng account đó
  - Nếu API giới hạn 1 session/user → 9 trong 10 bị 401
  - Kết quả đo KHÔNG phản ánh thực tế
```

**Quy tắc:**

```
users.csv ≥ max VUs  → mỗi VU có account riêng, không dùng chung
users.csv = 1000     → an toàn cho mọi bài test đến 1000 CCU
```

**Trả lời câu phỏng vấn "hệ thống chịu 1000 CCU":**

```
1000 CCU = 1000 user đang thao tác CÙNG LÚC, mỗi người 1 tài khoản riêng
→ Cần 1000 users trong CSV
→ VU peak trong script = 1000
→ Tất cả VU đồng thời gửi request → đây là 1000 CCU thật
```

**Tại sao không cần triệu users để test 1000 CCU?**

```
Thực tế: website 1 triệu user đăng ký nhưng chỉ 1000 online cùng lúc
Load test chỉ cần số users = số CCU cần test
1000 user CSV + 1000 VU đồng thời = mô phỏng đúng 1000 CCU
```

---

## 1. Mục tiêu lab

```text
Case A: 1 backend — đo giới hạn của 1 server
Case B: 2 backend — quan sát khi scale ngang, cùng lượng user
Case C: 3 backend — scale ngang tiếp, thấy improvement tuyến tính hay không
```

Sau lab này anh sẽ trả lời được:

```text
1. Hệ thống của tôi chịu được bao nhiêu CCU (concurrent users)?
2. Tại bao nhiêu CCU thì p95 latency bắt đầu tăng không kiểm soát?
3. Scale thêm 1 backend cải thiện được bao nhiêu % throughput?
4. Khi 1 backend chết, Nginx failover có hoạt động không và mất bao lâu?
```

---

## 2. Cấu trúc thư mục

```text
k6/
├── README.md                         ← File này
├── 01-smoke-test.js                  ← Sanity check — chạy trước tiên
├── 02-read-load-test.js              ← Script SO SÁNH 1/2/3 backend
├── 03-mixed-realistic-test.js        ← Giả lập người dùng thật
├── 04-stress-breakpoint-test.js      ← Tìm điểm gãy
├── 05-failover-test.js               ← Test khi tắt 1 backend đang chạy
├── data/
│   └── users.csv                     ← 1000 test users (auto-register trong setup)
└── nginx-configs/
    ├── 1-backend.conf                ← Upstream snippet: chỉ .50
    ├── 2-backend.conf                ← Upstream snippet: .50 + .51
    └── 3-backend.conf                ← Upstream snippet: .50 + .51 + .52
```

---

## 3. Điều kiện tiên quyết

### Trên máy chạy K6 (máy Windows của anh hoặc máy LAN khác)

```text
✅ K6 đã cài (xem mục 4)
✅ Kết nối được tới banking-api.ngiveup.org hoặc 192.168.1.100
```

### Trên hệ thống

```text
✅ Nginx server 192.168.1.100 đang chạy
✅ Backend .50 (192.168.1.50:5065) đang chạy
✅ Database kết nối được từ backend
✅ SSL đã được cấu hình (hoặc dùng --insecure-skip-tls-verify khi test LAN)
```

### Kiểm tra trước khi test

```bash
# Từ máy chạy K6:
curl -I https://banking-api.ngiveup.org/health
# Kỳ vọng: HTTP/2 200

# Nếu test trực tiếp Nginx LAN (bỏ qua Cloudflare):
curl -kI https://192.168.1.100/health -H "Host: banking-api.ngiveup.org"
# Kỳ vọng: HTTP/2 200
```

---

## 4. Cài đặt K6

### Windows (PowerShell)

```powershell
# Cách 1: Chocolatey
choco install k6

# Cách 2: winget
winget install k6

# Cách 3: Tải binary trực tiếp
# https://dl.k6.io/msi/k6-latest-amd64.msi
```

### Linux (Ubuntu — trên máy khác trong LAN)

```bash
sudo gpg -k
sudo gpg --no-default-keyring \
  --keyring /usr/share/keyrings/k6-archive-keyring.gpg \
  --keyserver hkp://keyserver.ubuntu.com:80 \
  --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" \
  | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6
```

### Kiểm tra

```bash
k6 version
# k6 v0.53.x (...)
```

---

## 5. Cấu hình nhanh BASE_URL

Mặc định tất cả script dùng `https://banking-api.ngiveup.org`.

Có 2 cách chạy:

### Cách 1: Test qua domain (qua Cloudflare hoặc DNS only)

```bash
k6 run 02-read-load-test.js
# hoặc truyền tường minh:
k6 run --env BASE_URL=https://banking-api.ngiveup.org 02-read-load-test.js
```

### Cách 2: Test trực tiếp Nginx, bỏ qua Cloudflare (khuyến nghị để đo chính xác)

```bash
k6 run \
  --env BASE_URL=https://192.168.1.100 \
  --env HOST=banking-api.ngiveup.org \
  --insecure-skip-tls-verify \
  02-read-load-test.js
```

> **Tại sao test trực tiếp Nginx?**  
> Khi qua Cloudflare, latency bị ảnh hưởng bởi CDN cache, DDoS protection, geographic routing.  
> Test trực tiếp Nginx cho kết quả phản ánh đúng hiệu năng của hệ thống anh.

---

## 6. Mô tả các script

| Script | Mục đích | Thời gian | VU Peak | Users cần |
|--------|----------|-----------|---------|-----------|
| `01-smoke-test.js` | Kiểm tra API hoạt động đúng | ~2 phút | 2 VU | 2 (tự tạo) |
| `02-read-load-test.js` | So sánh 1/2/3 backend với cùng tải | ~6.5 phút | 200 VU | 200 |
| `03-mixed-realistic-test.js` | Giả lập người dùng thật (read + write) | ~6 phút | 120 VU | 120 |
| `04-stress-breakpoint-test.js` | Tìm điểm gãy của từng cấu hình | ~18 phút | 500 VU | 500 |
| `05-failover-test.js` | Test Nginx failover khi tắt 1 backend | ~6 phút | 80 VU | 80 |

> `users.csv` có sẵn 1000 users — đủ cho tất cả scripts, kể cả khi muốn đẩy lên 1000 CCU.  
> `setup()` tự đăng ký toàn bộ pool bằng `http.batch()` trước khi VU bắt đầu.

---

## 7. Luồng thực hành chuẩn

### Bước 0: Chuẩn bị Nginx

Trên server Nginx `192.168.1.100`, đảm bảo log format có upstream info:

```bash
sudo nano /etc/nginx/nginx.conf
```

Trong block `http {}`, thêm (nếu chưa có):

```nginx
log_format upstreamlog '$remote_addr - $host "$request" '
                       'status=$status '
                       'upstream_addr=$upstream_addr '
                       'upstream_status=$upstream_status '
                       'request_time=$request_time '
                       'upstream_response_time=$upstream_response_time';
```

Trong file `/etc/nginx/sites-available/banking-api.conf`, đổi dòng access_log:

```nginx
access_log /var/log/nginx/banking-api-access.log upstreamlog;
```

Thêm debug headers trong `location /` (để thấy backend nào đang nhận request):

```nginx
add_header X-Upstream-Addr   $upstream_addr always;
add_header X-Upstream-Status $upstream_status always;
```

Reload:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

---

### Bước 1: Smoke Test — bắt buộc

Luôn chạy smoke test TRƯỚC KHI bắt đầu bất kỳ load test nào.

```bash
cd k6
k6 run 01-smoke-test.js
```

**Kỳ vọng:**

```text
✓ [smoke] health: status 200
✓ [smoke] login: status 200
✓ [smoke] products: status 200
✓ [smoke] categories: status 200
✓ [smoke] create order: not 500
...

checks.........................: 100.00%  ✓ tất cả passed
http_req_failed................: 0.00%    ✓ không có lỗi
```

**Nếu smoke test fail:**

```text
- Kiểm tra API đang chạy: curl -I https://banking-api.ngiveup.org/health
- Kiểm tra BASE_URL đúng chưa
- Kiểm tra field name token (xem mục 12 - Xử lý lỗi)
- DỪNG — không chạy load test khi smoke test chưa pass
```

---

### Bước 2: Case A — 1 backend

**Mục tiêu:** Đo giới hạn của 1 server, ghi lại kết quả để so sánh.

#### 2.1 Cấu hình Nginx — chỉ 1 backend

```bash
# Trên server Nginx (192.168.1.100):
sudo nano /etc/nginx/sites-available/banking-api.conf
```

Thay block upstream bằng:

```nginx
upstream banking_api_backend {
    least_conn;
    server 192.168.1.50:5065 max_fails=3 fail_timeout=10s;
    # server 192.168.1.51:5065 max_fails=3 fail_timeout=10s;  # Comment lại
    keepalive 32;
}
```

Reload Nginx:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

Xác nhận chỉ `.50` đang nhận traffic:

```bash
for i in {1..6}; do
  curl -kI https://192.168.1.100/health -H "Host: banking-api.ngiveup.org" \
    2>/dev/null | grep -i "X-Upstream"
done
```

Kỳ vọng: tất cả đều trả về `X-Upstream-Addr: 192.168.1.50:5065`.

#### 2.2 Xóa log cũ trước khi test

```bash
sudo truncate -s 0 /var/log/nginx/banking-api-access.log
sudo truncate -s 0 /var/log/nginx/banking-api-error.log
```

#### 2.3 Chạy Read Load Test — Case A

```bash
cd k6
k6 run 02-read-load-test.js
```

Hoặc test trực tiếp Nginx:

```bash
k6 run \
  --env BASE_URL=https://192.168.1.100 \
  --env HOST=banking-api.ngiveup.org \
  --insecure-skip-tls-verify \
  02-read-load-test.js
```

Lưu kết quả để compare sau:

```bash
mkdir -p results
k6 run --out json=results/case-a-1backend.json 02-read-load-test.js
```

**Ghi lại vào bảng** (xem mục 10).

---

### Bước 3: Case B — 2 backend

**Mục tiêu:** Thêm backend `.51`, chạy đúng cùng script → thấy improvement.

**Yêu cầu:** VM `192.168.1.51` phải đang chạy backend API.

#### 3.1 Cấu hình Nginx — 2 backend

```bash
sudo nano /etc/nginx/sites-available/banking-api.conf
```

Thay block upstream:

```nginx
upstream banking_api_backend {
    least_conn;
    server 192.168.1.50:5065 max_fails=3 fail_timeout=10s;
    server 192.168.1.51:5065 max_fails=3 fail_timeout=10s;  # Bật lại
    keepalive 32;
}
```

```bash
sudo nginx -t && sudo systemctl reload nginx
```

Xác nhận cả 2 backend nhận traffic:

```bash
for i in {1..10}; do
  curl -kI https://192.168.1.100/health -H "Host: banking-api.ngiveup.org" \
    2>/dev/null | grep -i "X-Upstream"
done
# Kỳ vọng: xen kẽ giữa .50 và .51
```

#### 3.2 Xóa log, chạy lại đúng script

```bash
sudo truncate -s 0 /var/log/nginx/banking-api-access.log

cd k6
k6 run --out json=results/case-b-2backend.json 02-read-load-test.js
```

**Ghi lại vào bảng** và so sánh với Case A.

---

### Bước 4: Case C — 3 backend

**Yêu cầu:** VM `192.168.1.52` phải đang chạy backend API.

#### 4.1 Cấu hình Nginx — 3 backend

```bash
sudo nano /etc/nginx/sites-available/banking-api.conf
```

```nginx
upstream banking_api_backend {
    least_conn;
    server 192.168.1.50:5065 max_fails=3 fail_timeout=10s;
    server 192.168.1.51:5065 max_fails=3 fail_timeout=10s;
    server 192.168.1.52:5065 max_fails=3 fail_timeout=10s;
    keepalive 64;
}
```

```bash
sudo nginx -t && sudo systemctl reload nginx
sudo truncate -s 0 /var/log/nginx/banking-api-access.log

cd k6
k6 run --out json=results/case-c-3backend.json 02-read-load-test.js
```

---

### Bước 5: Mixed Realistic Test

Sau khi đã biết hệ thống scale như thế nào, chạy kịch bản thực tế hơn với cả người đọc và người mua hàng.

Chạy với cấu hình 2 backend:

```bash
k6 run 03-mixed-realistic-test.js
```

**Quan sát:**

```text
- http_req_duration{scenario:readers} p95 — latency của người lướt web
- http_req_duration{scenario:shoppers} p95 — latency của người mua hàng
- order_success_rate — tỷ lệ đặt hàng thành công
```

Nếu `order_success_rate < 80%` → hệ thống đang bị nghẽn ở write path (DB, order logic).

---

### Bước 6: Stress Breakpoint Test

Dùng để tìm chính xác ngưỡng VU mà hệ thống bắt đầu suy giảm.

#### Với 1 backend:

```bash
# Đổi Nginx về 1 backend trước
k6 run --out json=results/stress-1backend.json 04-stress-breakpoint-test.js
```

Ghi chú: "1 backend bắt đầu chậm ở _____ VU, error rate tăng ở _____ VU".

#### Với 2 backend:

```bash
# Đổi Nginx về 2 backend
k6 run --out json=results/stress-2backend.json 04-stress-breakpoint-test.js
```

Kỳ vọng: điểm gãy dịch chuyển sang phải (cần nhiều VU hơn mới gây suy giảm).

**Đọc output: chú ý 2 giai đoạn nguy hiểm**

```text
[PHASE 4] 350 VU → p95 bắt đầu vượt ngưỡng?   (stress bắt đầu)
[PHASE 5] 500 VU → error rate > 5%?             (breaking point)
[COOLDOWN] 0 VU  → hệ thống có recover không?   (resilience test)
```

---

### Bước 7: Failover Test

Yêu cầu: Nginx đang cấu hình 2 backend (`.50` và `.51`).

Mở 3 cửa sổ terminal:

**Cửa sổ 1 — Chạy K6:**

```bash
cd k6
k6 run 05-failover-test.js
```

**Cửa sổ 2 — Theo dõi Nginx log:**

```bash
# Trên server Nginx:
sudo tail -f /var/log/nginx/banking-api-access.log | grep --line-buffered "upstream_addr"
```

**Cửa sổ 3 — Tắt/bật backend theo timeline:**

```bash
# Đợi ~2 phút 30 giây sau khi K6 bắt đầu, rồi:
ssh user@192.168.1.51
sudo systemctl stop banking-api  # hoặc lệnh tương đương của anh

# Đợi thêm ~2 phút, rồi:
sudo systemctl start banking-api
```

**Kỳ vọng quan sát trong K6 output:**

```text
Giai đoạn bình thường:  error rate ~0%, p95 thấp
Ngay sau khi tắt .51:   spike nhỏ (~3-5% lỗi trong 10-30 giây)
→ Nginx phát hiện .51 fail (max_fails=3, fail_timeout=10s)
→ Tự failover 100% traffic về .50
Sau failover:           error rate về 0%, p95 tăng nhẹ (1 backend chịu tải cao hơn)
Sau khi bật lại .51:   p95 giảm, Nginx tự phân phối lại traffic
```

---

## 8. Cách đọc kết quả K6

K6 in kết quả cuối mỗi lần chạy. Đây là các metric quan trọng nhất:

```text
scenarios: (100.00%) 1 scenario, 200 max VUs, ...
default: [===============] 200 VUs  6m30s

✓ health 200                      ← Check pass/fail
✓ products 200
✗ create order not 500             ← Check fail → đây là vấn đề cần điều tra

checks.........................: 98.50% ✓ 12453 ✗ 187
data_received..................: 45 MB  115 kB/s
data_sent......................: 3.2 MB 8.2 kB/s
http_req_blocked...............: avg=1.23ms   p(95)=2.1ms
http_req_connecting............: avg=0.82ms   p(95)=1.8ms
http_req_duration..............: avg=312ms    p(90)=580ms  p(95)=820ms  p(99)=2.1s
  { expected_response:true }...: avg=298ms    p(90)=561ms  p(95)=789ms  p(99)=1.9s
http_req_failed................: 1.47%  ✓ 0 ✗ 187     ← TỶ LỆ LỖI
http_reqs......................: 12640  32.4/s          ← RPS (request/giây)
iteration_duration.............: avg=5.1s
vus............................: 9      min=0  max=200   ← VU thực tế
vus_max........................: 200
```

### Giải nghĩa các chỉ số

| Metric | Ý nghĩa | Ngưỡng tốt |
|--------|---------|-----------|
| `http_req_duration p(95)` | 95% request hoàn thành dưới mức này | < 1000ms |
| `http_req_duration p(99)` | 99% request hoàn thành dưới mức này | < 3000ms |
| `http_req_failed rate` | Tỷ lệ request thất bại | < 1% |
| `http_reqs rate` | Số request/giây (throughput) | Càng cao càng tốt |
| `checks rate` | Tỷ lệ check pass | > 99% |
| `vus_max` | Số VU đồng thời cao nhất | Đây là CCU của anh |

### Hiểu p95 vs p99

```text
p(95) = 820ms nghĩa là:
  → 95% user nhận phản hồi trong 820ms
  → 5% user (50 người trong 1000) chờ lâu hơn 820ms

p(99) = 2.1s nghĩa là:
  → 1% user (10 người trong 1000) chờ lâu hơn 2.1 giây
  → Đây là "tail latency" — ảnh hưởng người dùng xui nhất

Khi hệ thống quá tải:
  avg tăng chậm, nhưng p95/p99 tăng RẤT NHANH (exponential)
  → Đây là tín hiệu mạnh nhất cần scale
```

---

## 9. Dấu hiệu BẮT BUỘC phải scale

### Tín hiệu từ K6

```text
🔴 CRITICAL — Scale ngay:
   http_req_failed rate > 5%         (1/20 request lỗi)
   http_req_duration p(95) > 3000ms  (user chờ > 3 giây)
   checks rate < 95%                 (nhiều endpoint trả lỗi)

🟡 WARNING — Chuẩn bị scale:
   http_req_failed rate > 1%
   http_req_duration p(95) > 1500ms
   http_req_duration p(99) > 4000ms
   http_reqs rate giảm dù VU tăng   (throughput đã bão hòa)

🟢 OK — Hệ thống đang khỏe:
   http_req_failed rate < 0.5%
   http_req_duration p(95) < 800ms
   http_req_duration p(99) < 2000ms
```

### Tín hiệu từ server (xem song song khi test)

```bash
# Trên backend server 192.168.1.50:
watch -n 2 "top -bn1 | head -20"           # CPU + RAM realtime
free -h                                     # RAM usage
netstat -an | grep ESTABLISHED | wc -l     # Active connections
```

```text
🔴 CRITICAL:
   CPU > 90% sustained (không phải spike)
   RAM > 85%
   Active connections tăng liên tục không hạ

🟡 WARNING:
   CPU > 70% sustained
   RAM > 70%
```

### Pattern điển hình khi 1 backend gần gãy

```text
VU 50:   p95=200ms,  error=0%,    RPS=450   ← Khỏe
VU 100:  p95=350ms,  error=0%,    RPS=820   ← Vẫn ổn
VU 150:  p95=680ms,  error=0.2%,  RPS=1100  ← Bắt đầu chậm
VU 200:  p95=1800ms, error=2.1%,  RPS=1150  ← ⚠ WARNING: p95 nhảy mạnh
VU 250:  p95=4200ms, error=8.5%,  RPS=1100  ← 🔴 BREAKING POINT: RPS không tăng, lỗi tăng mạnh
VU 300:  p95=8500ms, error=18%,   RPS=950   ← Sụp đổ: RPS giảm, lỗi cực cao
```

**Quy tắc nhận biết điểm bão hòa:**

```text
Khi tăng VU nhưng RPS không tăng thêm (hoặc giảm) → hệ thống đã đạt max throughput
Đây là lúc chỉ có SCALE HORIZONTAL mới giúp được — tăng VU thêm chỉ làm hệ thống tệ hơn
```

### Kỳ vọng sau khi scale

```text
Scale từ 1 → 2 backend (cùng spec):
  p95 giảm ~40-50%
  RPS tăng ~80-90% (không đạt 100% do overhead Nginx, keepalive, DB shared)
  Error rate giảm về gần 0%
  CPU mỗi server giảm ~45-50%

Scale từ 2 → 3 backend:
  p95 giảm thêm ~25-35%
  RPS tăng thêm ~40-60%
  Diminishing returns bắt đầu xuất hiện nếu DB là bottleneck
```

---

## 10. Bảng so sánh kết quả

Copy bảng này ra và điền số liệu sau mỗi lần chạy `02-read-load-test.js`:

```text
┌──────────────────────────┬─────────────────┬─────────────────┬─────────────────┐
│ Metric                   │ Case A: 1 server│ Case B: 2 server│ Case C: 3 server│
├──────────────────────────┼─────────────────┼─────────────────┼─────────────────┤
│ Peak VUs                 │                 │                 │                 │
│ Total Requests           │                 │                 │                 │
│ http_reqs/s (RPS)        │                 │                 │                 │
│ http_req_failed %        │                 │                 │                 │
│ checks pass %            │                 │                 │                 │
│ p(50) latency            │                 │                 │                 │
│ p(95) latency            │                 │                 │                 │
│ p(99) latency            │                 │                 │                 │
│ avg latency              │                 │                 │                 │
│ CPU backend .50          │                 │                 │                 │
│ CPU backend .51          │       N/A       │                 │                 │
│ CPU backend .52          │       N/A       │       N/A       │                 │
├──────────────────────────┼─────────────────┼─────────────────┼─────────────────┤
│ p95 improvement vs Case A│      baseline   │                 │                 │
│ RPS improvement vs Case A│      baseline   │                 │                 │
└──────────────────────────┴─────────────────┴─────────────────┴─────────────────┘
```

### Bảng điểm gãy (từ `04-stress-breakpoint-test.js`)

```text
┌─────────────────────────────────┬────────────┬────────────┬────────────┐
│ Event                           │ 1 backend  │ 2 backend  │ 3 backend  │
├─────────────────────────────────┼────────────┼────────────┼────────────┤
│ p95 vượt 1s lần đầu ở VU        │            │            │            │
│ p95 vượt 2s lần đầu ở VU        │            │            │            │
│ Error rate vượt 1% ở VU         │            │            │            │
│ Error rate vượt 5% ở VU         │            │            │            │
│ RPS peak (trước khi giảm)       │            │            │            │
│ Hệ thống có recover sau cooldown│            │            │            │
└─────────────────────────────────┴────────────┴────────────┴────────────┘
```

---

## 11. Theo dõi Nginx log khi test

### Mở 2 terminal trên server Nginx khi K6 đang chạy

**Terminal 1 — Realtime upstream routing:**

```bash
sudo tail -f /var/log/nginx/banking-api-access.log | \
  awk '{for(i=1;i<=NF;i++) if($i~/upstream_addr/) print $i}' | \
  sort | uniq -c | sort -rn
```

**Terminal 2 — Đếm request mỗi backend mỗi 5 giây:**

```bash
while true; do
  echo "=== $(date +%T) ==="
  sudo grep "$(date +%d/%b/%Y:%H:%M)" /var/log/nginx/banking-api-access.log | \
    grep -oP 'upstream_addr=\S+' | sort | uniq -c
  sleep 5
done
```

### Sau khi test xong — phân tích log

```bash
# Tổng số request mỗi backend
sudo grep -oP 'upstream_addr=\S+' /var/log/nginx/banking-api-access.log | \
  sort | uniq -c | sort -rn

# Số request thành công vs lỗi
sudo grep -c 'upstream_status=200' /var/log/nginx/banking-api-access.log
sudo grep -c 'upstream_status=5' /var/log/nginx/banking-api-access.log

# Avg response time (nếu có upstream_response_time trong log format)
sudo awk -F'upstream_response_time=' '/upstream_response_time/{
  n=split($2,a," "); sum+=a[1]; count++
} END{print "avg:", sum/count "s, count:", count}' \
  /var/log/nginx/banking-api-access.log
```

---

## 12. Xử lý lỗi thường gặp

### Lỗi: Login trả về 200 nhưng không lấy được token

```text
VU X: Response không chứa token trong response: {"message":"Login success"}
```

**Nguyên nhân:** API trả về field name khác (ví dụ `data.token`, `jwt`, `bearer`)

**Cách fix:** Kiểm tra response thật của API:

```bash
curl -X POST https://banking-api.ngiveup.org/api/Auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"shoptest_001","password":"TestPass@123"}' | jq
```

Xem output, tìm field chứa JWT. Ví dụ nếu response là:

```json
{ "data": { "accessToken": "eyJ..." } }
```

Sửa hàm `extractToken` trong script:

```javascript
// Trong tất cả scripts, tìm dòng:
vuState.token = body.token || body.accessToken || body.access_token || null;

// Đổi thành phù hợp với API:
vuState.token = body.data?.accessToken || body.token || null;
```

---

### Lỗi: setup() tốn quá nhiều thời gian

**Nguyên nhân:** Mạng LAN chậm hoặc API đang bận khi đăng ký 1000 users song song.

**Giải pháp 1:** Nếu users đã đăng ký từ lần trước, `setup()` vẫn chạy nhanh vì API trả về 400/409 ngay mà không insert DB.

**Giải pháp 2:** Giảm `BATCH_SIZE` trong script từ 20 xuống 5 để giảm áp lực lên API lúc setup:

```javascript
const BATCH_SIZE = 5; // thay vì 20
```

**Giải pháp 3:** Chỉ dùng 200 dòng đầu của CSV nếu không cần test đến 1000 VU:

```bash
head -201 data/users.csv > data/users-200.csv
# Rồi sửa đường dẫn open() trong script thành './data/users-200.csv'
```

---

### Lỗi: `ERRO[0000] GoError: open data/users.csv: no such file or directory`

K6 cần chạy từ đúng thư mục:

```bash
# Phải cd vào thư mục k6 trước
cd k6
k6 run 02-read-load-test.js

# Hoặc chạy từ nơi khác nhưng chỉ định đường dẫn tuyệt đối:
# (không hỗ trợ tốt — nên cd vào k6/ trước)
```

---

### Lỗi: `http_req_failed: 100%` ngay từ đầu

Kiểm tra:

```bash
# 1. API có đang chạy không?
curl -I https://banking-api.ngiveup.org/health

# 2. Nginx có đang nghe port 443?
# (trên server Nginx)
sudo ss -lntp | grep 443

# 3. SSL cert có còn hạn?
sudo certbot certificates
```

---

### Lỗi: p95 quá cao dù ít VU (ví dụ: 3s ở 20 VU)

Không phải vấn đề scale — đây là vấn đề backend code hoặc database.

**Điều tra:**

```bash
# Xem log lỗi backend
journalctl -u banking-api -n 100 --no-pager

# Kiểm tra DB connection pool có bị cạn không
# (xem log application)
```

---

## Ghi chú nhanh — lệnh hay dùng nhất

```bash
# Chạy smoke test
k6 run 01-smoke-test.js

# Chạy comparison test với 1 backend
k6 run --out json=results/case-a.json 02-read-load-test.js

# Chạy mixed test
k6 run 03-mixed-realistic-test.js

# Chạy stress test với output chi tiết
k6 run --out json=results/stress.json 04-stress-breakpoint-test.js

# Chạy failover test
k6 run 05-failover-test.js

# Test trực tiếp Nginx bỏ qua Cloudflare
k6 run \
  --env BASE_URL=https://192.168.1.100 \
  --env HOST=banking-api.ngiveup.org \
  --insecure-skip-tls-verify \
  02-read-load-test.js

# Reload Nginx sau khi đổi upstream
sudo nginx -t && sudo systemctl reload nginx

# Xóa log trước mỗi lần test
sudo truncate -s 0 /var/log/nginx/banking-api-access.log

# Xem request chia về backend nào
sudo tail -f /var/log/nginx/banking-api-access.log | grep --line-buffered "upstream_addr"
```
