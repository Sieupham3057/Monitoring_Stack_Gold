using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.ModelBinding;

namespace ShopApi.Infrastructure.Errors;

public sealed class ApiProblemDetailsFactory : IApiProblemDetailsFactory
{
    public ProblemDetails Create(
        HttpContext httpContext,
        int statusCode,
        string errorCode,
        string title,
        string detail)
    {
        var problem = new ProblemDetails
        {
            Status = statusCode,
            Title = title,
            Detail = detail,
            Type = $"https://httpstatuses.com/{statusCode}",
            Instance = httpContext.Request.Path
        };

        AddCommonExtensions(problem, httpContext, errorCode);
        return problem;
    }

    public ValidationProblemDetails CreateValidation(
        HttpContext httpContext,
        ModelStateDictionary modelState)
    {
        var problem = new ValidationProblemDetails(modelState)
        {
            Status = StatusCodes.Status400BadRequest,
            Title = "Dữ liệu đầu vào không hợp lệ",
            Detail = "Vui lòng kiểm tra trường errors để biết chi tiết.",
            Type = "https://httpstatuses.com/400",
            Instance = httpContext.Request.Path
        };

        AddCommonExtensions(problem, httpContext, "VALIDATION_ERROR");
        return problem;
    }

    private static void AddCommonExtensions(
        ProblemDetails problem,
        HttpContext httpContext,
        string errorCode)
    {
        problem.Extensions["errorCode"] = errorCode;
        problem.Extensions["traceId"] = httpContext.TraceIdentifier;
        problem.Extensions["timestamp"] = DateTimeOffset.UtcNow;
    }
}
