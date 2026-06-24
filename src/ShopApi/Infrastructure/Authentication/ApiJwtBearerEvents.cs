using Microsoft.AspNetCore.Authentication.JwtBearer;
using ShopApi.Infrastructure.Errors;

namespace ShopApi.Infrastructure.Authentication;

public sealed class ApiJwtBearerEvents(
    IApiProblemDetailsFactory problemDetailsFactory) : JwtBearerEvents
{
    public override async Task Challenge(JwtBearerChallengeContext context)
    {
        context.HandleResponse();
        context.Response.StatusCode = StatusCodes.Status401Unauthorized;

        var problem = problemDetailsFactory.Create(
            context.HttpContext,
            StatusCodes.Status401Unauthorized,
            "UNAUTHORIZED",
            "Chưa xác thực",
            "JWT access token bị thiếu, hết hạn hoặc không hợp lệ.");

        await context.Response.WriteAsJsonAsync(problem);
    }

    public override async Task Forbidden(ForbiddenContext context)
    {
        context.Response.StatusCode = StatusCodes.Status403Forbidden;

        var problem = problemDetailsFactory.Create(
            context.HttpContext,
            StatusCodes.Status403Forbidden,
            "FORBIDDEN",
            "Không có quyền truy cập",
            "Tài khoản đã xác thực nhưng không có quyền thực hiện thao tác này.");

        await context.Response.WriteAsJsonAsync(problem);
    }
}
