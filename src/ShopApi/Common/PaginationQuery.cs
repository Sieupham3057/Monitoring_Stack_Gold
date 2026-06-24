using System.ComponentModel.DataAnnotations;

namespace ShopApi.Common;

public class PaginationQuery
{
    [Range(1, 1_000_000, ErrorMessage = "PageNumber phải nằm trong khoảng từ 1 đến 1.000.000.")]
    public int PageNumber { get; init; } = 1;

    [Range(1, 100, ErrorMessage = "PageSize phải nằm trong khoảng từ 1 đến 100.")]
    public int PageSize { get; init; } = 20;
}
