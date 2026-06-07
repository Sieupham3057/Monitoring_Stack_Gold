# ============================================================
# Stage 1: BUILD
# Dùng .NET SDK image để restore packages và compile
# ============================================================
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

# Copy .csproj trước — tận dụng Docker layer cache:
# Nếu .csproj không đổi thì bước restore không chạy lại, tiết kiệm thời gian build
COPY ["ShopApi.csproj", "./"]
RUN dotnet restore "ShopApi.csproj"

# Copy toàn bộ source code còn lại (đã được lọc bởi .dockerignore)
COPY . .

# Publish ở chế độ Release → tối ưu hiệu năng, output vào /app/publish
RUN dotnet publish "ShopApi.csproj" \
    -c Release \
    -o /app/publish \
    --no-restore

# ============================================================
# Stage 2: RUNTIME
# Chỉ chứa ASP.NET runtime — không có SDK → image nhỏ hơn ~3x
# SDK image ~800MB vs Runtime image ~220MB
# ============================================================
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app

# Copy chỉ output đã publish từ stage build (không copy source code)
COPY --from=build /app/publish .

# .NET 8 mặc định lắng nghe cổng 8080 bên trong container
# (khác với .NET 6/7 dùng cổng 80)
EXPOSE 8080

ENTRYPOINT ["dotnet", "ShopApi.dll"]
