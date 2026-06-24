namespace ShopApi.Common;

public sealed record PagedResult<T>(
    IReadOnlyCollection<T> Items,
    int TotalCount,
    int PageNumber,
    int PageSize,
    int TotalPages,
    bool HasPreviousPage,
    bool HasNextPage)
{
    public static PagedResult<T> Create(
        IReadOnlyCollection<T> items,
        int totalCount,
        int pageNumber,
        int pageSize)
    {
        var totalPages = totalCount == 0
            ? 0
            : (int)Math.Ceiling(totalCount / (double)pageSize);

        return new PagedResult<T>(
            items,
            totalCount,
            pageNumber,
            pageSize,
            totalPages,
            pageNumber > 1,
            pageNumber < totalPages);
    }
}
