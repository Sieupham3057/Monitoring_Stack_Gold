namespace ShopApi.Exceptions;

public abstract class ApiException(
    int statusCode,
    string errorCode,
    string message) : Exception(message)
{
    public int StatusCode { get; } = statusCode;
    public string ErrorCode { get; } = errorCode;
}

public sealed class NotFoundException(string resource, object key)
    : ApiException(
        StatusCodes.Status404NotFound,
        "RESOURCE_NOT_FOUND",
        $"{resource} với mã '{key}' không tồn tại.");

public sealed class ConflictException(string errorCode, string message)
    : ApiException(StatusCodes.Status409Conflict, errorCode, message);

public sealed class BadRequestException(string errorCode, string message)
    : ApiException(StatusCodes.Status400BadRequest, errorCode, message);

public sealed class UnauthorizedException(string message)
    : ApiException(StatusCodes.Status401Unauthorized, "INVALID_CREDENTIALS", message);
