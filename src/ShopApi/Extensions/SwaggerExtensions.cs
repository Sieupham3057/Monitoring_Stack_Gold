using Microsoft.OpenApi.Models;

namespace ShopApi.Extensions;

internal static class SwaggerExtensions
{
    public static IServiceCollection AddApiDocumentation(
        this IServiceCollection services)
    {
        services.AddEndpointsApiExplorer();
        services.AddSwaggerGen(options =>
        {
            options.SwaggerDoc("v1", new OpenApiInfo
            {
                Title = "ShopApi",
                Version = "v1",
                Description = "REST API .NET 8 với paging, validation và RFC 7807."
            });

            options.AddSecurityDefinition("Bearer", CreateBearerScheme());
            options.AddSecurityRequirement(CreateSecurityRequirement());
        });

        return services;
    }

    private static OpenApiSecurityScheme CreateBearerScheme() =>
        new()
        {
            Description = "Nhập JWT theo format: Bearer {token}",
            Name = "Authorization",
            In = ParameterLocation.Header,
            Type = SecuritySchemeType.Http,
            Scheme = "bearer",
            BearerFormat = "JWT"
        };

    private static OpenApiSecurityRequirement CreateSecurityRequirement() =>
        new()
        {
            {
                new OpenApiSecurityScheme
                {
                    Reference = new OpenApiReference
                    {
                        Type = ReferenceType.SecurityScheme,
                        Id = "Bearer"
                    }
                },
                Array.Empty<string>()
            }
        };
}
