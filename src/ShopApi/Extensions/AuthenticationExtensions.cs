using System.ComponentModel.DataAnnotations;
using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using ShopApi.Configuration;
using ShopApi.Infrastructure.Authentication;

namespace ShopApi.Extensions;

internal static class AuthenticationExtensions
{
    public static IServiceCollection AddJwtAuthentication(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        services
            .AddOptions<JwtSettings>()
            .Bind(configuration.GetSection(JwtSettings.SectionName))
            .ValidateDataAnnotations()
            .ValidateOnStart();

        var settings = configuration
            .GetRequiredSection(JwtSettings.SectionName)
            .Get<JwtSettings>()
            ?? throw new InvalidOperationException("Thiếu cấu hình Jwt.");

        Validator.ValidateObject(
            settings,
            new ValidationContext(settings),
            validateAllProperties: true);

        services.AddScoped<ApiJwtBearerEvents>();
        services
            .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
            .AddJwtBearer(options =>
            {
                options.EventsType = typeof(ApiJwtBearerEvents);
                options.TokenValidationParameters = CreateTokenValidationParameters(settings);
            });

        services.AddAuthorization();
        return services;
    }

    private static TokenValidationParameters CreateTokenValidationParameters(
        JwtSettings settings) =>
        new()
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = settings.Issuer,
            ValidAudience = settings.Audience,
            IssuerSigningKey = new SymmetricSecurityKey(
                Encoding.UTF8.GetBytes(settings.Key)),
            ClockSkew = TimeSpan.FromSeconds(30)
        };
}
