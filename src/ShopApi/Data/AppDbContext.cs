using Microsoft.EntityFrameworkCore;
using ShopApi.Entities;

namespace ShopApi.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();
    public DbSet<Category> Categories => Set<Category>();
    public DbSet<Product> Products => Set<Product>();
    public DbSet<Order> Orders => Set<Order>();
    public DbSet<OrderItem> OrderItems => Set<OrderItem>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        // --- User ---
        modelBuilder.Entity<User>(e =>
        {
            e.HasIndex(u => u.Username).IsUnique();
            e.HasIndex(u => u.Email).IsUnique();
            e.Property(u => u.Username).HasMaxLength(50).IsRequired();
            e.Property(u => u.Email).HasMaxLength(100).IsRequired();
            e.Property(u => u.PasswordHash).IsRequired();
        });

        // --- Category ---
        modelBuilder.Entity<Category>(e =>
        {
            e.Property(c => c.Name).HasMaxLength(100).IsRequired();
        });

        // --- Product ---
        modelBuilder.Entity<Product>(e =>
        {
            e.Property(p => p.Price).HasColumnType("decimal(18,2)");
            e.Property(p => p.Name).HasMaxLength(200).IsRequired();
            // Index để query theo category nhanh hơn — quan trọng khi có hàng triệu request
            e.HasIndex(p => p.CategoryId);
        });

        // --- Order ---
        modelBuilder.Entity<Order>(e =>
        {
            e.Property(o => o.TotalAmount).HasColumnType("decimal(18,2)");
            // Index để lấy orders của 1 user nhanh hơn
            e.HasIndex(o => o.UserId);
            e.HasIndex(o => o.CreatedAt);
        });

        // --- OrderItem ---
        modelBuilder.Entity<OrderItem>(e =>
        {
            e.Property(oi => oi.UnitPrice).HasColumnType("decimal(18,2)");
        });

        // Seed data để K6 test ngay mà không cần tạo dữ liệu trước
        modelBuilder.Entity<Category>().HasData(
            new Category { Id = 1, Name = "Electronics", Description = "Thiết bị điện tử" },
            new Category { Id = 2, Name = "Clothing", Description = "Thời trang" },
            new Category { Id = 3, Name = "Books", Description = "Sách" }
        );

        modelBuilder.Entity<Product>().HasData(
            new Product { Id = 1, Name = "Laptop Pro 15", Description = "Laptop cao cấp", Price = 25000000, Stock = 100, CategoryId = 1 },
            new Product { Id = 2, Name = "iPhone 15", Description = "Điện thoại thông minh", Price = 22000000, Stock = 200, CategoryId = 1 },
            new Product { Id = 3, Name = "T-Shirt Basic", Description = "Áo thun cơ bản", Price = 150000, Stock = 1000, CategoryId = 2 },
            new Product { Id = 4, Name = "Clean Code", Description = "Sách lập trình", Price = 250000, Stock = 500, CategoryId = 3 },
            new Product { Id = 5, Name = "Headphone Sony", Description = "Tai nghe không dây", Price = 3500000, Stock = 150, CategoryId = 1 }
        );
    }
}
