using System.ComponentModel.DataAnnotations;

namespace ShopApi.Configuration;

public sealed class CorsSettings
{
    public const string SectionName = "Cors";
    public const string PolicyName = "ShopApiCorsPolicy";

    [Required]
    [MinLength(1)]
    public string[] AllowedOrigins { get; init; } = [];

    [Required]
    [MinLength(1)]
    public string[] AllowedMethods { get; init; } = [];

    [Required]
    [MinLength(1)]
    public string[] AllowedHeaders { get; init; } = [];

    public bool AllowCredentials { get; init; }

    [Range(0, 1440)]
    public int PreflightMaxAgeMinutes { get; init; } = 10;
}
