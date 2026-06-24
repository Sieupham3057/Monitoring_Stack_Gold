# ShopApi — hướng dẫn vận hành production

## 1. Product API

### Paging, search, filter và sort

```http
GET /api/products?pageNumber=1&pageSize=20
    &search=laptop
    &categoryId=1
    &minPrice=100000
    &maxPrice=30000000
    &inStock=true
    &sortBy=price
    &sortDirection=desc
```

- `[BẮT BUỘC]` `pageNumber` phải từ `1`; mặc định là `1`.
- `[BẮT BUỘC]` `pageSize` từ `1` đến `100`; mặc định là `20`. Giới hạn trên bảo vệ database khỏi request lấy quá nhiều dữ liệu.
- `[TÙY CHỌN]` `search` tìm trong `Name` và `Description`.
- `[TÙY CHỌN]` `categoryId`, `minPrice`, `maxPrice`, `inStock` dùng để lọc.
- `[TÙY CHỌN]` `sortBy` nhận `id`, `name`, `price`, `stock`.
- `[TÙY CHỌN]` `sortDirection` nhận `asc` hoặc `desc`.

Response paging:

```json
{
  "items": [],
  "totalCount": 0,
  "pageNumber": 1,
  "pageSize": 20,
  "totalPages": 0,
  "hasPreviousPage": false,
  "hasNextPage": false
}
```

`totalCount` được tính sau khi áp dụng search/filter nhưng trước `Skip/Take`. Vì vậy frontend có thể vẽ pager chính xác.

### Category paging và search

```http
GET /api/categories?pageNumber=1&pageSize=20
    &search=electronic
    &sortBy=productCount
    &sortDirection=desc
```

- `[TÙY CHỌN]` `search` tìm trong tên và mô tả Category.
- `[TÙY CHỌN]` `sortBy` nhận `id`, `name`, `productCount`.
- `[BẮT BUỘC]` Response dùng cùng cấu trúc `PagedResult<T>` với Product.

### Order paging, search và filter

```http
GET /api/orders?pageNumber=1&pageSize=10
    &search=laptop
    &status=Pending
    &fromDate=2026-01-01T00:00:00Z
    &toDate=2026-12-31T23:59:59Z
    &sortBy=totalAmount
    &sortDirection=desc
```

- `[TÙY CHỌN]` `search` dạng số tìm theo Order ID và tên sản phẩm; dạng chữ tìm theo tên sản phẩm.
- `[TÙY CHỌN]` `status` nhận `Pending`, `Confirmed`, `Shipped`, `Delivered`, `Cancelled`.
- `[TÙY CHỌN]` `fromDate`, `toDate` lọc theo thời gian tạo đơn hàng.
- `[TÙY CHỌN]` `sortBy` nhận `id`, `totalAmount`, `createdAt`, `status`.
- `[BẮT BUỘC]` Endpoint chỉ tìm trong đơn hàng của user hiện tại, không làm lộ đơn của user khác.

## 2. Validation và error contract

DTO sử dụng DataAnnotations. `[ApiController]` tự kiểm tra DTO trước khi action chạy.

Mọi lỗi được trả theo RFC 7807:

```json
{
  "type": "https://httpstatuses.com/400",
  "title": "Dữ liệu đầu vào không hợp lệ",
  "status": 400,
  "detail": "Vui lòng kiểm tra trường errors để biết chi tiết.",
  "instance": "/api/products",
  "errors": {
    "Name": [
      "Tên sản phẩm là bắt buộc."
    ]
  },
  "errorCode": "VALIDATION_ERROR",
  "traceId": "0HN...",
  "timestamp": "2026-06-24T03:00:00+00:00"
}
```

- `[BẮT BUỘC]` Client dùng `status` để phân loại HTTP.
- `[KHUYẾN NGHỊ]` Client dùng `errorCode` cho logic nghiệp vụ, không parse chuỗi `detail`.
- `[KHUYẾN NGHỊ]` Gửi `traceId` cho đội vận hành khi cần tra log.
- `[BẮT BUỘC]` Production không trả stack trace hoặc nội dung exception nội bộ.

## 3. Database migration

Migration `ProductionApiHardening` bổ sung:

- `rowversion` cho Product để phát hiện cập nhật tồn kho đồng thời.
- Index cho `Products.Name` và `Products.Price`.
- Unique index cho `Categories.Name`.
- Giới hạn độ dài Description đồng bộ với DTO.
- `DeleteBehavior.Restrict` để không xóa dây chuyền dữ liệu lịch sử.

Chạy migration:

```powershell
dotnet ef database update
```

- `[BẮT BUỘC]` Lệnh đọc connection string, kết nối SQL Server và áp dụng các migration chưa chạy.
- `[BẮT BUỘC]` Backup database trước khi chạy trên production.
- `[BẮT BUỘC]` Migration sẽ chủ động dừng nếu Description hiện tại vượt giới hạn hoặc tên Category bị trùng; cần làm sạch dữ liệu trước.
- `[KHUYẾN NGHỊ]` Production chạy lệnh này trong deployment job riêng. Không bật auto-migrate trong nhiều API replica.

