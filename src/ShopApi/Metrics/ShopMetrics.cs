using Prometheus;

// Dùng alias để tránh conflict: namespace ShopApi.Metrics vs class Prometheus.Metrics
using PrometheusMetrics = Prometheus.Metrics;

namespace ShopApi.Metrics;

// Toàn bộ Prometheus metrics của ShopApi định nghĩa tập trung tại đây.
// Static class → tạo một lần khi app khởi động, dùng suốt lifecycle.
// Quy tắc đặt tên: shopapi_{domain}_{action}_{unit}
public static class ShopMetrics
{
    // ================================================================
    // AUTH METRICS
    // ================================================================

    // Đếm số lần đăng nhập — phân biệt thành công / thất bại
    // PromQL: rate(shopapi_auth_logins_total{status="failed"}[5m]) → phát hiện brute force
    public static readonly Counter AuthLoginsTotal = PrometheusMetrics.CreateCounter(
        "shopapi_auth_logins_total",
        "Tổng số lần đăng nhập",
        labelNames: ["status"]);  // status: success | failed

    // Đếm số lần đăng ký tài khoản
    public static readonly Counter AuthRegistrationsTotal = PrometheusMetrics.CreateCounter(
        "shopapi_auth_registrations_total",
        "Tổng số lần đăng ký tài khoản",
        labelNames: ["status"]);  // status: success | conflict

    // ================================================================
    // ORDER METRICS — phần quan trọng nhất để theo dõi nghiệp vụ
    // ================================================================

    // Đếm đơn hàng theo kết quả xử lý
    // PromQL: rate(shopapi_orders_total{status="created"}[1m]) → throughput tạo đơn
    // PromQL: rate(shopapi_orders_total{status=~"failed.*"}[5m]) → tỷ lệ lỗi nghiệp vụ
    public static readonly Counter OrdersTotal = PrometheusMetrics.CreateCounter(
        "shopapi_orders_total",
        "Tổng số đơn hàng theo kết quả xử lý",
        labelNames: ["status"]);  // status: created | failed_empty | failed_not_found | failed_stock

    // Đo thời gian xử lý toàn bộ một order request (từ lúc vào action đến khi SaveChanges xong)
    // Đây là metric quan trọng nhất để phát hiện bottleneck DB
    // PromQL: histogram_quantile(0.95, rate(shopapi_order_processing_duration_seconds_bucket[5m]))
    public static readonly Histogram OrderProcessingDuration = PrometheusMetrics.CreateHistogram(
        "shopapi_order_processing_duration_seconds",
        "Thời gian xử lý đơn hàng end-to-end (seconds)",
        new HistogramConfiguration
        {
            // Buckets thiết kế cho DB transaction: từ 10ms đến 5s
            // Nếu P95 vượt 0.5s → cần index DB hoặc tối ưu query
            Buckets = [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0]
        });

    // ================================================================
    // PRODUCT METRICS
    // ================================================================

    // Đếm lượt query sản phẩm — hữu ích khi K6 test read-heavy workload
    // PromQL: rate(shopapi_product_queries_total[5m]) → so sánh với order rate → read/write ratio
    public static readonly Counter ProductQueriesTotal = PrometheusMetrics.CreateCounter(
        "shopapi_product_queries_total",
        "Tổng số lần query danh sách sản phẩm");
}
