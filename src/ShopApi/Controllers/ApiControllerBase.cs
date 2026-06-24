using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ShopApi.Controllers;

/// <summary>
/// Base class cho toàn bộ REST API controller.
/// Các metadata dùng chung được khai báo một lần tại đây để mọi controller
/// có cùng route convention và cùng response content type.
/// </summary>
[ApiController]
[Route("api/[controller]")]
[Produces("application/json")]
public abstract class ApiControllerBase : ControllerBase;

/// <summary>
/// Base class cho các API bắt buộc người dùng phải đăng nhập bằng JWT.
/// Controller public như AuthController không kế thừa class này.
/// </summary>
[Authorize]
public abstract class AuthorizedApiControllerBase : ApiControllerBase;
