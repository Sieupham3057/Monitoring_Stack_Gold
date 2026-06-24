using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Serilog;
using ShopApi.Configuration;
using ShopApi.Data;
using ShopApi.Infrastructure.Errors;

namespace ShopApi.Extensions;

public static class WebApplicationExtensions
{
    public static async Task ApplyDatabaseMigrationsAsync(this WebApplication app)
    {
        var settings = app.Services
            .GetRequiredService<IOptions<DatabaseSettings>>()
            .Value;

        if (!settings.AutoMigrate)
            return;

        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var logger = scope.ServiceProvider
            .GetRequiredService<ILoggerFactory>()
            .CreateLogger("DatabaseMigration");

        try
        {
            logger.LogInformation("Applying database migrations...");
            await db.Database.MigrateAsync();
            logger.LogInformation("Database migrations applied successfully.");
        }
        catch (Exception exception)
        {
            logger.LogCritical(exception, "Failed to apply database migrations.");
            throw;
        }
    }

    public static WebApplication UseShopApiPipeline(this WebApplication app)
    {
        app.UseSerilogRequestLogging(options =>
        {
            options.MessageTemplate =
                "HTTP {RequestMethod} {RequestPath} responded {StatusCode} in {Elapsed:0.0000} ms";
            options.EnrichDiagnosticContext = (diagnosticContext, httpContext) =>
            {
                diagnosticContext.Set(
                    "TraceId",
                    httpContext.TraceIdentifier);
            };
        });

        if (app.Environment.IsDevelopment())
        {
            app.UseSwagger();
            app.UseSwaggerUI(options =>
                options.SwaggerEndpoint("/swagger/v1/swagger.json", "ShopApi v1"));
        }

        app.UseExceptionHandler();
        app.UseApiStatusCodePages();
        app.UseHttpsRedirection();
        app.UseCors(CorsSettings.PolicyName);
        app.UseAuthentication();
        app.UseAuthorization();

        return app;
    }

    public static WebApplication MapShopApiEndpoints(this WebApplication app)
    {
        app.MapControllers();
        app.MapHealthEndpoints();
        return app;
    }

    private static void UseApiStatusCodePages(this IApplicationBuilder app)
    {
        app.UseStatusCodePages(async context =>
        {
            var httpContext = context.HttpContext;
            var response = httpContext.Response;

            if (response.HasStarted || !string.IsNullOrEmpty(response.ContentType))
                return;

            var factory = httpContext.RequestServices
                .GetRequiredService<IApiProblemDetailsFactory>();

            var isNotFound = response.StatusCode == StatusCodes.Status404NotFound;
            var problem = factory.Create(
                httpContext,
                response.StatusCode,
                isNotFound ? "ENDPOINT_NOT_FOUND" : "HTTP_ERROR",
                isNotFound ? "Không tìm thấy endpoint" : "Request không thành công",
                isNotFound
                    ? $"Không tồn tại endpoint '{httpContext.Request.Method} {httpContext.Request.Path}'."
                    : "Server không thể xử lý request.");

            await response.WriteAsJsonAsync(problem);
        });
    }

    private static void MapHealthEndpoints(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapGet("/health/live", () => Results.Ok(new
        {
            status = "healthy",
            timestamp = DateTimeOffset.UtcNow
        })).AllowAnonymous();

        endpoints.MapGet("/health/ready", async (
            AppDbContext db,
            CancellationToken cancellationToken) =>
        {
            var canConnect = await db.Database.CanConnectAsync(cancellationToken);

            return canConnect
                ? Results.Ok(new
                {
                    status = "ready",
                    timestamp = DateTimeOffset.UtcNow
                })
                : Results.Json(
                    new
                    {
                        status = "not_ready",
                        timestamp = DateTimeOffset.UtcNow
                    },
                    statusCode: StatusCodes.Status503ServiceUnavailable);
        }).AllowAnonymous();
    }
}
