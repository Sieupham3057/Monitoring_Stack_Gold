using Microsoft.AspNetCore.Cors.Infrastructure;
using ShopApi.Configuration;

namespace ShopApi.Extensions;

internal static class CorsExtensions
{
    public static IServiceCollection AddConfiguredCors(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        services
            .AddOptions<CorsSettings>()
            .Bind(configuration.GetSection(CorsSettings.SectionName))
            .ValidateDataAnnotations()
            .Validate(
                settings => !settings.AllowCredentials ||
                            !settings.AllowedOrigins.Contains("*"),
                "CORS không cho phép wildcard origin cùng AllowCredentials=true.")
            .Validate(
                settings => settings.AllowedOrigins.All(IsValidOrigin),
                "Mỗi CORS origin phải là URL tuyệt đối http/https và không có path.")
            .ValidateOnStart();

        var settings = configuration
            .GetRequiredSection(CorsSettings.SectionName)
            .Get<CorsSettings>()
            ?? throw new InvalidOperationException("Thiếu cấu hình Cors.");

        services.AddCors(options =>
        {
            options.AddPolicy(
                CorsSettings.PolicyName,
                policy => ConfigurePolicy(policy, settings));
        });

        return services;
    }

    private static void ConfigurePolicy(
        CorsPolicyBuilder policy,
        CorsSettings settings)
    {
        policy
            .WithOrigins(settings.AllowedOrigins)
            .WithMethods(settings.AllowedMethods)
            .WithHeaders(settings.AllowedHeaders)
            .SetPreflightMaxAge(
                TimeSpan.FromMinutes(settings.PreflightMaxAgeMinutes));

        if (settings.AllowCredentials)
            policy.AllowCredentials();
    }

    private static bool IsValidOrigin(string origin)
    {
        return Uri.TryCreate(origin, UriKind.Absolute, out var uri) &&
               (uri.Scheme == Uri.UriSchemeHttp || uri.Scheme == Uri.UriSchemeHttps) &&
               uri.AbsolutePath == "/" &&
               string.IsNullOrEmpty(uri.Query) &&
               string.IsNullOrEmpty(uri.Fragment);
    }
}