Sinh SQL để DBA review trước:

```powershell
dotnet ef migrations script 20260607005828_InitialCreate 20260624030101_ProductionApiHardening --idempotent -o migration.sql
```

- `[KHUYẾN NGHỊ]` `--idempotent` tạo script có kiểm tra migration đã được áp dụng hay chưa.
- `[KHUYẾN NGHỊ]` `-o migration.sql` ghi script ra file để review, phê duyệt và lưu artifact.

## 4. Cấu hình môi trường

### Local/Development

`appsettings.Development.json` đang bật:

```json
{
  "Database": {
    "AutoMigrate": true
  }
}
```

`[TÙY CHỌN]` Cấu hình này giúp local tự cập nhật schema khi API khởi động.

### Production

Các biến môi trường nên được cấp bởi Docker Compose secret, CI/CD hoặc secret manager:

```text
ConnectionStrings__DefaultConnection=Server=...;Database=...;User Id=...;Password=...
Jwt__Key=<secret tối thiểu 32 bytes>
Jwt__Issuer=ShopApi
Jwt__Audience=ShopApiClient
Cors__AllowedOrigins__0=https://shop.example.com
Cors__AllowedMethods__0=GET
Cors__AllowedMethods__1=POST
Cors__AllowedHeaders__0=Authorization
Cors__AllowedHeaders__1=Content-Type
Cors__AllowCredentials=false
Database__AutoMigrate=false
```

- `[BẮT BUỘC]` Dấu `__` ánh xạ vào cấp cấu hình .NET.
- `[BẮT BUỘC]` Không commit mật khẩu SQL Server và JWT key thật.
- `[BẮT BUỘC]` CORS production chỉ cho phép origin frontend thực tế.
- `[BẮT BUỘC]` Origin chỉ gồm scheme + host + port, không thêm path hoặc dấu `/` cuối.
- `[KHUYẾN NGHỊ]` Chỉ khai báo HTTP methods và headers frontend thực sự sử dụng.
- `[BẮT BUỘC]` Không dùng wildcard origin khi `AllowCredentials=true`.
- `[KHUYẾN NGHỊ]` Rotate JWT key và database password đã từng xuất hiện trong source/history.

## 5. Health endpoints

- `GET /health/live`: `[BẮT BUỘC]` xác nhận process API còn sống.
- `GET /health/ready`: `[KHUYẾN NGHỊ]` kiểm tra API kết nối được SQL Server.

Load balancer/Kubernetes nên dùng `live` cho liveness và `ready` cho readiness. Không dùng readiness làm liveness vì sự cố database tạm thời không nên khiến container restart liên tục.

## 6. Kiểm tra source code

```powershell
dotnet build
```

`[BẮT BUỘC]` Restore package nếu cần, compile toàn bộ project và phát hiện lỗi kiểu dữ liệu/cú pháp.

```powershell
dotnet run
```

`[BẮT BUỘC]` Khởi động API theo profile local. Swagger chỉ mở trong Development tại `/swagger`.

File [ShopApi.http](ShopApi.http) có sẵn request mẫu cho register, login, paging/search Product, Orders và health check.

## 7. Serilog và file log

Serilog được cấu hình trong `appsettings.json` và ghi đồng thời ra console lẫn file:

```text
logs/shop-api-YYYYMMDD.log
```

- `[BẮT BUỘC]` File log được roll theo ngày.
- `[BẮT BUỘC]` Khi file đạt 100 MB, Serilog tạo file kế tiếp để tránh một file tăng không giới hạn.
- `[KHUYẾN NGHỊ]` Chỉ giữ 30 file log gần nhất để kiểm soát dung lượng ổ đĩa.
- `[KHUYẾN NGHỊ]` Mỗi HTTP request được ghi một event gồm method, path, status code, thời gian xử lý và `TraceId`.
- `[BẮT BUỘC]` Khi chạy Docker, mount thư mục `/app/logs` ra volume để log không mất khi container bị recreate.

Ví dụ Docker Compose:

```yaml
services:
  shop-api:
    volumes:
      # [BẮT BUỘC] Lưu file log bên ngoài writable layer của container.
      - shop-api-logs:/app/logs

volumes:
  # [BẮT BUỘC] Docker quản lý vòng đời volume log.
  shop-api-logs:
```

`Program.cs` có bootstrap logger và `try/catch/finally`:

- `[BẮT BUỘC]` Lỗi xảy ra trước khi host khởi động vẫn được ghi vào `logs/shop-api-bootstrap-YYYYMMDD.log`.
- `[BẮT BUỘC]` Lỗi khởi động thật đặt process exit code thành `1`.
- `[BẮT BUỘC]` `finally` flush log trước khi process kết thúc.
