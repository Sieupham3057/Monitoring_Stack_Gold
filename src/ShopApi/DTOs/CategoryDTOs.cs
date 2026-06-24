using System.ComponentModel.DataAnnotations;
using ShopApi.Common;

namespace ShopApi.DTOs;

public sealed class CategoryQuery : PaginationQuery
{
    [StringLength(100, ErrorMessage = "Search không được vượt quá 100 ký tự.")]
    public string? Search { get; init; }

    [RegularExpression(
        "^(id|name|productCount)$",
        ErrorMessage = "SortBy chỉ nhận một trong các giá trị: id, name, productCount.")]
    public string SortBy { get; init; } = "name";

    [RegularExpression(
        "^(asc|desc)$",
        ErrorMessage = "SortDirection chỉ nhận asc hoặc desc.")]
    public string SortDirection { get; init; } = "asc";
}

public sealed class CategoryRequest
{
    [Required(ErrorMessage = "Tên danh mục là bắt buộc.")]
    [StringLength(100, MinimumLength = 2, ErrorMessage = "Tên danh mục phải từ 2 đến 100 ký tự.")]
    public string Name { get; init; } = string.Empty;

    [StringLength(1000, ErrorMessage = "Mô tả không được vượt quá 1000 ký tự.")]
    public string Description { get; init; } = string.Empty;
}

public sealed record CategoryResponse(int Id, string Name, string Description, int ProductCount);
