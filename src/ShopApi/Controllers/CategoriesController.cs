using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ShopApi.Common;
using ShopApi.Data;
using ShopApi.DTOs;
using ShopApi.Entities;
using ShopApi.Exceptions;
using ShopApi.Infrastructure.Errors;

namespace ShopApi.Controllers;

public class CategoriesController(
    AppDbContext db,
    IApiProblemDetailsFactory problemDetailsFactory)
    : AuthorizedApiControllerBase(problemDetailsFactory)
{
    [HttpGet]
    [ProducesResponseType(typeof(PagedResult<CategoryResponse>), StatusCodes.Status200OK)]
    public async Task<ActionResult<PagedResult<CategoryResponse>>> GetAll(
        [FromQuery] CategoryQuery request,
        CancellationToken cancellationToken)
    {
        var query = db.Categories
            .AsNoTracking()
            .AsQueryable();

        var search = request.Search?.Trim();
        if (!string.IsNullOrWhiteSpace(search))
        {
            query = query.Where(category =>
                category.Name.Contains(search) ||
                category.Description.Contains(search));
        }

        var totalCount = await query.CountAsync(cancellationToken);
        query = ApplySorting(query, request.SortBy, request.SortDirection);

        var categories = await query
            .Skip((request.PageNumber - 1) * request.PageSize)
            .Take(request.PageSize)
            .Select(c => new CategoryResponse(c.Id, c.Name, c.Description, c.Products.Count))
            .ToListAsync(cancellationToken);

        return Ok(PagedResult<CategoryResponse>.Create(
            categories,
            totalCount,
            request.PageNumber,
            request.PageSize));
    }

    [HttpGet("{id:int:min(1)}")]
    public async Task<ActionResult<CategoryResponse>> GetById(
        int id,
        CancellationToken cancellationToken)
    {
        var category = await db.Categories
            .AsNoTracking()
            .Where(c => c.Id == id)
            .Select(c => new CategoryResponse(c.Id, c.Name, c.Description, c.Products.Count))
            .FirstOrDefaultAsync(cancellationToken);

        return category ?? throw new NotFoundException("Danh mục", id);
    }

    [HttpPost]
    public async Task<ActionResult<CategoryResponse>> Create(
        [FromBody] CategoryRequest request,
        CancellationToken cancellationToken)
    {
        var normalizedName = request.Name.Trim();
        if (await db.Categories.AnyAsync(c => c.Name == normalizedName, cancellationToken))
        {
            throw new ConflictException(
                "CATEGORY_NAME_EXISTS",
                $"Danh mục '{normalizedName}' đã tồn tại.");
        }

        var category = new Category
        {
            Name = normalizedName,
            Description = request.Description.Trim()
        };

        db.Categories.Add(category);
        await db.SaveChangesAsync(cancellationToken);

        var response = new CategoryResponse(category.Id, category.Name, category.Description, 0);
        return CreatedAtAction(nameof(GetById), new { id = category.Id }, response);
    }

    [HttpPut("{id:int:min(1)}")]
    public async Task<ActionResult<CategoryResponse>> Update(
        int id,
        [FromBody] CategoryRequest request,
        CancellationToken cancellationToken)
    {
        var category = await db.Categories
            .FirstOrDefaultAsync(c => c.Id == id, cancellationToken)
            ?? throw new NotFoundException("Danh mục", id);

        var normalizedName = request.Name.Trim();
        var duplicateName = await db.Categories
            .AnyAsync(c => c.Id != id && c.Name == normalizedName, cancellationToken);

        if (duplicateName)
        {
            throw new ConflictException(
                "CATEGORY_NAME_EXISTS",
                $"Danh mục '{normalizedName}' đã tồn tại.");
        }

        category.Name = normalizedName;
        category.Description = request.Description.Trim();
        await db.SaveChangesAsync(cancellationToken);

        var productCount = await db.Products.CountAsync(p => p.CategoryId == id, cancellationToken);
        return Ok(new CategoryResponse(
            category.Id,
            category.Name,
            category.Description,
            productCount));
    }

    [HttpDelete("{id:int:min(1)}")]
    public async Task<IActionResult> Delete(int id, CancellationToken cancellationToken)
    {
        var category = await db.Categories
            .FirstOrDefaultAsync(c => c.Id == id, cancellationToken)
            ?? throw new NotFoundException("Danh mục", id);

        if (await db.Products.AnyAsync(p => p.CategoryId == id, cancellationToken))
        {
            throw new ConflictException(
                "CATEGORY_IN_USE",
                "Không thể xóa danh mục đang chứa sản phẩm.");
        }

        db.Categories.Remove(category);
        await db.SaveChangesAsync(cancellationToken);
        return NoContent();
    }

    private static IQueryable<Category> ApplySorting(
        IQueryable<Category> query,
        string sortBy,
        string sortDirection)
    {
        var descending = sortDirection.Equals("desc", StringComparison.OrdinalIgnoreCase);

        return (sortBy.ToLowerInvariant(), descending) switch
        {
            ("id", false) => query.OrderBy(category => category.Id),
            ("id", true) => query.OrderByDescending(category => category.Id),
            ("productcount", false) => query
                .OrderBy(category => category.Products.Count)
                .ThenBy(category => category.Id),
            ("productcount", true) => query
                .OrderByDescending(category => category.Products.Count)
                .ThenByDescending(category => category.Id),
            ("name", true) => query
                .OrderByDescending(category => category.Name)
                .ThenByDescending(category => category.Id),
            _ => query
                .OrderBy(category => category.Name)
                .ThenBy(category => category.Id)
        };
    }
}
