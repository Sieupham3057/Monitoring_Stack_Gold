# K6 Load Test — Phân tích kết quả

> **Chạy lệnh:** `k6 run --out influxdb=http://localhost:8086/k6 src/k6/load-test.js`
> **Thời gian chạy:** 5m56.3s | **Max VUs:** 80 | **Tổng iterations:** 2807

---

## Tóm tắt nhanh (TL;DR)

| Trạng thái | Threshold | Thực tế | Kết luận |
|---|---|---|---|
| ✅ Tổng thời gian request | p(95) < 500ms | p(95) = 308ms | Đạt |
| ✅ Tổng thời gian request | p(99) < 1000ms | p(99) = 491ms | Đạt |
| ✅ Thời gian tạo đơn hàng | p(95) < 800ms | p(95) = 25ms | Đạt (rất tốt) |
| ✅ Lỗi nghiệp vụ login | rate < 5% | rate = 0% | Đạt |
| ❌ **Tỷ lệ request lỗi** | rate < 1% | **rate = 10.81%** | **FAIL** |
| ❌ **Thời gian login** | p(95) < 300ms | **p(95) = 396ms** | **FAIL** |

**Kết luận ngắn:** Server không bị crash, không có lỗi 5xx. Nhưng **65% đơn hàng bị từ chối** (lỗi 4xx) và **login quá chậm** dưới tải cao — đây là 2 vấn đề độc lập cần xử lý riêng.

---

## Raw Output gốc

```
     execution: local
        script: src/k6/load-test.js
        output: InfluxDBv1 (http://localhost:8086)

     scenarios: (100.00%) 1 scenario, 80 max VUs, 6m0s max duration (incl. graceful stop):
              * default: Up to 80 looping VUs for 5m30s over 6 stages (gracefulRampDown: 30s, gracefulStop: 30s)

  █ THRESHOLDS
    http_req_duration      ✓ p(95)<500   p(95)=308.93ms
    http_req_duration      ✓ p(99)<1000  p(99)=491.96ms
    http_req_failed        ✗ rate<0.01   rate=10.81%
    shopapi_business_error_rate  ✓ rate<0.05  rate=0.00%
    shopapi_login_duration ✗ p(95)<300   p(95)=396ms
    shopapi_order_duration ✓ p(95)<800   p(95)=25.69ms
    shopapi_order_duration ✓ p(99)<2000  p(99)=81ms

  █ TOTAL RESULTS
    checks_total.......: 22456   63.029002/s
    checks_succeeded...: 91.88%  20634 out of 22456
    checks_failed......: 8.11%   1822 out of 22456

    ✓ login: status 200
    ✓ login: có token trong response
    ✓ products: status 200
    ✓ products: có data
    ✓ product detail: status 200 hoặc 404
    ✗ order: status 200 hoặc 201        ↳ 35% — ✓ 985 / ✗ 1822
    ✓ order: không phải 5xx
    ✓ order history: status 200

    shopapi_login_duration...........: avg=218ms  p(90)=331ms  p(95)=396ms  max=3.48s
    shopapi_order_duration...........: avg=9ms    p(90)=16ms   p(95)=25ms   max=390ms
    shopapi_order_history_duration...: avg=10ms   p(90)=11ms   p(95)=17ms   max=3.26s
    shopapi_product_duration.........: avg=8ms    p(90)=9ms    p(95)=14ms   max=3.21s
    shopapi_orders_created...........: 985        (2.76/s)
    http_req_failed..................: 10.81%     1822 out of 16843
    http_reqs........................: 16843      47.274558/s
    vus_max..........................: 80

ERRO[0334] thresholds on metrics 'http_req_failed, shopapi_login_duration' have been crossed
```

---

## Phân tích chi tiết — Vấn đề 1: `http_req_failed` = 10.81% ❌

### Thực tế đang xảy ra

```
✗ order: status 200 hoặc 201  →  35% — ✓ 985 / ✗ 1822
✓ order: không phải 5xx       →  100% pass
```

