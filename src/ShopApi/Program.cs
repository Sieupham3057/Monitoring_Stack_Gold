using Serilog;
using ShopApi.Extensions;
using Microsoft.Extensions.Hosting;

Log.Logger = SerilogExtensions.CreateBootstrapLogger();

try
{
    Log.Information("Starting ShopApi");

    var builder = WebApplication.CreateBuilder(args);

    builder.AddSerilogLogging();
    builder.Services.AddShopApi(
        builder.Configuration,
        builder.Environment);

    var app = builder.Build();

    await app.ApplyDatabaseMigrationsAsync();

    app.UseShopApiPipeline();
    app.MapShopApiEndpoints();

    await app.RunAsync();
}
catch (HostAbortedException)
{
    // EF Core tooling chủ động dừng host sau khi lấy service provider.
    // Đây không phải lỗi runtime nên không ghi Fatal và không đổi exit code.
}
catch (Exception exception)
{
    Log.Fatal(
        exception,
        "ShopApi terminated due to a startup failure or an unexpected unhandled error");
    Environment.ExitCode = 1;
}
finally
{
    await Log.CloseAndFlushAsync();
}

public partial class Program;
