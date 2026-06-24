using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using ShopApi.Data;
using ShopApi.Infrastructure;
using ShopApi.Services;

var builder = WebApplication.CreateBuilder(args);

// [BẮT BUỘC] Production nên cấp connection string qua biến môi trường
// ConnectionStrings__DefaultConnection, không lưu mật khẩu trong source code.
var connectionString = builder.Configuration.GetConnectionString("DefaultConnection")
    ?? throw new InvalidOperationException("Thiếu ConnectionStrings:DefaultConnection.");

builder.Services.AddDbContext<AppDbContext>(options =>
{
    options.UseSqlServer(
        connectionString,
        sqlOptions =>
        {
            // [KHUYẾN NGHỊ] Retry các lỗi kết nối SQL Server tạm thời.
            sqlOptions.EnableRetryOnFailure(maxRetryCount: 5);
            sqlOptions.CommandTimeout(30);
        });

    if (builder.Environment.IsDevelopment())
        options.EnableDetailedErrors();
});

var jwtKey = builder.Configuration["Jwt:Key"]
    ?? throw new InvalidOperationException("Thiếu Jwt:Key.");

if (Encoding.UTF8.GetByteCount(jwtKey) < 32)
    throw new InvalidOperationException("Jwt:Key phải dài tối thiểu 32 bytes.");

if (!double.TryParse(builder.Configuration["Jwt:ExpireMinutes"], out var jwtExpireMinutes) ||
    jwtExpireMinutes <= 0)
{
    throw new InvalidOperationException("Jwt:ExpireMinutes phải là số lớn hơn 0.");
}

builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
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
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey)),
            ClockSkew = TimeSpan.FromSeconds(30)
        };

        options.Events = new JwtBearerEvents
        {
            OnChallenge = async context =>
            {
                context.HandleResponse();
                context.Response.StatusCode = StatusCodes.Status401Unauthorized;
                await context.Response.WriteAsJsonAsync(CreateAuthProblem(
                    context.HttpContext,
                    StatusCodes.Status401Unauthorized,
                    "UNAUTHORIZED",
                    "Chưa xác thực",
                    "JWT access token bị thiếu, hết hạn hoặc không hợp lệ."));
            },
            OnForbidden = async context =>
            {
                context.Response.StatusCode = StatusCodes.Status403Forbidden;
                await context.Response.WriteAsJsonAsync(CreateAuthProblem(
                    context.HttpContext,
                    StatusCodes.Status403Forbidden,
                    "FORBIDDEN",
                    "Không có quyền truy cập",
                    "Tài khoản đã xác thực nhưng không có quyền thực hiện thao tác này."));
            }
        };
    });

builder.Services.AddAuthorization();
builder.Services.AddScoped<JwtService>();

builder.Services
    .AddControllers()
    .ConfigureApiBehaviorOptions(options =>
    {
        // [BẮT BUỘC] Chuẩn hóa lỗi DataAnnotations/model binding thành RFC 7807.
        options.InvalidModelStateResponseFactory = context =>
        {
            var problem = new ValidationProblemDetails(context.ModelState)
            {
                Status = StatusCodes.Status400BadRequest,
                Title = "Dữ liệu đầu vào không hợp lệ",
                Detail = "Vui lòng kiểm tra trường errors để biết chi tiết.",
                Type = "https://httpstatuses.com/400",
                Instance = context.HttpContext.Request.Path
            };
            problem.Extensions["errorCode"] = "VALIDATION_ERROR";
            problem.Extensions["traceId"] = context.HttpContext.TraceIdentifier;
            problem.Extensions["timestamp"] = DateTimeOffset.UtcNow;

            return new BadRequestObjectResult(problem);
        };
    });

builder.Services.AddProblemDetails();
builder.Services.AddExceptionHandler<GlobalExceptionHandler>();

