using System.Security.Claims;
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
public class OrdersController(AppDbContext db) : ControllerBase
{
    private int CurrentUserId => int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    // POST /api/orders — Đặt hàng
    // Đây là endpoint phức tạp nhất: đọc nhiều product, tính tổng, tạo order + items
    // K6 sẽ bắn endpoint này mạnh nhất để test transaction throughput
    [HttpPost]
    public async Task<IActionResult> CreateOrder(CreateOrderRequest req)
    {
        if (req.Items.Count == 0)
            return BadRequest(new { message = "Giỏ hàng trống" });

        // Lấy tất cả product trong 1 query thay vì N queries
        var productIds = req.Items.Select(i => i.ProductId).Distinct().ToList();
        var products = await db.Products
            .Where(p => productIds.Contains(p.Id))
            .ToDictionaryAsync(p => p.Id);

        // Validate toàn bộ trước khi thao tác DB
        foreach (var item in req.Items)
        {
            if (!products.TryGetValue(item.ProductId, out var product))
                return BadRequest(new { message = $"Sản phẩm #{item.ProductId} không tồn tại" });

            if (product.Stock < item.Quantity)
                return BadRequest(new { message = $"Sản phẩm '{product.Name}' không đủ hàng. Còn: {product.Stock}" });
        }

        // Tạo order
        var order = new Order { UserId = CurrentUserId };
        var orderItems = new List<OrderItem>();

        foreach (var item in req.Items)
        {
            var product = products[item.ProductId];
            product.Stock -= item.Quantity; // Giảm tồn kho

            var orderItem = new OrderItem
            {
                ProductId = item.ProductId,
                Quantity = item.Quantity,
                UnitPrice = product.Price
            };
            order.Items.Add(orderItem);
            order.TotalAmount += product.Price * item.Quantity;
        }

        db.Orders.Add(order);
        await db.SaveChangesAsync();

        return CreatedAtAction(nameof(GetById), new { id = order.Id }, new { order.Id, order.TotalAmount, order.Status });
    }

    // GET /api/orders — Lịch sử đơn hàng của user hiện tại
    [HttpGet]
    public async Task<IActionResult> GetMyOrders([FromQuery] int page = 1, [FromQuery] int pageSize = 10)
    {
        var userId = CurrentUserId;

        var total = await db.Orders.CountAsync(o => o.UserId == userId);

        var orders = await db.Orders
            .Where(o => o.UserId == userId)
            .OrderByDescending(o => o.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(o => new OrderResponse(
                o.Id,
                o.TotalAmount,
                o.Status.ToString(),
                o.CreatedAt,
                o.Items.Select(i => new OrderItemResponse(
                    i.ProductId,
                    i.Product.Name,
                    i.Quantity,
                    i.UnitPrice
                )).ToList()
            ))
            .ToListAsync();

        return Ok(new PagedResult<OrderResponse>(orders, total, page, pageSize));
    }

    // GET /api/orders/{id}
    [HttpGet("{id}")]
    public async Task<IActionResult> GetById(int id)
    {
        var userId = CurrentUserId;

        var order = await db.Orders
            .Where(o => o.Id == id && o.UserId == userId)
            .Select(o => new OrderResponse(
                o.Id,
                o.TotalAmount,
                o.Status.ToString(),
                o.CreatedAt,
                o.Items.Select(i => new OrderItemResponse(
                    i.ProductId,
                    i.Product.Name,
                    i.Quantity,
                    i.UnitPrice
                )).ToList()
            ))
            .FirstOrDefaultAsync();

        return order is null ? NotFound() : Ok(order);
    }
}