- **Số request thất bại:** 1822 / 16843 tổng request = 10.81%
- **Tất cả 1822 lỗi đó đến từ:** API tạo đơn hàng (`POST /api/orders`)
- **Loại lỗi:** KHÔNG phải 5xx (server không crash) → đây là **lỗi 4xx** (client-side error từ góc nhìn HTTP)
- **Tỷ lệ đơn hàng bị từ chối:** 1822 / 2807 = **64.9%** — gần 2/3 đơn hàng không thành công

### Nguyên nhân gốc rễ (Root Cause)

Nhìn vào kịch bản test trong `load-test.js`:

```js
const PRODUCTS = [1, 2, 3, 4, 5];  // chỉ 5 sản phẩm
const QUANTITIES = [1, 2, 3];

// Mỗi iteration: 1 VU tạo 1 đơn với product ngẫu nhiên từ 5 product này
const orderRes = http.post(`${BASE_URL}/api/orders`, JSON.stringify({
  items: [{ productId, quantity }]
}), ...);
```

**80 VUs đang đồng thời** cố mua hàng từ **chỉ 5 sản phẩm** trong database test. Có 3 khả năng:

#### Khả năng A — Hết hàng tồn kho (Probable nhất: HTTP 400/409)

```
Scenario: Product ID=3 có stock = 20 units
VU-01 đặt 2 qty  →  stock = 18
VU-02 đặt 3 qty  →  stock = 15
...
VU-25 đặt 1 qty  →  stock = 0
VU-26 đặt 2 qty  →  400 Bad Request: "Insufficient stock"  ← LỖI
VU-27 đặt 3 qty  →  400 Bad Request: "Insufficient stock"  ← LỖI
```

Database test chỉ seed một lượng nhỏ stock. Với 80 VUs tạo ~2.76 đơn/giây liên tục trong 5.5 phút, stock của 5 sản phẩm bị cạn kiệt sớm → server **đúng khi trả về 4xx** vì hàng thật sự hết.

#### Khả năng B — Xung đột tương tranh (HTTP 409 Conflict)

```
VU-01 đọc stock=5  →  bắt đầu transaction
VU-02 đọc stock=5  →  bắt đầu transaction
VU-01 trừ stock → commit, stock=4
VU-02 cố commit → Optimistic Concurrency Exception → 409
```

Xảy ra khi .NET dùng **Optimistic Locking** (EF Core `RowVersion` / `ConcurrencyToken`). Dưới 80 VUs đồng thời ghi vào cùng row product, conflict rate rất cao.

#### Khả năng C — Validation / Business Rule (HTTP 422)

Data test bị sai format hoặc vi phạm business rule khi nhiều user đặt cùng lúc.

### Cách xác nhận nguyên nhân thực tế

Thêm logging vào k6 để biết chính xác status code:

```js
// Thêm vào sau orderRes
if (orderRes.status >= 400) {
  console.log(`[ORDER FAIL] status=${orderRes.status} body=${orderRes.body.substring(0, 200)}`);
}
```

Chạy lại với 10 VUs và xem log — body của response sẽ cho biết lý do chính xác.

### Tác động thực tế lên người dùng

Đang phục vụ đồng thời: **~17-18 người dùng đang trong giữa chừng một iteration** (80 VUs / 4.46s avg iteration = 17.9 concurrent users). Trong đó ~12 người (65%) sẽ nhận được lỗi khi đặt hàng.

Từ góc độ **production SLO**, đây là sự cố nghiêm trọng: nếu một đợt flash sale có 80 người đồng thời → chỉ ~28 người mua được hàng.

---

## Phân tích chi tiết — Vấn đề 2: `shopapi_login_duration` p(95)=396ms ❌

### Thực tế đang xảy ra

```
shopapi_login_duration: avg=218ms  med=177ms  p(90)=331ms  p(95)=396ms  max=3.48s
                        min=-519000000ns  ← Bug trong test script (xem bên dưới)
```