var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [];
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        if (builder.Environment.IsDevelopment() && allowedOrigins.Length == 0)
        {
            policy.AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader();
            return;
        }

        if (allowedOrigins.Length == 0)
            throw new InvalidOperationException("Production yêu cầu cấu hình Cors:AllowedOrigins.");

        policy.WithOrigins(allowedOrigins).AllowAnyMethod().AllowAnyHeader();
    });
});

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(options =>
{
    options.SwaggerDoc("v1", new OpenApiInfo
    {
        Title = "ShopApi",
        Version = "v1",
        Description = "REST API .NET 8 với paging, validation và RFC 7807 error response."
    });

    options.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Description = "Nhập JWT theo format: Bearer {token}",
        Name = "Authorization",
        In = ParameterLocation.Header,
        Type = SecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "JWT"
    });

    options.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        {
            new OpenApiSecurityScheme
            {
                Reference = new OpenApiReference
                {
                    Type = ReferenceType.SecurityScheme,
                    Id = "Bearer"
                }
            },
            Array.Empty<string>()
        }
    });
});

var app = builder.Build();

// [TÙY CHỌN] Local/demo có thể auto-migrate. Production nên chạy migration
// bằng deployment job riêng để có backup, kiểm soát và rollback.
if (app.Configuration.GetValue<bool>("Database:AutoMigrate"))
{
    using var scope = app.Services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    var logger = scope.ServiceProvider.GetRequiredService<ILogger<Program>>();

    try
    {
        logger.LogInformation("Đang áp dụng database migrations...");
        await db.Database.MigrateAsync();
        logger.LogInformation("Đã áp dụng database migrations.");
    }
    catch (Exception exception)
    {
        logger.LogCritical(exception, "Không thể áp dụng database migrations.");
        throw;
    }
}

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI(options =>
        options.SwaggerEndpoint("/swagger/v1/swagger.json", "ShopApi v1"));
}

app.UseExceptionHandler();
app.UseStatusCodePages(async statusCodeContext =>
{
    var response = statusCodeContext.HttpContext.Response;
    var request = statusCodeContext.HttpContext.Request;

    if (response.HasStarted || !string.IsNullOrEmpty(response.ContentType))
        return;

    var problem = new ProblemDetails
    {
        Status = response.StatusCode,
        Title = response.StatusCode == StatusCodes.Status404NotFound
            ? "Không tìm thấy endpoint"
            : "Request không thành công",
        Detail = response.StatusCode == StatusCodes.Status404NotFound
            ? $"Không tồn tại endpoint '{request.Method} {request.Path}'."
            : "Server không thể xử lý request.",
        Type = $"https://httpstatuses.com/{response.StatusCode}",
        Instance = request.Path
    };
    problem.Extensions["errorCode"] = response.StatusCode == StatusCodes.Status404NotFound
        ? "ENDPOINT_NOT_FOUND"
        : "HTTP_ERROR";
    problem.Extensions["traceId"] = statusCodeContext.HttpContext.TraceIdentifier;
    problem.Extensions["timestamp"] = DateTimeOffset.UtcNow;

    await response.WriteAsJsonAsync(problem);
});
app.UseHttpsRedirection();
app.UseCors();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();

// [BẮT BUỘC] Liveness chỉ xác nhận process API vẫn hoạt động.
app.MapGet("/health/live", () => Results.Ok(new
{
    status = "healthy",
    timestamp = DateTimeOffset.UtcNow
})).AllowAnonymous();

// [KHUYẾN NGHỊ] Readiness kiểm tra SQL Server trước khi nhận traffic.
app.MapGet("/health/ready", async (
    AppDbContext db,
    CancellationToken cancellationToken) =>
{
    var canConnect = await db.Database.CanConnectAsync(cancellationToken);
    return canConnect
        ? Results.Ok(new { status = "ready", timestamp = DateTimeOffset.UtcNow })
        : Results.Json(
            new { status = "not_ready", timestamp = DateTimeOffset.UtcNow },
            statusCode: StatusCodes.Status503ServiceUnavailable);
}).AllowAnonymous();

app.Run();

static ProblemDetails CreateAuthProblem(
    HttpContext httpContext,
    int status,
    string errorCode,
    string title,
    string detail)
{
    var problem = new ProblemDetails
    {
        Status = status,
        Title = title,
        Detail = detail,
        Type = $"https://httpstatuses.com/{status}",
        Instance = httpContext.Request.Path
    };
    problem.Extensions["errorCode"] = errorCode;
    problem.Extensions["traceId"] = httpContext.TraceIdentifier;
    problem.Extensions["timestamp"] = DateTimeOffset.UtcNow;
    return problem;
}

// Cho phép WebApplicationFactory truy cập entry point khi bổ sung integration test.
public partial class Program;
