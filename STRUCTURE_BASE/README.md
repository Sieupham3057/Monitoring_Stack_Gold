# Enterprise React Base

Nền tảng quản trị React + TypeScript theo contract trong `swagger.json`, dùng HTML/CSS thuần theo phong cách SB Admin 2, Redux Toolkit/RTK Query, React Router, React Hook Form và Zod.

## Chạy dự án

```bash
cp .env.example .env
npm install
npm run dev
```

## Chạy bằng Docker

```powershell
Copy-Item .env.docker.example .env.docker
docker compose --env-file .env.docker up -d --build
```

Mở `http://localhost:8080`. Xem hướng dẫn đầy đủ trong
[`Docker_Deploy.md`](./Docker_Deploy.md).

Backend development mặc định: `http://localhost:5065`, được gọi thông qua Vite proxy để
không vướng CORS. Có thể đổi đích proxy bằng `VITE_API_PROXY_TARGET`.

Trong production nên reverse proxy frontend và `/api` về cùng domain. Nếu frontend và API
khác domain, đặt `VITE_API_URL` thành URL API và cấu hình CORS tương ứng ở backend.

## Lệnh kiểm tra

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

## Kiến trúc

```text
src/
  app/             store, typed hooks, router
  config/          environment, route và business constants
  features/        module nghiệp vụ độc lập
    auth/
    categories/
    dashboard/
    orders/
    products/
  layouts/         application shell
  shared/
    api/            baseApi, chuẩn hóa RFC 7807
    hooks/          hook tái sử dụng
    types/          contract dùng chung
    ui/             toast, confirm, loading, pagination...
    utils/          format, safe storage
  styles/
```

Server state nằm trong RTK Query. Redux slice chỉ giữ client state (`auth`, `ui`). Endpoint feature được inject vào một `baseApi`, do đó không lặp cấu hình token, timeout, reconnect hay cache.

Phần giao diện không phụ thuộc UI component library. Các file page sử dụng trực tiếp
`button`, `form`, `input`, `select`, `table`, `aside`, `nav` và CSS trong `src/styles/index.css`.

## Xử lý API và lỗi

- Tự gắn Bearer token và xóa phiên khi API trả `401`.
- Timeout cấu hình qua environment.
- Hỗ trợ lỗi mạng, HTTP phổ biến và RFC 7807 `ProblemDetails`/`ValidationProblemDetails`.
- Lỗi validation backend được ánh xạ về đúng field trong form.
- Mutation thành công/thất bại dùng toast; thao tác phá hủy dùng confirm modal.
- Query có skeleton lần tải đầu, giữ dữ liệu khi refetch, empty state và nút thử lại.

Backend hiện không cung cấp refresh-token hoặc role/permission. Khi bổ sung contract, hãy mở rộng `baseQueryWithAuth` và tạo `PermissionGuard`; không lưu refresh token trong Redux.

## Thêm module mới

1. Tạo `features/<name>/types.ts` theo Swagger.
2. Dùng `baseApi.injectEndpoints` và khai báo tag cache.
3. Tách page, form modal/component; dùng UI trong `shared/ui`.
4. Thêm lazy route và navigation.
5. Thêm validation Zod khớp giới hạn backend.

Không tạo repository/service trung gian cho CRUD đơn giản: endpoint RTK Query đã là data-access layer. Chỉ thêm service khi có logic nghiệp vụ thực sự được tái sử dụng.
