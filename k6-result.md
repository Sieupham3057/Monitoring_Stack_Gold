# Phân tích kết quả k6 — 03-mixed-realistic-test.js

## Kết quả test tóm tắt

| Metric | Giá trị | Đánh giá |
|---|---|---|
| `p(95)` response time | 10.83ms | ✅ Rất tốt |
| `p(99)` response time | 129.76ms | ✅ Rất tốt |
| `http_req_failed` | 33.96% | ❌ Threshold vượt (yêu cầu <5%) |
| `order_success_rate` | 30.05% | ❌ Threshold vượt (yêu cầu >80%) |

**Kết luận nhanh: API không yếu về hiệu năng. Vấn đề là stock cạn kiệt + race condition trong code.**

---

## Nguyên nhân thật sự (2 nguyên nhân)

### Nguyên nhân 1 — Stock cạn kiệt trong quá trình test (nguyên nhân chính)

**File:** `src/ShopApi/Controllers/OrdersController.cs` dòng 29–50

```csharp
// 1. Đọc stock hiện tại
var products = await db.Products
    .Where(p => productIds.Contains(p.Id))
    .ToDictionaryAsync(p => p.Id);

// 2. Kiểm tra stock
if (product.Stock < item.Quantity)
    return BadRequest(new { message = $"Sản phẩm '{product.Name}' không đủ hàng. Còn: {product.Stock}" });

// 3. Trừ stock và lưu
product.Stock -= item.Quantity;
await db.SaveChangesAsync();
```

**Tại sao fail:**
- 40 shopper chạy song song trong ~5 phút, mỗi shopper random chọn từ product ID 1–15
- Stock của mỗi sản phẩm cạn sau vài chục request đầu tiên
- Tất cả order tiếp theo trả về `400 BadRequest "không đủ hàng"`
- k6 đếm 400 vào `http_req_failed` → đẩy rate lên 33.96%
- `orderSuccessRate` chỉ tính response 200/201 → rơi xuống 30.05%

**Fix:** Seed stock lớn cho test data (ví dụ `Stock = 9999`) hoặc reset stock trong `setup()` của k6:

```js
// Trong setup() của k6 — gọi 1 admin endpoint để reset stock trước khi test
export function setup() {
  http.post(`${BASE_URL}/api/Admin/reset-stock`, null, { headers: adminHeaders });
}
```

Hoặc đơn giản hơn: tăng stock trong seed data lên đủ lớn để không cạn trong thời gian test.

---

### Nguyên nhân 2 — Race condition TOCTOU: Không có lock khi trừ stock

**File:** `src/ShopApi/Controllers/OrdersController.cs` dòng 39–63

```
VU-1: đọc Stock=5 → check OK (5 >= 1) → trừ → lưu Stock=4
VU-2: đọc Stock=5 → check OK (5 >= 1) → trừ → lưu Stock=4  ← ghi đè mất update của VU-1!
VU-3: đọc Stock=5 → check OK (5 >= 1) → trừ → lưu Stock=4  ← lại ghi đè!
```

**Vấn đề:**
- EF Core phát ra: `UPDATE Products SET Stock=4 WHERE Id=1` — không có điều kiện `WHERE Stock=5`
- Kết quả: **oversell** (bán vượt tồn kho), dữ liệu sai mà không có lỗi
- Đây là lỗi **TOCTOU (Time-Of-Check To Time-Of-Use)** — đọc và ghi không nguyên tử

**Fix đúng — Atomic update tại DB level:**
```csharp
// Thay đoạn "product.Stock -= item.Quantity;" trong vòng lặp foreach
foreach (var item in req.Items)
{
    var affected = await db.Products
        .Where(p => p.Id == item.ProductId && p.Stock >= item.Quantity)
        .ExecuteUpdateAsync(s => s.SetProperty(p => p.Stock, p => p.Stock - item.Quantity));

    if (affected == 0)
        return BadRequest(new { message = $"Sản phẩm #{item.ProductId} không đủ hàng." });
}
```

