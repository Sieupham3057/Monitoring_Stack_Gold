using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ShopApi.Data;
using ShopApi.DTOs;
using ShopApi.Entities;
using ShopApi.Services;

namespace ShopApi.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AuthController(AppDbContext db, JwtService jwtService) : ControllerBase
{
    // POST /api/auth/register
    [HttpPost("register")]
    public async Task<IActionResult> Register(RegisterRequest req)
    {
        if (await db.Users.AnyAsync(u => u.Username == req.Username))
            return Conflict(new { message = "Username đã tồn tại" });

        var user = new User
        {
            Username = req.Username,
            Email = req.Email,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.Password)
        };

        db.Users.Add(user);
        await db.SaveChangesAsync();

        var (token, expiresAt) = jwtService.GenerateToken(user);
        return Ok(new AuthResponse(token, user.Username, expiresAt));
    }

    // POST /api/auth/login
    // Đây là endpoint K6 sẽ gọi đầu tiên để lấy JWT cho mỗi Virtual User
    [HttpPost("login")]
    public async Task<IActionResult> Login(LoginRequest req)
    {
        var user = await db.Users.FirstOrDefaultAsync(u => u.Username == req.Username);

        if (user is null || !BCrypt.Net.BCrypt.Verify(req.Password, user.PasswordHash))
            return Unauthorized(new { message = "Sai tên đăng nhập hoặc mật khẩu" });

        var (token, expiresAt) = jwtService.GenerateToken(user);
        return Ok(new AuthResponse(token, user.Username, expiresAt));
    }
}
