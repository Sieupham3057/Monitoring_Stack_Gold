using Microsoft.AspNetCore.Diagnostics;
using Microsoft.EntityFrameworkCore;
using ShopApi.Exceptions;
using ShopApi.Infrastructure.Errors;

namespace ShopApi.Infrastructure;

public sealed class GlobalExceptionHandler(
    ILogger<GlobalExceptionHandler> logger,
    IProblemDetailsService problemDetailsService,
    IApiProblemDetailsFactory apiProblemDetailsFactory,
    IHostEnvironment environment) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(
        HttpContext httpContext,
        Exception exception,
        CancellationToken cancellationToken)
    {
        var (statusCode, errorCode, title, detail) = MapException(exception);

        if (statusCode >= StatusCodes.Status500InternalServerError)
        {
            logger.LogError(
                exception,
                "Unhandled exception. TraceId: {TraceId}, Path: {Path}",
                httpContext.TraceIdentifier,
                httpContext.Request.Path);
        }
        else
        {
            logger.LogWarning(
                exception,
                "Request failed with {StatusCode}. TraceId: {TraceId}, Path: {Path}",
                statusCode,
                httpContext.TraceIdentifier,
                httpContext.Request.Path);
        }

        httpContext.Response.StatusCode = statusCode;

        var problem = apiProblemDetailsFactory.Create(
            httpContext,
            statusCode,
            errorCode,
            title,
            detail);

        return await problemDetailsService.TryWriteAsync(new ProblemDetailsContext
        {
            HttpContext = httpContext,
            ProblemDetails = problem,
            Exception = exception
        });
    }

    private (int StatusCode, string ErrorCode, string Title, string Detail) MapException(Exception exception)
    {
        if (exception is ApiException apiException)
        {
            return (
                apiException.StatusCode,
                apiException.ErrorCode,
                GetTitle(apiException.StatusCode),
                apiException.Message);
        }

        return exception switch
        {
            DbUpdateConcurrencyException => (
                StatusCodes.Status409Conflict,
                "CONCURRENCY_CONFLICT",
                "Xung đột dữ liệu",
                "Dữ liệu đã được thay đổi bởi một request khác. Vui lòng tải lại và thử lại."),

            DbUpdateException => (
                StatusCodes.Status409Conflict,
                "DATABASE_CONSTRAINT_VIOLATION",
                "Xung đột dữ liệu",
                "Không thể lưu dữ liệu do vi phạm ràng buộc dữ liệu."),

            OperationCanceledException => (
                499,
                "REQUEST_CANCELLED",
                "Request đã bị hủy",
                "Client đã hủy request trước khi server xử lý xong."),

            _ => (
                StatusCodes.Status500InternalServerError,
                "INTERNAL_SERVER_ERROR",
                "Lỗi hệ thống",
                environment.IsDevelopment()
                    ? exception.Message
                    : "Đã xảy ra lỗi không mong muốn. Vui lòng sử dụng traceId để tra cứu log.")
        };
    }

    private static string GetTitle(int statusCode) => statusCode switch
    {
        StatusCodes.Status400BadRequest => "Dữ liệu không hợp lệ",
        StatusCodes.Status401Unauthorized => "Chưa xác thực",
        StatusCodes.Status403Forbidden => "Không có quyền truy cập",
        StatusCodes.Status404NotFound => "Không tìm thấy dữ liệu",
        StatusCodes.Status409Conflict => "Xung đột dữ liệu",
        _ => "Request không thành công"
    };
}
