namespace ShopApi.DTOs;

public record RegisterRequest(string Username, string Email, string Password);

public record LoginRequest(string Username, string Password);

public record AuthResponse(string Token, string Username, DateTime ExpiresAt);
