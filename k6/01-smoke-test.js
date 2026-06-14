/**
 * 01-smoke-test.js — Smoke Test
 *
 * Mục đích: Xác nhận API hoạt động đúng TRƯỚC khi chạy bất kỳ load test nào.
 * Chỉ 2 VU trong 2 phút — không đo performance, chỉ đo tính đúng đắn.
 *
 * Chạy:
 *   k6 run 01-smoke-test.js
 *   k6 run --env BASE_URL=https://banking-api.ngiveup.org 01-smoke-test.js
 *
 * Kỳ vọng: 0% lỗi, tất cả check đều pass.
 * Nếu smoke test fail → DỪNG, không chạy load test tiếp.
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';

export const options = {
  vus:      2,
  duration: '2m',
  thresholds: {
    http_req_failed:   ['rate<0.01'],    // Không chấp nhận lỗi khi smoke test
    http_req_duration: ['p(95)<5000'],   // Timeout rộng — chỉ check hoạt động được
  },
};

// ─── Cấu hình ──────────────────────────────────────────────────────────────────
// ĐIỀU CHỈNH: Sửa BASE_URL phù hợp với môi trường của anh.
// Nếu test LAN trực tiếp Nginx: BASE_URL=https://192.168.1.100 --insecure-skip-tls-verify
const BASE_URL = __ENV.BASE_URL || 'https://banking-api.ngiveup.org';

const JSON_HEADERS = { 'Content-Type': 'application/json', 'Accept': 'application/json' };

// ─── Helper: đăng ký user (bỏ qua nếu đã tồn tại) ────────────────────────────
function registerUser(username, email, password) {
  const res = http.post(
    `${BASE_URL}/api/Auth/register`,
    JSON.stringify({ username, email, password }),
    { headers: JSON_HEADERS }
  );
  // 200 = thành công, 400/409 = user đã tồn tại → bỏ qua
  return res.status === 200 || res.status === 201 || res.status === 400 || res.status === 409;
}

// ─── Helper: đăng nhập, trả về token hoặc null ───────────────────────────────
// ĐIỀU CHỈNH: Nếu API trả về field name khác, sửa dòng token bên dưới.
// Kiểm tra thủ công: curl -X POST .../api/Auth/login -H 'Content-Type: application/json'
//                         -d '{"username":"...","password":"..."}' | jq
function login(username, password) {
  const res = http.post(
    `${BASE_URL}/api/Auth/login`,
    JSON.stringify({ username, password }),
    { headers: JSON_HEADERS }
  );

  const ok = check(res, {
    '[smoke] login: status 200': (r) => r.status === 200,
  });

  if (!ok) {
    console.error(`Login thất bại cho "${username}": HTTP ${res.status} — ${res.body}`);
    return null;
  }

  // Thử các tên field phổ biến mà JWT API hay dùng
  try {
    const body = res.json();
    const token = body.token || body.accessToken || body.access_token || body.jwt;
    if (!token) {
      console.error(`Login OK nhưng không tìm thấy token trong response: ${res.body}`);
    }
    return token || null;
  } catch {
    console.error(`Không parse được JSON response: ${res.body}`);
    return null;
  }
}

// ─── Setup: đăng ký 2 user test (chạy 1 lần trước khi VU bắt đầu) ───────────
export function setup() {
  const res = http.get(`${BASE_URL}/health`);
  if (res.status !== 200) {
    throw new Error(`[SMOKE] API không phản hồi tại ${BASE_URL}/health — status: ${res.status}`);
  }
  console.log(`[SMOKE] Health check OK: ${BASE_URL}`);

  // Đăng ký 2 user test (idempotent — chạy lại sẽ bỏ qua nếu đã tồn tại)
  for (let i = 1; i <= 2; i++) {
    const u = `smoketest_00${i}`;
    registerUser(u, `${u}@test.com`, 'TestPass@123');
  }
  console.log('[SMOKE] User seed complete');
}

// ─── Main function: chạy đầy đủ user journey ──────────────────────────────────
export default function () {
  const userIdx = __VU; // VU 1 → user 1, VU 2 → user 2
  const username = `smoketest_00${userIdx}`;
  const password = 'TestPass@123';

  // ── Bước 1: Health check ──────────────────────────────────────────────────────
  group('1_health', () => {
    const res = http.get(`${BASE_URL}/health`, { headers: { Accept: 'application/json' } });
    check(res, {
      '[smoke] health: status 200': (r) => r.status === 200,
      '[smoke] health: has status field': (r) => {
        try { return !!r.json('status'); } catch { return false; }
      },
    });
  });

  sleep(0.5);

  // ── Bước 2: Login ─────────────────────────────────────────────────────────────
  let token = null;
  group('2_login', () => {
    token = login(username, password);
  });

  if (!token) {
    sleep(2);
    return;
  }

  const authHeaders = { Authorization: `Bearer ${token}`, ...JSON_HEADERS };

  // ── Bước 3: Danh sách sản phẩm ───────────────────────────────────────────────
  group('3_products', () => {
    const res = http.get(`${BASE_URL}/api/Products?page=1&pageSize=20`, { headers: authHeaders });
    check(res, {
      '[smoke] products: status 200': (r) => r.status === 200,
    });
    sleep(1);
  });

  // ── Bước 4: Danh sách danh mục ───────────────────────────────────────────────
  group('4_categories', () => {
    const res = http.get(`${BASE_URL}/api/Categories`, { headers: authHeaders });
    check(res, {
      '[smoke] categories: status 200': (r) => r.status === 200,
    });
    sleep(1);
  });

  // ── Bước 5: Chi tiết sản phẩm ────────────────────────────────────────────────
  group('5_product_detail', () => {
    const res = http.get(`${BASE_URL}/api/Products/1`, { headers: authHeaders });
    check(res, {
      '[smoke] product detail: 200 or 404': (r) => r.status === 200 || r.status === 404,
      '[smoke] product detail: not 500':    (r) => r.status !== 500,
    });
    sleep(1);
  });

  // ── Bước 6: Tạo đơn hàng ─────────────────────────────────────────────────────
  // ĐIỀU CHỈNH: Sửa productId phù hợp với dữ liệu thật trong DB của anh.
  group('6_create_order', () => {
    const payload = JSON.stringify({
      items: [{ productId: 1, quantity: 1 }],
    });
    const res = http.post(`${BASE_URL}/api/Orders`, payload, { headers: authHeaders });
    check(res, {
      '[smoke] create order: not 500': (r) => r.status !== 500,
      '[smoke] create order: 200 or 201 or 400': (r) =>
        r.status === 200 || r.status === 201 || r.status === 400,
    });
    sleep(1);
  });

  // ── Bước 7: Danh sách đơn hàng ───────────────────────────────────────────────
  group('7_orders', () => {
    const res = http.get(`${BASE_URL}/api/Orders?page=1&pageSize=10`, { headers: authHeaders });
    check(res, {
      '[smoke] orders: 200 or 401': (r) => r.status === 200 || r.status === 401,
      '[smoke] orders: not 500':    (r) => r.status !== 500,
    });
  });

  sleep(2);
}
