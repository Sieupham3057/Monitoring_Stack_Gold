namespace ShopApi.DTOs;

public record OrderItemRequest(int ProductId, int Quantity);

public record CreateOrderRequest(List<OrderItemRequest> Items);

public record OrderItemResponse(int ProductId, string ProductName, int Quantity, decimal UnitPrice);

public record OrderResponse(int Id, decimal TotalAmount, string Status, DateTime CreatedAt, List<OrderItemResponse> Items);
