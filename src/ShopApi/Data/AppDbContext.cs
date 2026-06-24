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
        modelBuilder.Entity<User>(entity =>
        {
            entity.HasIndex(user => user.Username).IsUnique();
            entity.HasIndex(user => user.Email).IsUnique();
            entity.Property(user => user.Username).HasMaxLength(50).IsRequired();
            entity.Property(user => user.Email).HasMaxLength(100).IsRequired();
            entity.Property(user => user.PasswordHash).IsRequired();
        });

        modelBuilder.Entity<Category>(entity =>
        {
            entity.Property(category => category.Name).HasMaxLength(100).IsRequired();
            entity.Property(category => category.Description).HasMaxLength(1000);
            entity.HasIndex(category => category.Name).IsUnique();
        });

        modelBuilder.Entity<Product>(entity =>
        {
            entity.Property(product => product.Name).HasMaxLength(200).IsRequired();
            entity.Property(product => product.Description).HasMaxLength(2000);
            entity.Property(product => product.Price).HasColumnType("decimal(18,2)");
            entity.Property(product => product.RowVersion).IsRowVersion();

            entity.HasIndex(product => product.CategoryId);
            entity.HasIndex(product => product.Name);
            entity.HasIndex(product => product.Price);

            // [BẮT BUỘC] Không cho xóa Category kéo theo Product và lịch sử đơn hàng.
            entity.HasOne(product => product.Category)
                .WithMany(category => category.Products)
                .HasForeignKey(product => product.CategoryId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<Order>(entity =>
        {
            entity.Property(order => order.TotalAmount).HasColumnType("decimal(18,2)");
            entity.HasIndex(order => order.UserId);
            entity.HasIndex(order => order.CreatedAt);
        });

        modelBuilder.Entity<OrderItem>(entity =>
        {
            entity.Property(item => item.UnitPrice).HasColumnType("decimal(18,2)");

            // [BẮT BUỘC] Product đã bán không được cascade-delete khỏi lịch sử đơn hàng.
            entity.HasOne(item => item.Product)
                .WithMany(product => product.OrderItems)
                .HasForeignKey(item => item.ProductId)
                .OnDelete(DeleteBehavior.Restrict);
        });

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
