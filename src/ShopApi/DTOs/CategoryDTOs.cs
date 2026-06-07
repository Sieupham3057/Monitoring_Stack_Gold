namespace ShopApi.DTOs;

public record CategoryRequest(string Name, string Description);

public record CategoryResponse(int Id, string Name, string Description, int ProductCount);
