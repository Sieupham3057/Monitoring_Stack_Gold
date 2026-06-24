using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ShopApi.Common;
using ShopApi.Data;
using ShopApi.DTOs;
using ShopApi.Entities;
using ShopApi.Exceptions;

namespace ShopApi.Controllers;

public class ProductsController(AppDbContext db) : AuthorizedApiControllerBase
{
    /// <summary>
    /// Lấy danh sách sản phẩm có phân trang, tìm kiếm, lọc và sắp xếp.
    /// </summary>
    [HttpGet]
    [ProducesResponseType(typeof(PagedResult<ProductResponse>), StatusCodes.Status200OK)]
    public async Task<ActionResult<PagedResult<ProductResponse>>> GetAll(
        [FromQuery] ProductQuery request,
        CancellationToken cancellationToken)
    {
        var query = db.Products
            .AsNoTracking()
            .AsQueryable();

        var search = request.Search?.Trim();
        if (!string.IsNullOrWhiteSpace(search))
        {
            query = query.Where(p =>
                p.Name.Contains(search) ||
                p.Description.Contains(search));
        }

        if (request.CategoryId.HasValue)
            query = query.Where(p => p.CategoryId == request.CategoryId.Value);

        if (request.MinPrice.HasValue)
            query = query.Where(p => p.Price >= request.MinPrice.Value);

        if (request.MaxPrice.HasValue)
            query = query.Where(p => p.Price <= request.MaxPrice.Value);

        if (request.InStock.HasValue)
        {
            query = request.InStock.Value
                ? query.Where(p => p.Stock > 0)
                : query.Where(p => p.Stock == 0);
        }

        query = ApplySorting(query, request.SortBy, request.SortDirection);

        var totalCount = await query.CountAsync(cancellationToken);
        var items = await query
            .Skip((request.PageNumber - 1) * request.PageSize)
            .Take(request.PageSize)
            .Select(p => new ProductResponse(
                p.Id,
                p.Name,
                p.Description,
                p.Price,
                p.Stock,
                p.CategoryId,
                p.Category.Name))
            .ToListAsync(cancellationToken);

        return Ok(PagedResult<ProductResponse>.Create(
            items,
            totalCount,
            request.PageNumber,
            request.PageSize));
    }

    [HttpGet("{id:int:min(1)}")]
    [ProducesResponseType(typeof(ProductResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    public async Task<ActionResult<ProductResponse>> GetById(
        int id,
        CancellationToken cancellationToken)
    {
        var product = await db.Products
            .AsNoTracking()
            .Where(p => p.Id == id)
            .Select(p => new ProductResponse(
                p.Id,
                p.Name,
                p.Description,
                p.Price,
                p.Stock,
                p.CategoryId,
                p.Category.Name))
            .FirstOrDefaultAsync(cancellationToken);

        return product ?? throw new NotFoundException("Sản phẩm", id);
    }

    [HttpPost]
    [ProducesResponseType(typeof(ProductResponse), StatusCodes.Status201Created)]
    [ProducesResponseType(typeof(ValidationProblemDetails), StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<ProductResponse>> Create(
        [FromBody] ProductRequest request,
        CancellationToken cancellationToken)
    {
        await EnsureCategoryExists(request.CategoryId, cancellationToken);

        var product = new Product
        {
            Name = request.Name.Trim(),
            Description = request.Description.Trim(),
            Price = request.Price,
            Stock = request.Stock,
            CategoryId = request.CategoryId
        };

        db.Products.Add(product);
        await db.SaveChangesAsync(cancellationToken);

        var response = new ProductResponse(
            product.Id,
            product.Name,
            product.Description,
            product.Price,
            product.Stock,
            product.CategoryId,
            await db.Categories
                .Where(c => c.Id == product.CategoryId)
                .Select(c => c.Name)
                .SingleAsync(cancellationToken));

        return CreatedAtAction(nameof(GetById), new { id = product.Id }, response);
    }

    [HttpPut("{id:int:min(1)}")]
    [ProducesResponseType(typeof(ProductResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<ProductResponse>> Update(
        int id,
        [FromBody] ProductRequest request,
        CancellationToken cancellationToken)
    {
        var product = await db.Products
            .FirstOrDefaultAsync(p => p.Id == id, cancellationToken)
            ?? throw new NotFoundException("Sản phẩm", id);

        await EnsureCategoryExists(request.CategoryId, cancellationToken);

        product.Name = request.Name.Trim();
        product.Description = request.Description.Trim();
        product.Price = request.Price;
        product.Stock = request.Stock;
        product.CategoryId = request.CategoryId;

        await db.SaveChangesAsync(cancellationToken);

        var categoryName = await db.Categories
            .Where(c => c.Id == product.CategoryId)
            .Select(c => c.Name)
            .SingleAsync(cancellationToken);

        return Ok(new ProductResponse(
            product.Id,
            product.Name,
            product.Description,
            product.Price,
            product.Stock,
            product.CategoryId,
            categoryName));
    }

    [HttpDelete("{id:int:min(1)}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> Delete(int id, CancellationToken cancellationToken)
    {
        var product = await db.Products
            .FirstOrDefaultAsync(p => p.Id == id, cancellationToken)
            ?? throw new NotFoundException("Sản phẩm", id);

        var isUsedByOrder = await db.OrderItems
            .AnyAsync(item => item.ProductId == id, cancellationToken);

        if (isUsedByOrder)
        {
            throw new ConflictException(
                "PRODUCT_IN_USE",
                "Không thể xóa sản phẩm đã phát sinh đơn hàng. Hãy ngừng kinh doanh hoặc soft-delete sản phẩm.");
        }

        db.Products.Remove(product);
        await db.SaveChangesAsync(cancellationToken);
        return NoContent();
    }

    private async Task EnsureCategoryExists(int categoryId, CancellationToken cancellationToken)
    {
        if (!await db.Categories.AnyAsync(c => c.Id == categoryId, cancellationToken))
            throw new NotFoundException("Danh mục", categoryId);
    }

    private static IQueryable<Product> ApplySorting(
        IQueryable<Product> query,
        string sortBy,
        string sortDirection)
    {
        var descending = sortDirection.Equals("desc", StringComparison.OrdinalIgnoreCase);

        return (sortBy.ToLowerInvariant(), descending) switch
        {
            ("name", false) => query.OrderBy(p => p.Name).ThenBy(p => p.Id),
            ("name", true) => query.OrderByDescending(p => p.Name).ThenByDescending(p => p.Id),
            ("price", false) => query.OrderBy(p => p.Price).ThenBy(p => p.Id),
            ("price", true) => query.OrderByDescending(p => p.Price).ThenByDescending(p => p.Id),
            ("stock", false) => query.OrderBy(p => p.Stock).ThenBy(p => p.Id),
            ("stock", true) => query.OrderByDescending(p => p.Stock).ThenByDescending(p => p.Id),
            ("id", true) => query.OrderByDescending(p => p.Id),
            _ => query.OrderBy(p => p.Id)
        };
    }
}
