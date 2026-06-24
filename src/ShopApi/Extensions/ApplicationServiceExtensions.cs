using ShopApi.Services;

namespace ShopApi.Extensions;

internal static class ApplicationServiceExtensions
{
    public static IServiceCollection AddApplicationServices(
        this IServiceCollection services)
    {
        services.AddScoped<JwtService>();
        return services;
    }
}
