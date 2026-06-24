using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.ModelBinding;
using ShopApi.Infrastructure.Errors;

namespace ShopApi.Controllers;

/// <summary>
/// Base class cho toàn bộ REST API controller.
/// Các metadata dùng chung được khai báo một lần tại đây để mọi controller
/// có cùng route convention và cùng response content type.
/// </summary>
[ApiController]
[Route("api/[controller]")]
[Produces("application/json")]
public abstract class ApiControllerBase(
    IApiProblemDetailsFactory problemDetailsFactory) : ControllerBase
{
    /// <summary>
    /// Dùng khi action chủ động trả lỗi HTTP. Các lỗi ngoài controller như
    /// JWT, model binding, route 404 và exception vẫn do infrastructure xử lý.
    /// </summary>
    protected ObjectResult ApiProblem(
        int statusCode,
        string errorCode,
        string title,
        string detail)
    {
        var problem = problemDetailsFactory.Create(
            HttpContext,
            statusCode,
            errorCode,
            title,
            detail);

        return StatusCode(statusCode, problem);
    }

    protected BadRequestObjectResult ApiValidationProblem(
        ModelStateDictionary modelState)
    {
        var problem = problemDetailsFactory.CreateValidation(
            HttpContext,
            modelState);

        return BadRequest(problem);
    }
}

/// <summary>
/// Base class cho các API bắt buộc người dùng phải đăng nhập bằng JWT.
/// Controller public như AuthController không kế thừa class này.
/// </summary>
[Authorize]
public abstract class AuthorizedApiControllerBase(
    IApiProblemDetailsFactory problemDetailsFactory)
    : ApiControllerBase(problemDetailsFactory);
