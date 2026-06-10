// ============================================================
// K6 LOAD TEST — ShopApi (.NET 8)
// Mục tiêu: Kiểm tra hiệu năng API dưới tải thực tế
//
// Chạy lệnh (WSL/Linux):
//   k6 run --out influxdb=http://localhost:8086/k6 src/k6/load-test.js
//
// Chạy với BASE_URL khác (ví dụ server VMware):
//   k6 run --out influxdb=http://localhost:8086/k6 \
//     -e BASE_URL=http://192.168.1.35:5065 src/k6/load-test.js
//
// Kịch bản load: Ramp-up → Sustained → Spike → Ramp-down
// ============================================================

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';

// ============================================================
// CUSTOM METRICS — đo riêng từng nghiệp vụ
// Trend = phân phối (P50/P95/P99), Rate = tỷ lệ, Counter = đếm
// ============================================================
const loginDuration      = new Trend('shopapi_login_duration', true);      // ms
const productDuration    = new Trend('shopapi_product_duration', true);     // ms
const orderDuration      = new Trend('shopapi_order_duration', true);       // ms
const orderHistDuration  = new Trend('shopapi_order_history_duration', true);
const businessErrorRate  = new Rate('shopapi_business_error_rate');         // lỗi nghiệp vụ
const ordersCreated      = new Counter('shopapi_orders_created');           // tổng đơn hàng

// ============================================================
// CẤU HÌNH TEST
// ============================================================
const BASE_URL = __ENV.BASE_URL || 'http://localhost:5065';

// Dữ liệu test — K6 sẽ random chọn khi tạo user/order
const PRODUCTS = [1, 2, 3, 4, 5];  // product ID giả định
const QUANTITIES = [1, 2, 3];

export const options = {
  // ----------------------------------------------------------
  // STAGES — mô phỏng traffic thực tế
  // [BẮT BUỘC] Định nghĩa hình dạng load theo thời gian
  // ----------------------------------------------------------
  stages: [
    // Warm-up: hệ thống khởi động, JIT compile, connection pool warm
    { duration: '30s', target: 5 },
    // Ramp-up: tăng dần để thấy điểm bão hòa
    { duration: '1m',  target: 30 },
    // Sustained load: duy trì tải bình thường, check ổn định
    { duration: '2m',  target: 30 },
    // Spike: đột biến traffic (flash sale, burst event)
    { duration: '30s', target: 80 },
    // Sustained spike: API có chịu được spike kéo dài không?
    { duration: '1m',  target: 80 },
    // Ramp-down: xem có vấn đề khi giảm tải không
    { duration: '30s', target: 0 },
  ],

  // ----------------------------------------------------------
  // THRESHOLDS — điều kiện để test PASS/FAIL
  // [BẮT BUỘC] Đây là "SLO" của bạn trong load test
  // ----------------------------------------------------------
  thresholds: {
    // 95% tổng request phải xong trong 500ms
    'http_req_duration': ['p(95)<500', 'p(99)<1000'],
    // Tỷ lệ request lỗi phải dưới 1%
    'http_req_failed': ['rate<0.01'],
    // Login phải nhanh — JWT sign không được chậm
    'shopapi_login_duration': ['p(95)<300'],
    // Order (write + transaction) chậm hơn read — ok với 800ms P95
    'shopapi_order_duration': ['p(95)<800', 'p(99)<2000'],
    // Lỗi nghiệp vụ (401, 422...) dưới 5%
    'shopapi_business_error_rate': ['rate<0.05'],
  },
};

// ============================================================
// HELPER FUNCTIONS
// ============================================================

