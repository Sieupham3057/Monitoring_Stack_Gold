using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ShopApi.Data;
using ShopApi.DTOs;
using ShopApi.Entities;

namespace ShopApi.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class CategoriesController(AppDbContext db) : ControllerBase
{
    // GET /api/categories
    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var categories = await db.Categories
            .Select(c => new CategoryResponse(c.Id, c.Name, c.Description, c.Products.Count))
            .ToListAsync();

        return Ok(categories);
    }

    // GET /api/categories/{id}
    [HttpGet("{id}")]
    public async Task<IActionResult> GetById(int id)
    {
        var category = await db.Categories
            .Where(c => c.Id == id)
            .Select(c => new CategoryResponse(c.Id, c.Name, c.Description, c.Products.Count))
            .FirstOrDefaultAsync();

        return category is null ? NotFound() : Ok(category);
    }

    // POST /api/categories
    [HttpPost]
    public async Task<IActionResult> Create(CategoryRequest req)
    {
        var category = new Category { Name = req.Name, Description = req.Description };
        db.Categories.Add(category);
        await db.SaveChangesAsync();

        return CreatedAtAction(nameof(GetById), new { id = category.Id },
            new CategoryResponse(category.Id, category.Name, category.Description, 0));
    }

    // PUT /api/categories/{id}
    [HttpPut("{id}")]
    public async Task<IActionResult> Update(int id, CategoryRequest req)
    {
        var category = await db.Categories.FindAsync(id);
        if (category is null) return NotFound();

        category.Name = req.Name;
        category.Description = req.Description;
        await db.SaveChangesAsync();

        return NoContent();
    }

    // DELETE /api/categories/{id}
    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(int id)
    {
        var category = await db.Categories.FindAsync(id);
        if (category is null) return NotFound();

        db.Categories.Remove(category);
        await db.SaveChangesAsync();
        return NoContent();
    }
}
