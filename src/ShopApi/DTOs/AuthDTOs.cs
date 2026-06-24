using System.ComponentModel.DataAnnotations;

namespace ShopApi.DTOs;

public sealed class RegisterRequest
{
    [Required(ErrorMessage = "Username là bắt buộc.")]
    [StringLength(50, MinimumLength = 3, ErrorMessage = "Username phải từ 3 đến 50 ký tự.")]
    [RegularExpression(
        "^[a-zA-Z0-9._-]+$",
        ErrorMessage = "Username chỉ được chứa chữ cái, chữ số, dấu chấm, gạch dưới và gạch ngang.")]
    public string Username { get; init; } = string.Empty;

    [Required(ErrorMessage = "Email là bắt buộc.")]
    [EmailAddress(ErrorMessage = "Email không đúng định dạng.")]
    [StringLength(100, ErrorMessage = "Email không được vượt quá 100 ký tự.")]
    public string Email { get; init; } = string.Empty;

    [Required(ErrorMessage = "Mật khẩu là bắt buộc.")]
    [StringLength(100, MinimumLength = 8, ErrorMessage = "Mật khẩu phải từ 8 đến 100 ký tự.")]
    [RegularExpression(
        "^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[^a-zA-Z0-9]).+$",
        ErrorMessage = "Mật khẩu phải có chữ thường, chữ hoa, chữ số và ký tự đặc biệt.")]
    public string Password { get; init; } = string.Empty;
}

public sealed class LoginRequest
{
    [Required(ErrorMessage = "Username là bắt buộc.")]
    public string Username { get; init; } = string.Empty;

    [Required(ErrorMessage = "Mật khẩu là bắt buộc.")]
    public string Password { get; init; } = string.Empty;
}

public sealed record AuthResponse(string Token, string Username, DateTime ExpiresAt);
