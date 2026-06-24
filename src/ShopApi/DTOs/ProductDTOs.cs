using System.ComponentModel.DataAnnotations;
using ShopApi.Common;

namespace ShopApi.DTOs;

public sealed class ProductQuery : PaginationQuery, IValidatableObject
{
    [StringLength(200, ErrorMessage = "Search không được vượt quá 200 ký tự.")]
    public string? Search { get; init; }

    [Range(1, int.MaxValue, ErrorMessage = "CategoryId phải lớn hơn 0.")]
    public int? CategoryId { get; init; }

    [Range(typeof(decimal), "0", "9999999999999999.99", ErrorMessage = "MinPrice phải lớn hơn hoặc bằng 0.")]
    public decimal? MinPrice { get; init; }

    [Range(typeof(decimal), "0", "9999999999999999.99", ErrorMessage = "MaxPrice phải lớn hơn hoặc bằng 0.")]
    public decimal? MaxPrice { get; init; }

    public bool? InStock { get; init; }

    [RegularExpression(
        "^(id|name|price|stock)$",
        ErrorMessage = "SortBy chỉ nhận một trong các giá trị: id, name, price, stock.")]
    public string SortBy { get; init; } = "id";

    [RegularExpression(
        "^(asc|desc)$",
        ErrorMessage = "SortDirection chỉ nhận asc hoặc desc.")]
    public string SortDirection { get; init; } = "asc";

    public IEnumerable<ValidationResult> Validate(ValidationContext validationContext)
    {
        if (MinPrice.HasValue && MaxPrice.HasValue && MinPrice > MaxPrice)
        {
            yield return new ValidationResult(
                "MinPrice không được lớn hơn MaxPrice.",
                [nameof(MinPrice), nameof(MaxPrice)]);
        }
    }
}

public sealed class ProductRequest
{
    [Required(ErrorMessage = "Tên sản phẩm là bắt buộc.")]
    [StringLength(200, MinimumLength = 2, ErrorMessage = "Tên sản phẩm phải từ 2 đến 200 ký tự.")]
    public string Name { get; init; } = string.Empty;

    [StringLength(2000, ErrorMessage = "Mô tả không được vượt quá 2000 ký tự.")]
    public string Description { get; init; } = string.Empty;

    [Range(typeof(decimal), "0.01", "9999999999999999.99", ErrorMessage = "Giá phải lớn hơn 0.")]
    public decimal Price { get; init; }

    [Range(0, int.MaxValue, ErrorMessage = "Tồn kho phải lớn hơn hoặc bằng 0.")]
    public int Stock { get; init; }

    [Range(1, int.MaxValue, ErrorMessage = "CategoryId phải lớn hơn 0.")]
    public int CategoryId { get; init; }
}

public sealed record ProductResponse(
    int Id,
    string Name,
    string Description,
    decimal Price,
    int Stock,
    int CategoryId,
    string CategoryName);
