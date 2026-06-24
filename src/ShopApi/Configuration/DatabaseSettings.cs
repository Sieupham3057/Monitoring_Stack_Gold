namespace ShopApi.Configuration;

public sealed class DatabaseSettings
{
    public const string SectionName = "Database";

    public bool AutoMigrate { get; init; }
}