`WHERE Stock >= quantity` trong câu UPDATE là một thao tác nguyên tử tại DB — không có race condition.  
Có thể bỏ luôn đoạn đọc products và validate trước, hoặc giữ lại để có message lỗi rõ hơn.

---

## Lưu ý về k6 script: endpoint `GET /api/Orders` đang dùng đúng

**File:** `k6/03-mixed-realistic-test.js` dòng 300–301

```js
// Shopper xem lại đơn hàng vừa đặt
const res = http.get(`${BASE_URL}/api/Orders?page=1&pageSize=10`, ...);
```

Endpoint này **đúng** với ShopApi. `GET /api/Orders` trong ShopApi (dòng 69–96) tự filter theo `UserId` của token — mọi authenticated user đều nhận được đơn hàng của chính mình, không có permission đặc biệt.

---

## Kết luận: Không cần scale API lúc này

| Chỉ số | Giá trị | Ý nghĩa |
|---|---|---|
| `p95` response time | 10ms | API đang nhàn rỗi, không bị bottleneck |
| `http_req_failed` nguyên nhân | 400 BadRequest | Stock cạn, không phải overload |
| `order_success_rate` thấp | Stock hết từ sớm | Cần fix seed data + race condition |

**Scaling API khi vấn đề là code bug sẽ không có tác dụng.** Fix code trước.

---

# Khi nào cần Scale API?

Scale API (thêm instance/pod) chỉ có tác dụng khi **API đang là bottleneck thật sự**:

## Dấu hiệu CẦN scale API

| Dấu hiệu | Metric k6 | Ý nghĩa |
|---|---|---|
| Response time tăng theo số VU | `p95` vượt threshold khi tăng load | API đang quá tải CPU/thread |
| Timeout nhiều | `http_req_failed` do timeout, không phải 4xx | Connection pool cạn hoặc thread starve |
| CPU API server > 70–80% liên tục | Quan sát qua cAdvisor/Prometheus | Xử lý business logic nặng |
| Request queue tăng | Grafana: active connections tăng | Không đủ worker thread |
| Latency tăng tuyến tính với VU | p50, p95, p99 đều tăng cùng lúc | CPU bound |

## Dấu hiệu KHÔNG cần scale API (vấn đề ở chỗ khác)

| Dấu hiệu | Nguyên nhân thật | Fix đúng |
|---|---|---|
| Nhiều 400/422 | Bug validation / stock hết | Fix code |
| `p95` thấp nhưng `rate failed` cao | Logic fail, không phải slow | Fix business logic |
| Latency cao chỉ ở 1 endpoint | Query DB chậm | Tối ưu query, thêm index |
| Timeout chỉ ở write path | DB lock contention | Fix transaction / index |
| Memory leak từng tăng | Resource leak trong code | Fix code |

## Khi scale API thật sự cần thiết — Checklist trước khi scale

```
1. p95 > 1000ms VÀ CPU > 70%       → Scale API (add instances)
2. p95 < 100ms nhưng rate failed cao → Fix code trước
3. Latency chỉ tăng ở 1–2 endpoint  → Tối ưu query DB
4. Latency tăng tất cả endpoint     → Scale API hoặc review thread pool
```

---

# Khi Scale API vẫn không giải quyết được → Scale Database

## Tình huống: Scale API xong vẫn còn vấn đề

Sau khi scale API từ 1 lên 3 instances, response time vẫn cao, vẫn có nhiều lỗi concurrent.
**Lý do:** API không còn là bottleneck nữa, nhưng tất cả 3 instance đều trỏ vào **1 database duy nhất**.

```
API Instance 1 ──┐
API Instance 2 ──┼──► SQL Server (1 node) ← BOTTLENECK MỚI
API Instance 3 ──┘
```

