using System.Security.Claims;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ShopApi.Common;
using ShopApi.Data;
using ShopApi.DTOs;
using ShopApi.Entities;
using ShopApi.Exceptions;

namespace ShopApi.Controllers;

public class OrdersController(AppDbContext db) : AuthorizedApiControllerBase
{
    private int CurrentUserId =>
        int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var userId)
            ? userId
            : throw new UnauthorizedException("Token không chứa định danh người dùng hợp lệ.");

    [HttpPost]
    public async Task<ActionResult<OrderResponse>> CreateOrder(
        [FromBody] CreateOrderRequest request,
        CancellationToken cancellationToken)
    {
        var duplicatedProductIds = request.Items
            .GroupBy(item => item.ProductId)
            .Where(group => group.Count() > 1)
            .Select(group => group.Key)
            .ToArray();

        if (duplicatedProductIds.Length > 0)
        {
            throw new BadRequestException(
                "DUPLICATE_ORDER_ITEMS",
                $"Mỗi sản phẩm chỉ được xuất hiện một lần. ProductId bị trùng: {string.Join(", ", duplicatedProductIds)}.");
        }

        var productIds = request.Items.Select(item => item.ProductId).ToList();
        var products = await db.Products
            .Where(product => productIds.Contains(product.Id))
            .ToDictionaryAsync(product => product.Id, cancellationToken);

        var missingProductIds = productIds
            .Where(productId => !products.ContainsKey(productId))
            .ToArray();

        if (missingProductIds.Length > 0)
        {
            throw new BadRequestException(
                "PRODUCT_NOT_FOUND",
                $"Các sản phẩm không tồn tại: {string.Join(", ", missingProductIds)}.");
        }

        foreach (var item in request.Items)
        {
            var product = products[item.ProductId];
            if (product.Stock < item.Quantity)
            {
                throw new ConflictException(
                    "INSUFFICIENT_STOCK",
                    $"Sản phẩm '{product.Name}' không đủ tồn kho. Yêu cầu: {item.Quantity}, còn lại: {product.Stock}.");
            }
        }

        var order = new Order { UserId = CurrentUserId };

        foreach (var item in request.Items)
        {
            var product = products[item.ProductId];
            product.Stock -= item.Quantity;

            order.Items.Add(new OrderItem
            {
                ProductId = item.ProductId,
                Quantity = item.Quantity,
                UnitPrice = product.Price
            });
            order.TotalAmount += product.Price * item.Quantity;
        }

        db.Orders.Add(order);
        await db.SaveChangesAsync(cancellationToken);

        var response = new OrderResponse(
            order.Id,
            order.TotalAmount,
            order.Status.ToString(),
            order.CreatedAt,
            order.Items.Select(item => new OrderItemResponse(
                item.ProductId,
                products[item.ProductId].Name,
                item.Quantity,
                item.UnitPrice)).ToList());

        return CreatedAtAction(nameof(GetById), new { id = order.Id }, response);
    }

    [HttpGet]
    public async Task<ActionResult<PagedResult<OrderResponse>>> GetMyOrders(
        [FromQuery] OrderQuery request,
        CancellationToken cancellationToken)
    {
        var userId = CurrentUserId;
        var query = db.Orders
            .AsNoTracking()
            .Where(order => order.UserId == userId);

        var search = request.Search?.Trim();
        if (!string.IsNullOrWhiteSpace(search))
        {
            if (int.TryParse(search, out var orderId))
            {
                query = query.Where(order =>
                    order.Id == orderId ||
                    order.Items.Any(item => item.Product.Name.Contains(search)));
            }
            else
            {
                query = query.Where(order =>
                    order.Items.Any(item => item.Product.Name.Contains(search)));
            }
        }

        if (request.Status.HasValue)
            query = query.Where(order => order.Status == request.Status.Value);

        if (request.FromDate.HasValue)
            query = query.Where(order => order.CreatedAt >= request.FromDate.Value);

        if (request.ToDate.HasValue)
            query = query.Where(order => order.CreatedAt <= request.ToDate.Value);

        var totalCount = await query.CountAsync(cancellationToken);
        query = ApplySorting(query, request.SortBy, request.SortDirection);

        var orders = await query
            .Skip((request.PageNumber - 1) * request.PageSize)
            .Take(request.PageSize)
            .Select(order => new OrderResponse(
                order.Id,
                order.TotalAmount,
                order.Status.ToString(),
                order.CreatedAt,
                order.Items.Select(item => new OrderItemResponse(
                    item.ProductId,
                    item.Product.Name,
                    item.Quantity,
                    item.UnitPrice)).ToList()))
            .ToListAsync(cancellationToken);

        return Ok(PagedResult<OrderResponse>.Create(
            orders,
            totalCount,
            request.PageNumber,
            request.PageSize));
    }

    [HttpGet("{id:int:min(1)}")]
    public async Task<ActionResult<OrderResponse>> GetById(
        int id,
        CancellationToken cancellationToken)
    {
        var userId = CurrentUserId;
        var order = await db.Orders
            .AsNoTracking()
            .Where(item => item.Id == id && item.UserId == userId)
            .Select(item => new OrderResponse(
                item.Id,
                item.TotalAmount,
                item.Status.ToString(),
                item.CreatedAt,
                item.Items.Select(orderItem => new OrderItemResponse(
                    orderItem.ProductId,
                    orderItem.Product.Name,
                    orderItem.Quantity,
                    orderItem.UnitPrice)).ToList()))
            .FirstOrDefaultAsync(cancellationToken);

        return order ?? throw new NotFoundException("Đơn hàng", id);
    }

    private static IQueryable<Order> ApplySorting(
        IQueryable<Order> query,
        string sortBy,
        string sortDirection)
    {
        var descending = sortDirection.Equals("desc", StringComparison.OrdinalIgnoreCase);

        return (sortBy.ToLowerInvariant(), descending) switch
        {
            ("id", false) => query.OrderBy(order => order.Id),
            ("id", true) => query.OrderByDescending(order => order.Id),
            ("totalamount", false) => query
                .OrderBy(order => order.TotalAmount)
                .ThenBy(order => order.Id),
            ("totalamount", true) => query
                .OrderByDescending(order => order.TotalAmount)
                .ThenByDescending(order => order.Id),
            ("status", false) => query
                .OrderBy(order => order.Status)
                .ThenBy(order => order.Id),
            ("status", true) => query
                .OrderByDescending(order => order.Status)
                .ThenByDescending(order => order.Id),
            ("createdat", false) => query
                .OrderBy(order => order.CreatedAt)
                .ThenBy(order => order.Id),
            _ => query
                .OrderByDescending(order => order.CreatedAt)
                .ThenByDescending(order => order.Id)
        };
    }
}
