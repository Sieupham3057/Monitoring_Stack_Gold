using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using ShopApi.Infrastructure;
using ShopApi.Infrastructure.Errors;

namespace ShopApi.Extensions;

internal static class ApiExtensions
{
    public static IServiceCollection AddApiErrors(this IServiceCollection services)
    {
        services.AddSingleton<IApiProblemDetailsFactory, ApiProblemDetailsFactory>();
        services.AddSingleton<IPostConfigureOptions<ApiBehaviorOptions>, ApiBehaviorOptionsSetup>();
        services.AddProblemDetails();
        services.AddExceptionHandler<GlobalExceptionHandler>();

        return services;
    }

    public static IServiceCollection AddApiControllers(this IServiceCollection services)
    {
        services.AddControllers();
        return services;
    }
}
