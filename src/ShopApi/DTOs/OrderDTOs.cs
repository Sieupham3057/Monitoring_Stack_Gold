using System.ComponentModel.DataAnnotations;
using ShopApi.Common;
using ShopApi.Entities;

namespace ShopApi.DTOs;

public sealed class OrderQuery : PaginationQuery, IValidatableObject
{
    [StringLength(200, ErrorMessage = "Search không được vượt quá 200 ký tự.")]
    public string? Search { get; init; }

    public OrderStatus? Status { get; init; }

    public DateTime? FromDate { get; init; }

    public DateTime? ToDate { get; init; }

    [RegularExpression(
        "^(id|totalAmount|createdAt|status)$",
        ErrorMessage = "SortBy chỉ nhận một trong các giá trị: id, totalAmount, createdAt, status.")]
    public string SortBy { get; init; } = "createdAt";

    [RegularExpression(
        "^(asc|desc)$",
        ErrorMessage = "SortDirection chỉ nhận asc hoặc desc.")]
    public string SortDirection { get; init; } = "desc";

    public IEnumerable<ValidationResult> Validate(ValidationContext validationContext)
    {
        if (FromDate.HasValue && ToDate.HasValue && FromDate > ToDate)
        {
            yield return new ValidationResult(
                "FromDate không được lớn hơn ToDate.",
                [nameof(FromDate), nameof(ToDate)]);
        }
    }
}

public sealed class OrderItemRequest
{
    [Range(1, int.MaxValue, ErrorMessage = "ProductId phải lớn hơn 0.")]
    public int ProductId { get; init; }

    [Range(1, 1000, ErrorMessage = "Số lượng phải nằm trong khoảng từ 1 đến 1000.")]
    public int Quantity { get; init; }
}

public sealed class CreateOrderRequest
{
    [Required(ErrorMessage = "Danh sách sản phẩm là bắt buộc.")]
    [MinLength(1, ErrorMessage = "Giỏ hàng phải có ít nhất một sản phẩm.")]
    [MaxLength(100, ErrorMessage = "Một đơn hàng không được vượt quá 100 dòng sản phẩm.")]
    public List<OrderItemRequest> Items { get; init; } = [];
}

public sealed record OrderItemResponse(int ProductId, string ProductName, int Quantity, decimal UnitPrice);

public sealed record OrderResponse(
    int Id,
    decimal TotalAmount,
    string Status,
    DateTime CreatedAt,
    List<OrderItemResponse> Items);