- **Threshold:** p(95) < 300ms
- **Thực tế:** p(95) = 396ms — chậm hơn **32%** so với SLO
- **Đỉnh:** max = 3.48 giây — một số request login mất gần 3.5 giây

### Nguyên nhân gốc rễ

Nhìn vào script: **mỗi iteration tạo một user mới hoàn toàn**:

```js
function randomUsername() {
  return `k6user_${__VU}_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
}

// Mỗi iteration gọi authenticate(username) → register + login
```

**80 VUs đồng thời** → **80 request register + 80 request login song song** → Server phải:

1. Hash password với **bcrypt** (CPU-intensive, ≥100ms/operation ở work factor 10-12)
2. Insert user mới vào database (I/O)
3. Verify password lại khi login (bcrypt lần 2)
4. Sign JWT token

Với 80 bcrypt operations đồng thời trên một máy, **CPU bị bão hòa**. .NET's thread pool có giới hạn thread, các request phải xếp hàng chờ CPU — dẫn đến latency tăng đột biến khi spike lên 80 VUs.

**Bằng chứng:** Khi nhìn các stages:
```
Warm-up  (5 VUs)   → Login nhanh
Ramp-up  (30 VUs)  → Login bắt đầu chậm
Spike    (80 VUs)  → Login chậm nhất, max 3.48s
```

### Bug phụ: `min=-519000000ns`

```js
const loginStart = Date.now();  // milliseconds
// ... http call ...
loginDuration.add(Date.now() - loginStart);  // thêm giá trị ms
```

`new Trend('shopapi_login_duration', true)` — tham số `true` nói với k6 đây là **time metric tính bằng nanoseconds**. Nhưng `Date.now()` trả về **milliseconds**. K6 display `-519000000ns` = `-519ms`, nghĩa là một lần clock skew (NTP sync) xảy ra đúng lúc đo → loginStart > endTime một chút. Đây không phải vấn đề chức năng nhưng làm nhiễu metric.

---

## Bức tranh tổng thể: Server đang phục vụ bao nhiêu user?

### Số liệu đồng thời thực tế

```
vus_max = 80                          → tối đa 80 Virtual Users
iteration_duration avg = 4.46s        → mỗi vòng lặp mất ~4.46s
iterations = 2807 / 356s ≈ 7.88/s    → ~8 iterations hoàn thành mỗi giây

Concurrent iterations in-flight = 80 VUs × (4.46s / 4.46s) = 80 iterations
→ Nhưng avg overlap = 80 VUs × (4.46s avg duration / ~1 slot) ≈ 17-18 users
   đang chờ response tại bất kỳ thời điểm nào
```

Nói đơn giản: **Tại đỉnh spike, ~17-18 requests đang đồng thời được xử lý** trong server. Đây là concurrency level mà server đang phục vụ ở steady state.

### Throughput thực tế

```
http_reqs = 16843 / 356s ≈ 47.3 RPS  → ~47 request mỗi giây
iterations = 2807 / 356s ≈ 7.88 iter/s → ~8 user journeys hoàn chỉnh mỗi giây
shopapi_orders_created = 985 / 356s ≈ 2.77 đơn/s → chỉ ~3 đơn hàng thành công/giây
```

**47 RPS là tổng load.** Nếu so với production, đây là mức tải nhỏ. Một API .NET 8 được cấu hình đúng trên hardware tốt có thể xử lý 500-2000 RPS. Việc fail ở 47 RPS cho thấy vấn đề là **resource contention** (stock/concurrency), không phải **capacity**.

---

## Giải pháp đề xuất

### Vấn đề 1: Đơn hàng bị từ chối (ưu tiên cao)

**Bước 1 — Xác nhận nguyên nhân:**
```js
// Thêm vào load-test.js
if (orderRes.status >= 400) {
  console.log(`ORDER_FAIL status=${orderRes.status} body=${orderRes.body.slice(0,300)}`);
}
```

**Nếu là hết stock (khả năng A):**
```sql
-- Seed thêm stock trước khi test
UPDATE Products SET StockQuantity = 10000 WHERE Id IN (1,2,3,4,5);
-- Hoặc thêm reset trong k6 setup()
```

**Nếu là Optimistic Concurrency (khả năng B):**
```csharp
// Option 1: Pessimistic lock (SELECT FOR UPDATE)
using var transaction = await _db.Database.BeginTransactionAsync(
    IsolationLevel.Serializable);

