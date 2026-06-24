namespace ShopApi.Extensions;

public static class DependencyInjectionExtensions
{
    public static IServiceCollection AddShopApi(
        this IServiceCollection services,
        IConfiguration configuration,
        IHostEnvironment environment)
    {
        services.AddDatabase(configuration, environment);
        services.AddApiErrors();
        services.AddApiControllers();
        services.AddJwtAuthentication(configuration);
        services.AddConfiguredCors(configuration);
        services.AddApiDocumentation();
        services.AddApplicationServices();

        return services;
    }
}
