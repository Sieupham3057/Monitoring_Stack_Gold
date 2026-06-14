# Phân tích kết quả k6 — 03-mixed-realistic-test.js

## Kết quả test tóm tắt

| Metric | Giá trị | Đánh giá |
|---|---|---|
| `p(95)` response time | 10.83ms | ✅ Rất tốt |
| `p(99)` response time | 129.76ms | ✅ Rất tốt |
| `http_req_failed` | 33.96% | ❌ Threshold vượt (yêu cầu <5%) |
| `order_success_rate` | 30.05% | ❌ Threshold vượt (yêu cầu >80%) |

**Kết luận nhanh: API không yếu về hiệu năng. Vấn đề là business logic bug + sai test script.**

---

## Nguyên nhân thật sự (3 nguyên nhân)

### Nguyên nhân 1 — Bug trong k6 script: Sai endpoint xem đơn hàng

**File:** `k6/03-mixed-realistic-test.js` dòng 300

```js
// ĐANG GỌI (sai):
GET /api/Orders?page=1&pageSize=10

// ĐÚNG phải là:
GET /api/Orders/my?page=1&pageSize=10
```

**Tại sao sai:**
- `GET /api/Orders` yêu cầu permission `[HasPermission("ORDER", "VIEW")]` — chỉ admin/manager mới có
- Regular shopper nhận **403 Forbidden**
- k6 đếm tất cả response không phải 2xx vào `http_req_failed`
- Mỗi shopper đều có 1 lần gọi này → góp phần lớn vào 33.96% failed

**Fix:** Đổi sang `/api/Orders/my` — endpoint dành riêng cho user xem đơn của mình, không cần permission đặc biệt.

---

### Nguyên nhân 2 — Stock cạn kiệt trong quá trình test (nguyên nhân chính)

**File:** `AuthDemo.Api/Controllers/OrdersController.cs` dòng 93–124

```csharp
// 1. Đọc stock hiện tại
var products = await _db.Products
    .Where(p => productIds.Contains(p.Id) && p.IsActive)
    .ToDictionaryAsync(p => p.Id);

// 2. Kiểm tra stock
if (product.Stock < item.Quantity)
    return BadRequest("không đủ tồn kho");  // ← Đây là thủ phạm

// 3. Trừ stock và lưu
products[item.ProductId].Stock -= item.Quantity;
await _db.SaveChangesAsync();
```

**Tại sao fail:**
- 40 shopper chạy song song trong 5 phút 30 giây
- Tất cả random pick từ 15 product IDs (1–15)
- Stock của mỗi sản phẩm cạn sau vài chục request đầu tiên
- Tất cả order tiếp theo trả về 400 BadRequest "không đủ tồn kho"
- k6 đếm 400 vào `http_req_failed` và `order_success_rate` thất bại

**Fix:** Seed stock lớn cho test (ví dụ `Stock = 9999`) hoặc reset stock trong `setup()` của k6.

---

### Nguyên nhân 3 — Race condition TOCTOU: Không có lock khi trừ stock

**File:** `AuthDemo.Api/Controllers/OrdersController.cs` dòng 93–127

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
// Thay đoạn "products[item.ProductId].Stock -= item.Quantity;"
foreach (var item in request.Items)
{
    var affected = await _db.Products
        .Where(p => p.Id == item.ProductId && p.Stock >= item.Quantity)
        .ExecuteUpdateAsync(s => s.SetProperty(p => p.Stock, p => p.Stock - item.Quantity));

    if (affected == 0)
        return Conflict(new { message = $"Sản phẩm ID {item.ProductId} vừa hết hàng." });
}
```

`WHERE Stock >= quantity` trong câu UPDATE là một thao tác nguyên tử tại DB — không có race condition.

---

## Kết luận: Không cần scale API lúc này

| Chỉ số | Giá trị | Ý nghĩa |
|---|---|---|
| `p95` response time | 10ms | API đang nhàn rỗi, không bị bottleneck |
| CPU/RAM usage | (thấp) | Tài nguyên chưa bão hòa |
| `http_req_failed` nguyên nhân | 400/403 | Logic bug, không phải overload |

**Scaling API khi vấn đề là code bug sẽ không có tác dụng.** Fix code trước.

---

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
| Nhiều 400/403/422 | Bug validation / sai permission | Fix code |
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

-- Với OrdersController, cần index:
-- Products(Id, IsActive, Stock)  ← query tạo order
-- Orders(UserId, CreatedAt)      ← query xem đơn theo user
```

Với ShopApi hiện tại:
- `Product.Stock` thường xuyên được đọc và ghi đồng thời → cần **index bao phủ**
- `Order.UserId` được filter thường xuyên → đã có index trong DbContext (tốt)

### Cấp 2 — Read Replica (Scale đọc)

```
                    ┌─► Read Replica 1 (đọc)
API Instances ──────┼─► Read Replica 2 (đọc)
                    └─► Primary DB     (ghi)
```

**Phù hợp khi:** 70–80% traffic là đọc (GET products, GET categories, GET orders).
Đúng với hệ thống ShopApi — readers chiếm 70% traffic.

EF Core hỗ trợ read replica qua:
```csharp
// Query đọc → chạy trên replica
_db.Products.AsNoTracking().Where(...) // dùng read connection string

// Query ghi → chạy trên primary
_db.SaveChangesAsync()
```

### Cấp 3 — Sharding (Scale ghi theo partition)

Chia dữ liệu theo key (ví dụ: userId % 4 → DB shard 0/1/2/3).
**Phức tạp, chỉ cần khi:** Write throughput > 10.000 TPS, đã tối ưu hết cấp 1 và 2.

### Cấp 4 — Cache Layer trước DB (giảm tải DB đọc)

```
API → Redis Cache → (miss) → Database
```

Với ShopApi:
- Cache `GET /api/Categories` — hiếm thay đổi, đọc rất nhiều
- Cache `GET /api/Products` — TTL 30–60 giây
- **KHÔNG cache** `GET /api/Orders` — dữ liệu cá nhân, thay đổi liên tục

---

## Sơ đồ quyết định: Khi nào làm gì?

```
                     Test bị fail
                          │
              ┌───────────┴──────────────┐
              │                          │
         4xx/403 nhiều              Timeout/slow
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
| 1 | Sửa k6 script: đổi `/api/Orders` → `/api/Orders/my` | Ngay bây giờ |
| 2 | Sửa race condition: dùng `ExecuteUpdateAsync` với WHERE | Ngay bây giờ |
| 3 | Tăng seed stock cho test data | Ngay bây giờ |
| 4 | Thêm index `Products(IsActive, Stock)` | Trước khi production |
| 5 | Thêm Redis cache cho Categories, Products list | Khi traffic thật tăng |
| 6 | Scale API (add instances) | Khi CPU > 70% liên tục |
| 7 | Read Replica DB | Khi DB CPU > 70% mà chủ yếu là đọc |
| 8 | Sharding | Khi write > 10.000 TPS (hầu như không cần với ShopApi) |