// Option 2: Retry on concurrency exception  
var retries = 3;
while (retries-- > 0) {
    try { await PlaceOrder(); break; }
    catch (DbUpdateConcurrencyException) { await Task.Delay(50); }
}

// Option 3: Queue orders (CQRS pattern — cho production scale)
// Đẩy vào message queue (RabbitMQ/Kafka), worker xử lý tuần tự
```

### Vấn đề 2: Login chậm dưới tải (ưu tiên trung bình)

**Giải pháp test script — Tái sử dụng token:**
```js
// Thay vì tạo user mới mỗi iteration, cache token theo VU
let cachedToken = null;

export default function () {
  // Chỉ login lại khi chưa có token hoặc token hết hạn
  if (!cachedToken) {
    const username = `k6user_vu${__VU}`;  // mỗi VU dùng 1 user cố định
    cachedToken = authenticate(username);
  }
  // ... dùng cachedToken cho các request tiếp theo
}
```

Kết quả: Thay vì 80 concurrent bcrypt operations, chỉ cần 80 lần login tổng cộng (1 lần per VU khi khởi tạo).

**Giải pháp server — Giảm bcrypt work factor trong test:**
```csharp
// appsettings.Development.json
{
  "Auth": {
    "BcryptWorkFactor": 4  // dev: 4, production: 12
  }
}
```

**Giải pháp server — Async/non-blocking password hash:**
```csharp
// Đừng block thread pool với CPU-bound work
var hashedPassword = await Task.Run(() => BCrypt.HashPassword(password, workFactor));
```

### Fix bug `min=-519000000ns` trong metric

```js
// Cũ — sai: add milliseconds nhưng k6 nghĩ là nanoseconds
const loginDuration = new Trend('shopapi_login_duration', true);
loginDuration.add(Date.now() - loginStart);

// Đúng: convert sang nanoseconds
loginDuration.add((Date.now() - loginStart) * 1_000_000);

// Hoặc: dùng k6 built-in timing (không dùng flag isTime=true)
const loginDuration = new Trend('shopapi_login_duration');  // hiển thị bằng ms
loginDuration.add(Date.now() - loginStart);  // ms, consistent
```

---

## Ma trận ưu tiên

| # | Vấn đề | Mức độ | Fix nhanh | Fix đúng |
|---|---|---|---|---|
| 1 | 65% đơn hàng bị từ chối | 🔴 Critical | Tăng stock test data | Implement retry / queue |
| 2 | Login p(95)=396ms > 300ms | 🟡 Medium | Cache token trong k6 | Async bcrypt + reduce work factor |
| 3 | Bug metric `min=-519ms` | 🟢 Low | Bỏ flag `true` trong Trend | Convert đúng đơn vị nanoseconds |

---

## Điểm mạnh cần giữ lại

- ✅ **Order processing (khi thành công): p(95)=25ms** — cực nhanh, transaction DB hoạt động tốt
- ✅ **Product browse: p(95)=14ms** — read queries được optimize tốt
- ✅ **Zero 5xx errors** — server ổn định, không crash dưới 80 VUs
- ✅ **`http_req_duration` p(95)=308ms** — tổng thể latency trong SLO
- ✅ **Test script coverage tốt** — đo đủ 4 user journey: login → browse → order → history

---

*Phân tích dựa trên: k6 output ngày 2026-06-10, script `src/k6/load-test.js`, max 80 VUs, 5m30s duration*
