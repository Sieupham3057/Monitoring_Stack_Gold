using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using ShopApi.Data;
using ShopApi.Services;

var builder = WebApplication.CreateBuilder(args);

// =============================================
// 1. DATABASE — Entity Framework Core + SQL Server
// =============================================
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("DefaultConnection")));

// =============================================
// 2. JWT AUTHENTICATION
// =============================================
var jwtKey = builder.Configuration["Jwt:Key"]!;
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = builder.Configuration["Jwt:Issuer"],
            ValidAudience = builder.Configuration["Jwt:Audience"],
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey))
        };
    });

builder.Services.AddAuthorization();

// =============================================
// 3. SERVICES
// =============================================
builder.Services.AddScoped<JwtService>();
builder.Services.AddControllers();

// =============================================
// 4. CORS — cho phép K6 và frontend gọi API
// =============================================
builder.Services.AddCors(options =>
    options.AddDefaultPolicy(policy =>
        policy.AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader()));

// =============================================
// 5. SWAGGER — giao diện test API trực quan
// =============================================
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new OpenApiInfo
    {
        Title = "ShopApi — Monitoring Demo",
        Version = "v1",
        Description = "API để test K6 load testing + Monitoring với Prometheus/Grafana"
    });

    // Thêm nút Authorize trong Swagger để test JWT
    c.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Description = "Nhập JWT token theo format: Bearer {token}",
        Name = "Authorization",
        In = ParameterLocation.Header,
        Type = SecuritySchemeType.ApiKey,
        Scheme = "Bearer"
    });

    c.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        {
            new OpenApiSecurityScheme
            {
                Reference = new OpenApiReference { Type = ReferenceType.SecurityScheme, Id = "Bearer" }
            },
            Array.Empty<string>()
        }
    });
});

var app = builder.Build();

// =============================================
// 6. AUTO MIGRATE khi khởi động
// Nếu SQL Server chưa kết nối được → log lỗi rõ ràng, không crash thầm lặng
// =============================================
using (var scope = app.Services.CreateScope())
{
    var logger = scope.ServiceProvider.GetRequiredService<ILogger<Program>>();
    try
    {
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        logger.LogInformation("Đang kết nối SQL Server và chạy migration...");
        db.Database.Migrate();
        logger.LogInformation("Migration hoàn thành.");
    }
    catch (Exception ex)
    {
        logger.LogError(ex, "Lỗi kết nối SQL Server. Kiểm tra connection string và SQL Server tại 192.168.1.35");
    }
}

// =============================================
// 7. PIPELINE — thứ tự middleware quan trọng
// =============================================
app.UseSwagger();
app.UseSwaggerUI(c =>
{
    c.SwaggerEndpoint("/swagger/v1/swagger.json", "ShopApi v1");
    // RoutePrefix mặc định = "swagger" → truy cập tại /swagger
});

app.UseCors();
app.UseAuthentication(); // [BẮT BUỘC] phải trước UseAuthorization
app.UseAuthorization();
app.MapControllers();

// Health check — K6 ping trước khi test
app.MapGet("/health", () => new { status = "healthy", timestamp = DateTime.UtcNow });

app.Run();