// Tạo username ngẫu nhiên để tránh conflict giữa các VU
function randomUsername() {
  return `k6user_${__VU}_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
}

// Register + Login, trả về JWT token
function authenticate(username) {
  const password = 'K6Test@2026!';
  const email = `${username}@k6test.local`;

  // Step 1: Register (có thể lỗi 409 nếu user đã tồn tại — chấp nhận được)
  http.post(`${BASE_URL}/api/auth/register`, JSON.stringify({
    username, email, password
  }), { headers: { 'Content-Type': 'application/json' } });

  // Step 2: Login và lấy JWT
  const loginStart = Date.now();
  const loginRes = http.post(`${BASE_URL}/api/auth/login`, JSON.stringify({
    username, password
  }), { headers: { 'Content-Type': 'application/json' } });

  loginDuration.add(Date.now() - loginStart);

  const loginOk = check(loginRes, {
    'login: status 200': (r) => r.status === 200,
    'login: có token trong response': (r) => {
      try { return JSON.parse(r.body).token !== undefined; } catch { return false; }
    },
  });

  if (!loginOk) {
    businessErrorRate.add(1);
    return null;
  }

  businessErrorRate.add(0);
  try { return JSON.parse(loginRes.body).token; } catch { return null; }
}

// ============================================================
// MAIN SCENARIO — chạy cho mỗi Virtual User, mỗi iteration
// ============================================================
export default function () {
  const username = randomUsername();

  // --- PHASE 1: Authentication ---
  group('1. Authentication', () => {
    const token = authenticate(username);
    if (!token) {
      sleep(1);
      return;
    }

    const authHeaders = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    };

    // --- PHASE 2: Browse Products (read-heavy) ---
    group('2. Browse Products', () => {
      // Lấy danh sách sản phẩm trang 1
      const t1 = Date.now();
      const productsRes = http.get(`${BASE_URL}/api/products?page=1&pageSize=20`, { headers: authHeaders });
      productDuration.add(Date.now() - t1);

      check(productsRes, {
        'products: status 200': (r) => r.status === 200,
        'products: có data': (r) => {
          try { return JSON.parse(r.body).length > 0 || JSON.parse(r.body).items !== undefined; } catch { return false; }
        },
      });

      sleep(0.5); // simulate user reading the list

      // Xem chi tiết 1 sản phẩm
      const productId = PRODUCTS[Math.floor(Math.random() * PRODUCTS.length)];
      const t2 = Date.now();
      const productDetail = http.get(`${BASE_URL}/api/products/${productId}`, { headers: authHeaders });
      productDuration.add(Date.now() - t2);

      check(productDetail, {
        'product detail: status 200 hoặc 404': (r) => r.status === 200 || r.status === 404,
      });

      sleep(1); // simulate user reviewing product details
    });

    // --- PHASE 3: Create Order (write + DB transaction) ---
    group('3. Create Order', () => {
      const productId = PRODUCTS[Math.floor(Math.random() * PRODUCTS.length)];
      const quantity = QUANTITIES[Math.floor(Math.random() * QUANTITIES.length)];

      const t = Date.now();
      const orderRes = http.post(`${BASE_URL}/api/orders`, JSON.stringify({
        items: [{ productId, quantity }]
      }), { headers: authHeaders });
      orderDuration.add(Date.now() - t);

      const orderOk = check(orderRes, {
        'order: status 200 hoặc 201': (r) => r.status === 200 || r.status === 201,
        'order: không phải 5xx': (r) => r.status < 500,
      });

      if (orderOk && (orderRes.status === 200 || orderRes.status === 201)) {
        ordersCreated.add(1);
      }

      sleep(0.5);
    });

    // --- PHASE 4: View Order History ---
    group('4. Order History', () => {
      const t = Date.now();
      const histRes = http.get(`${BASE_URL}/api/orders`, { headers: authHeaders });
      orderHistDuration.add(Date.now() - t);

      check(histRes, {
        'order history: status 200': (r) => r.status === 200,
      });
    });
  });

  // Think time giữa các iteration — simulate user không spam request liên tục
  // Giảm sleep → tăng RPS thực tế; tăng sleep → giảm RPS nhưng VU vẫn active
  sleep(Math.random() * 2 + 1);  // sleep 1-3 giây ngẫu nhiên
}

// ============================================================
// SETUP — chạy 1 lần trước khi test bắt đầu
// ============================================================
export function setup() {
  // Kiểm tra API có up không trước khi tạo VU
  const healthRes = http.get(`${BASE_URL}/health`);
  if (healthRes.status !== 200) {
    throw new Error(`[K6 SETUP] ShopApi không phản hồi tại ${BASE_URL}/health — status: ${healthRes.status}`);
  }
  console.log(`[K6 SETUP] ShopApi up và running tại: ${BASE_URL}`);
  return { baseUrl: BASE_URL };
}

// ============================================================
// TEARDOWN — chạy 1 lần sau khi test kết thúc
// ============================================================
export function teardown(data) {
  console.log(`[K6 TEARDOWN] Load test hoàn thành. Target: ${data.baseUrl}`);
  console.log('[K6 TEARDOWN] Xem kết quả trên Grafana: http://localhost:3000');
}