## Dấu hiệu Database đang là bottleneck

| Dấu hiệu | Quan sát ở đâu | Ý nghĩa |
|---|---|---|
| Latency cao ở write endpoint | Grafana: `order_duration` tăng | DB đang lock / slow write |
| CPU DB server > 80% | cAdvisor / Prometheus | Query scan nhiều, thiếu index |
| Wait stats cao (lock waits) | SQL Server DMV: `sys.dm_exec_requests` | Lock contention |
| API CPU thấp nhưng response chậm | So sánh API vs DB metrics | Time spent waiting for DB |
| Connection pool exhausted | Log: "timeout waiting for connection" | Quá nhiều concurrent queries |

## Chiến lược Scale Database (theo thứ tự ưu tiên)

### Cấp 1 — Tối ưu query (KHÔNG cần thêm server)

```sql
-- Kiểm tra missing index
SELECT * FROM sys.dm_db_missing_index_details

-- Với ShopApi, cần index:
-- Products(Id, Stock)        ← query tạo order (check + update stock)
-- Orders(UserId, CreatedAt)  ← query xem đơn theo user
```

### Cấp 2 — Read Replica (Scale đọc)

```
                    ┌─► Read Replica 1 (đọc)
API Instances ──────┼─► Read Replica 2 (đọc)
                    └─► Primary DB     (ghi)
```

**Phù hợp khi:** 70–80% traffic là đọc (GET products, GET categories, GET orders).
Đúng với ShopApi — readers chiếm 70% traffic trong kịch bản test.

### Cấp 3 — Cache Layer trước DB (giảm tải DB đọc)

```
API → Redis Cache → (miss) → Database
```

Với ShopApi:
- Cache `GET /api/Categories` — hiếm thay đổi, đọc rất nhiều
- Cache `GET /api/Products` — TTL 30–60 giây
- **KHÔNG cache** `GET /api/Orders` — dữ liệu cá nhân, thay đổi liên tục

### Cấp 4 — Sharding (Scale ghi theo partition)

Chia dữ liệu theo key (ví dụ: userId % 4 → DB shard 0/1/2/3).
**Phức tạp, chỉ cần khi:** Write throughput > 10.000 TPS, đã tối ưu hết cấp 1, 2, 3.

---

## Sơ đồ quyết định: Khi nào làm gì?

```
                     Test bị fail
                          │
              ┌───────────┴──────────────┐
              │                          │
         4xx nhiều                  Timeout/slow
              │                          │
         Fix code                   p95 > 1000ms?
                                         │
                              ┌──────────┴──────────┐
                              │ Không                │ Có
                         Fix query/index        CPU API cao?
                                                     │
                                        ┌────────────┴───────────┐
                                        │ Không                  │ Có
                                   DB là bottleneck         Scale API
                                        │                  (add instances)
                                   ┌────┴────┐
                                   │         │
                              Read heavy  Write heavy
                                   │         │
                            Read Replica   Optimize
                            + Cache        transactions
                                           + Sharding
                                           (nếu cần)
```

---

## Áp dụng cho ShopApi hiện tại

| Bước | Việc cần làm | Ưu tiên |
|---|---|---|
| 1 | Tăng seed stock đủ lớn (ví dụ 9999) để không cạn trong test | Ngay bây giờ |
| 2 | Sửa race condition: dùng `ExecuteUpdateAsync` với `WHERE Stock >= quantity` | Ngay bây giờ |
| 3 | Thêm index `Products(Id, Stock)` | Trước khi production |
| 4 | Thêm Redis cache cho Categories, Products list | Khi traffic thật tăng |
| 5 | Scale API (add instances) | Khi CPU > 70% liên tục |
| 6 | Read Replica DB | Khi DB CPU > 70% mà chủ yếu là đọc |
| 7 | Sharding | Khi write > 10.000 TPS (hầu như không cần với ShopApi) |
