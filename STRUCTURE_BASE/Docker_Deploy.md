# Deploy React bằng Docker

## Kiến trúc container

```text
Browser
   |
   | http://localhost:8080
   v
Nginx frontend container
   |-- /assets, /index.html -> React static files
   |-- /dashboard          -> fallback /index.html
   `-- /api/*              -> reverse proxy tới backend
```

Container production không chạy Vite hoặc Node.js.

- Stage `build` dùng Node.js để chạy `npm ci` và `npm run build`.
- Stage `runtime` chỉ dùng Nginx để phục vụ thư mục `dist`.
- Nginx xử lý React Router fallback và proxy API.

## Trường hợp backend chạy trên máy host

Tạo file cấu hình:

```powershell
Copy-Item .env.docker.example .env.docker
```

Nội dung mặc định:

```env
FRONTEND_PORT=8080
API_UPSTREAM=http://host.docker.internal:5065
```

Build và chạy:

```powershell
docker compose --env-file .env.docker up -d --build
```

Mở ứng dụng:

```text
http://localhost:8080
```

Kiểm tra health:

```powershell
Invoke-WebRequest http://localhost:8080/healthz
```

Xem trạng thái:

```powershell
docker compose ps
```

Xem log:

```powershell
docker compose logs -f frontend
```

Dừng container:

```powershell
docker compose down
```

## Trường hợp backend cũng chạy trong Docker Compose

Nếu backend có service tên `backend` và lắng nghe cổng `8080` bên trong container:

```yaml
services:
  backend:
    image: your-backend-image
    networks:
      - shop-network

  frontend:
    environment:
      API_UPSTREAM: http://backend:8080
```

Không dùng `localhost` để frontend container gọi backend container.

Trong container:

```text
localhost = chính container hiện tại
backend   = service backend trên Docker network
```

## Các biến cấu hình

| Biến | Mặc định | Mục đích |
|---|---|---|
| `FRONTEND_PORT` | `8080` | Cổng truy cập frontend trên host |
| `API_UPSTREAM` | `http://host.docker.internal:5065` | Backend mà Nginx proxy `/api` tới |
| `VITE_APP_NAME` | `Shop Admin` | Tên ứng dụng, được đóng gói lúc build |
| `VITE_REQUEST_TIMEOUT_MS` | `30000` | Timeout request frontend |

`VITE_*` là build-time variables. Khi thay các biến này cần build lại image:

```powershell
docker compose --env-file .env.docker up -d --build
```

`API_UPSTREAM` là runtime variable của Nginx. Khi đổi có thể recreate container mà không cần build lại source:

```powershell
docker compose --env-file .env.docker up -d --force-recreate
```

## Chỉ build Docker image

```powershell
docker build -t shop-admin-frontend:1.0.0 .
```

Chạy image:

```powershell
docker run --rm `
  --name shop-admin-frontend `
  -p 8080:80 `
  --add-host host.docker.internal:host-gateway `
  -e API_UPSTREAM=http://host.docker.internal:5065 `
  shop-admin-frontend:1.0.0
```

## Lưu ý production

- Dùng domain và HTTPS ở reverse proxy ngoài cùng.
- Không expose backend trực tiếp nếu không cần thiết.
- Pin image tag khi quy trình release yêu cầu khả năng tái tạo tuyệt đối.
- Không đặt secret trong biến `VITE_*`; chúng xuất hiện trong JavaScript trình duyệt.
- API URL nên giữ cùng origin `/api` để tránh CORS.
- Dùng registry như Docker Hub, GHCR, Azure Container Registry hoặc AWS ECR để lưu image.
