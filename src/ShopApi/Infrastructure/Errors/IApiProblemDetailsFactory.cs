using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.ModelBinding;

namespace ShopApi.Infrastructure.Errors;

public interface IApiProblemDetailsFactory
{
    ProblemDetails Create(
        HttpContext httpContext,
        int statusCode,
        string errorCode,
        string title,
        string detail);

    ValidationProblemDetails CreateValidation(
        HttpContext httpContext,
        ModelStateDictionary modelState);
}
