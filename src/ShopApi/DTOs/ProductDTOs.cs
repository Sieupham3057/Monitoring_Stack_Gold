namespace ShopApi.DTOs;

public record ProductRequest(string Name, string Description, decimal Price, int Stock, int CategoryId);

public record ProductResponse(int Id, string Name, string Description, decimal Price, int Stock, string CategoryName);

public record PagedResult<T>(IEnumerable<T> Items, int TotalCount, int Page, int PageSize);
