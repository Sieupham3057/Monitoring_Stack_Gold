using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ShopApi.Data;
using ShopApi.DTOs;
using ShopApi.Entities;
using ShopApi.Exceptions;
using ShopApi.Services;

namespace ShopApi.Controllers;

public class AuthController(AppDbContext db, JwtService jwtService) : ApiControllerBase
{
    [HttpPost("register")]
    public async Task<ActionResult<AuthResponse>> Register(
        [FromBody] RegisterRequest request,
        CancellationToken cancellationToken)
    {
        var username = request.Username.Trim();
        var email = request.Email.Trim().ToLowerInvariant();

        if (await db.Users.AnyAsync(u => u.Username == username, cancellationToken))
        {
            throw new ConflictException(
                "USERNAME_EXISTS",
                $"Username '{username}' đã tồn tại.");
        }

        if (await db.Users.AnyAsync(u => u.Email == email, cancellationToken))
        {
            throw new ConflictException(
                "EMAIL_EXISTS",
                $"Email '{email}' đã được sử dụng.");
        }

        var user = new User
        {
            Username = username,
            Email = email,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password)
        };

        db.Users.Add(user);
        await db.SaveChangesAsync(cancellationToken);

        var (token, expiresAt) = jwtService.GenerateToken(user);
        return Ok(new AuthResponse(token, user.Username, expiresAt));
    }

    [HttpPost("login")]
    public async Task<ActionResult<AuthResponse>> Login(
        [FromBody] LoginRequest request,
        CancellationToken cancellationToken)
    {
        var username = request.Username.Trim();
        var user = await db.Users
            .AsNoTracking()
            .FirstOrDefaultAsync(u => u.Username == username, cancellationToken);

        if (user is null || !BCrypt.Net.BCrypt.Verify(request.Password, user.PasswordHash))
        {
            throw new UnauthorizedException("Username hoặc mật khẩu không chính xác.");
        }

        var (token, expiresAt) = jwtService.GenerateToken(user);
        return Ok(new AuthResponse(token, user.Username, expiresAt));
    }
}
