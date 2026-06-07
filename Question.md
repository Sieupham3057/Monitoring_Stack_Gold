Tôi là 1 technical leader .net và angular.
Hiện tại tôi muốn nghiên cứu về mornitoring cụ thể là 

Grafana
Prometheus
K6 tạo VU đẩy dữ liệu vào InluxDb
Cadvisor để quản lý RAM,CPU ...
Thông báo với alert manager

....
Còn gì cho phần mornitor thì thêm giúp tôi.


Tôi có vmware 192.168.1.35 đã setup xong docker container.

Mục tiêu cuối cung tôi hiểu và control được về mornitor từ cơ bản đến nâng cao. Mọi câu lệnh dòng lệnh hay cấu hình luôn giải thích giúp tôi, cái nào bắt buộc, cái nào là option, và nên là như nào thì tốt nhất phù hợp nhất

=====================

Tôi nghĩ là nên có 1 project .net để tôi có thể thực hành được phần k6 đúng không?
Tôi muốn có 1 projcct đơn giản thôi. nhưng có luồng login tạo jwt xong thì tạo product hay order hay category ... đặt hàng.
Sử dụng connection string sau: "DefaultConnection": "Server=192.168.1.35,1433;Database=Mornitordb;User Id=sa;Password=YourStrong@Passw0rd2026;TrustServerCertificate=True;"

Hàng nghìn, hàng triệu user request đồng thời để kiểm tra thông tin trên mornitor và những điều mà techlead phải biết vè mornitor, theo dõi dashboard như nào. P95, P99 là gì như nào

=======================

Project hoàn chỉnh. Cấu trúc như sau:

src/ShopApi/
├── Controllers/
│   ├── AuthController.cs       ← /api/auth/register, /api/auth/login
│   ├── CategoriesController.cs ← /api/categories (CRUD)
│   ├── ProductsController.cs   ← /api/products (CRUD + phân trang)
│   └── OrdersController.cs     ← /api/orders (đặt hàng, lịch sử)
├── Data/
│   └── AppDbContext.cs          ← EF Core + Seed data sẵn
├── DTOs/                        ← Request/Response models
├── Entities/                    ← User, Category, Product, Order, OrderItem
├── Migrations/                  ← InitialCreate migration (vừa tạo)
├── Services/
│   └── JwtService.cs
├── appsettings.json             ← Connection string + JWT config
└── Program.cs                   ← Setup toàn bộ

Để chạy project

# Bước 1: Chạy API (tự migrate DB khi khởi động)
cd e:\TECHLEAD_PROJECT\MORNITORING\src\ShopApi
dotnet run

# API sẽ chạy tại http://localhost:5000
Luồng K6 sẽ test

1. POST /api/auth/register  → tạo user test
2. POST /api/auth/login      → lấy JWT token
3. GET  /api/products        → browse sản phẩm (read-heavy)
4. POST /api/orders          → đặt hàng (write + transaction)
5. GET  /api/orders          → xem lịch sử đơn hàng
P95, P99 là gì? (Tech Lead phải biết)
Metric	Ý nghĩa	Đọc như thế nào
P50 (Median)	50% request hoàn thành trong thời gian này	Nếu P50 = 50ms → hầu hết user thấy nhanh
P95	95% request hoàn thành trong thời gian này	Nếu P95 = 500ms → 5% user chịu > 500ms
P99	99% request hoàn thành trong thời gian này	Nếu P99 = 2s → 1% user chịu > 2s
P99.9	99.9% hoàn thành trong thời gian này	Dùng cho hệ thống tài chính
Tại sao không dùng Average?
Ví dụ: 99 request chạy 10ms, 1 request chạy 10,000ms → Average = 110ms (sai lệch hoàn toàn). P99 sẽ hiện 10,000ms — đó mới là sự thật.

Ngưỡng Tech Lead thường đặt:

P95 < 500ms → acceptable
P99 < 1000ms → cần xem xét
P99 > 2000ms → có vấn đề nghiêm trọng
Bước tiếp theo: deploy API lên Docker trên VMware 192.168.1.35 rồi viết K6 script bắn vào. Bạn muốn làm bước đó ngay không?