/**
 * 03-mixed-realistic-test.js — Kịch bản người dùng thật
 *
 * Mục đích: Giả lập hành vi người dùng thật với 2 loại user:
 *
 *   Scenario A — "readers" (70% traffic):
 *     Vào web, lướt sản phẩm, xem danh mục, đọc chi tiết → KHÔNG mua
 *     VD: người dùng đang compare giá, chưa quyết định
 *
 *   Scenario B — "shoppers" (30% traffic):
 *     Login → lướt sản phẩm → xem chi tiết → đặt hàng → xem đơn hàng
 *     VD: người dùng đã biết mình muốn mua gì
 *
 * Hai scenario chạy ĐỒNG THỜI, giả lập traffic hỗn hợp như hệ thống thật.
 *
 * Chạy:
 *   k6 run 03-mixed-realistic-test.js
 *   k6 run --env BASE_URL=https://banking-api.ngiveup.org 03-mixed-realistic-test.js
 *
 * Đọc kết quả: Chú ý metrics có tag scenario=readers và scenario=shoppers
 *   Nếu shoppers.p95 > 3000ms → hệ thống đang bottle neck ở write path
 *   Nếu readers.p95 > 1500ms  → hệ thống đang bottle neck ở read path
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { SharedArray } from 'k6/data';
import { Rate, Trend, Counter } from 'k6/metrics';
import papaparse from 'https://jslib.k6.io/papaparse/5.1.1/index.js';

// ─── Cấu hình ──────────────────────────────────────────────────────────────────
const BASE_URL = __ENV.BASE_URL || 'https://banking-api.ngiveup.org';
const HOST     = __ENV.HOST     || '';

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Accept':       'application/json',
  ...(HOST ? { Host: HOST } : {}),
};

// ─── Hai scenario chạy song song ──────────────────────────────────────────────
// Tổng peak: 80 readers + 40 shoppers = 120 VUs đồng thời
export const options = {
  scenarios: {
    // Người dùng lướt web, không mua
    readers: {
      executor:          'ramping-vus',
      startVUs:          0,
      stages: [
        { duration: '30s', target: 20 },   // Khởi động nhẹ
        { duration: '1m',  target: 50 },   // Tăng dần
        { duration: '3m',  target: 80 },   // Giữ tải — đây là tải chính
        { duration: '30s', target: 0  },   // Hạ xuống
      ],
      exec:              'readerJourney',
      gracefulRampDown:  '20s',
    },

    // Người dùng có ý định mua
    shoppers: {
      executor:          'ramping-vus',
      startVUs:          0,
      stages: [
        { duration: '1m',  target: 10 },   // Ramp chậm hơn (login + write nặng hơn)
        { duration: '2m',  target: 30 },
        { duration: '2m',  target: 40 },   // Giữ tải mua hàng
        { duration: '30s', target: 0  },
      ],
      exec:              'shopperJourney',
      gracefulRampDown:  '20s',
    },
  },

  thresholds: {
    // Global threshold
    http_req_failed:   ['rate<0.05'],
    http_req_duration: ['p(95)<3000', 'p(99)<8000'],

    // Threshold theo scenario — phát hiện vấn đề ở từng loại traffic
    'http_req_duration{scenario:readers}':  ['p(95)<1500'],  // Đọc phải nhanh
    'http_req_duration{scenario:shoppers}': ['p(95)<3000'],  // Mua có thể chậm hơn

    // Custom metrics
    'order_success_rate': ['rate>0.80'],  // Ít nhất 80% đặt hàng thành công
  },
};

// ─── Custom metrics ────────────────────────────────────────────────────────────
const orderSuccessRate = new Rate('order_success_rate');
const orderDuration    = new Trend('order_duration', true);
const loginDuration    = new Trend('login_duration', true);
const errorRate        = new Rate('custom_error_rate');

// ─── Users pool ───────────────────────────────────────────────────────────────
const users = new SharedArray('shoptest_users', function () {
  const content = open('./data/users.csv').replace(/^﻿/, '');
  return papaparse.parse(content, { header: true, skipEmptyLines: true }).data
    .filter(u => u.username);
});

// ─── Setup ────────────────────────────────────────────────────────────────────
export function setup() {
  const health = http.get(`${BASE_URL}/health`);
  if (health.status !== 200) {
    throw new Error(`API offline: ${BASE_URL}/health returned ${health.status}`);
  }
  console.log(`[SETUP] API OK: ${BASE_URL}`);

  const BATCH_SIZE = 20;
  let registered = 0;
  for (let i = 0; i < users.length; i += BATCH_SIZE) {
    const batch = users.slice(i, i + BATCH_SIZE).map(u => ([
      'POST',
      `${BASE_URL}/api/Auth/register`,
      JSON.stringify({ username: u.username, email: u.email, password: u.password }),
      { headers: JSON_HEADERS },
    ]));
    const responses = http.batch(batch);
    for (const res of responses) {
      if (res.status === 200 || res.status === 201) registered++;
    }
  }
  console.log(`[SETUP] ${registered} users mới đã đăng ký | Pool: ${users.length} unique accounts`);
}

// ─── Helper: Login ────────────────────────────────────────────────────────────
function doLogin(username, password) {
  const start = Date.now();
  const res = http.post(
    `${BASE_URL}/api/Auth/login`,
    JSON.stringify({ username, password }),
    { headers: JSON_HEADERS, timeout: '15s' }
  );
  loginDuration.add(Date.now() - start);

  check(res, { 'login 200': (r) => r.status === 200 });

  if (res.status !== 200) return null;

  try {
    const body = res.json();
    return body.token || body.accessToken || body.access_token || null;
  } catch {
    return null;
  }
}

// ─── Shared: Token cache per-VU ───────────────────────────────────────────────
const vuState = { token: null };

function ensureToken(journeyName) {
  if (vuState.token) return true;

  const user = users[(__VU - 1) % users.length];
  const token = doLogin(user.username, user.password);

  if (!token) {
    console.warn(`[${journeyName}] VU ${__VU}: Login thất bại`);
    return false;
  }

  vuState.token = token;
  return true;
}

function authH() {
  return { ...JSON_HEADERS, Authorization: `Bearer ${vuState.token}` };
}

function handleUnauth(res) {
  if (res.status === 401) vuState.token = null;
}

// ─── Scenario A: Reader Journey ───────────────────────────────────────────────
// Giả lập: user lướt web, tìm sản phẩm, đọc danh mục nhưng chưa mua
export function readerJourney() {
  if (!ensureToken('reader')) { sleep(3); return; }

  // Bước 1: Xem trang chủ / health (vào web lần đầu)
  group('reader_health', () => {
    const res = http.get(`${BASE_URL}/health`, { headers: authH(), timeout: '10s' });
    const ok = check(res, { 'reader: health 200': (r) => r.status === 200 });
    errorRate.add(!ok);
    handleUnauth(res);
  });

  // Think time: user bắt đầu lướt (1-2 giây)
  sleep(Math.random() * 1.5 + 0.8);

  // Bước 2: Xem danh mục để chọn loại sản phẩm
  group('reader_categories', () => {
    const res = http.get(`${BASE_URL}/api/Categories`, { headers: authH(), timeout: '10s' });
    const ok = check(res, { 'reader: categories 200': (r) => r.status === 200 });
    errorRate.add(!ok);
    handleUnauth(res);
  });

  sleep(Math.random() * 2 + 1); // user đọc danh mục (1-3 giây)

  // Bước 3: Lướt sản phẩm — xem 1-3 trang ngẫu nhiên
  const pagesToView = Math.floor(Math.random() * 3) + 1;
  for (let p = 1; p <= pagesToView; p++) {
    group('reader_products', () => {
      const page = Math.floor(Math.random() * 5) + 1;
      const res = http.get(
        `${BASE_URL}/api/Products?page=${page}&pageSize=20`,
        { headers: authH(), timeout: '15s' }
      );
      const ok = check(res, { 'reader: products 200': (r) => r.status === 200 });
      errorRate.add(!ok);
      handleUnauth(res);
    });
    sleep(Math.random() * 3 + 2); // user đọc từng trang (2-5 giây)
  }

  // Bước 4: Xem chi tiết 1-2 sản phẩm cụ thể
  // ĐIỀU CHỈNH: thay 20 bằng số lượng sản phẩm thực trong DB của anh
  const productsToView = Math.floor(Math.random() * 2) + 1;
  for (let i = 0; i < productsToView; i++) {
    group('reader_product_detail', () => {
      const productId = Math.floor(Math.random() * 20) + 1;
      const res = http.get(
        `${BASE_URL}/api/Products/${productId}`,
        { headers: authH(), timeout: '10s' }
      );
      check(res, {
        'reader: product detail not 500': (r) => r.status !== 500,
      });
      handleUnauth(res);
    });
    sleep(Math.random() * 4 + 2); // user đọc chi tiết sản phẩm (2-6 giây)
  }

  // Reader kết thúc — không mua
  sleep(Math.random() * 2 + 1);
}

// ─── Scenario B: Shopper Journey ─────────────────────────────────────────────
// Giả lập: user đã biết mình muốn gì → login → tìm → mua → kiểm tra đơn hàng
export function shopperJourney() {
  if (!ensureToken('shopper')) { sleep(3); return; }

  // Bước 1: Lướt sản phẩm để chọn
  group('shopper_browse', () => {
    const page = Math.floor(Math.random() * 3) + 1;
    const res = http.get(
      `${BASE_URL}/api/Products?page=${page}&pageSize=20`,
      { headers: authH(), timeout: '15s' }
    );
    const ok = check(res, { 'shopper: browse 200': (r) => r.status === 200 });
    errorRate.add(!ok);
    handleUnauth(res);
  });

  sleep(Math.random() * 2 + 1.5); // user chọn sản phẩm (1.5-3.5 giây)

  // Bước 2: Xem chi tiết sản phẩm định mua
  let selectedProductId = Math.floor(Math.random() * 15) + 1; // ĐIỀU CHỈNH: ID sản phẩm thực
  group('shopper_product_detail', () => {
    const res = http.get(
      `${BASE_URL}/api/Products/${selectedProductId}`,
      { headers: authH(), timeout: '10s' }
    );
    check(res, {
      'shopper: detail not 500': (r) => r.status !== 500,
    });
    // Nếu không tìm thấy, chọn ID khác
    if (res.status === 404) selectedProductId = 1;
    handleUnauth(res);
  });

  sleep(Math.random() * 3 + 2); // user đọc kỹ chi tiết, xem ảnh (2-5 giây)

  // Bước 3: Đặt hàng — đây là operation write quan trọng nhất
  group('shopper_create_order', () => {
    const quantity = Math.floor(Math.random() * 3) + 1; // 1-3 sản phẩm
    const start = Date.now();
    const res = http.post(
      `${BASE_URL}/api/Orders`,
      JSON.stringify({
        items: [{ productId: selectedProductId, quantity }],
      }),
      { headers: authH(), timeout: '20s' }
    );
    orderDuration.add(Date.now() - start);

    const success = check(res, {
      'shopper: order created': (r) => r.status === 200 || r.status === 201,
      'shopper: order not 500': (r) => r.status !== 500,
    });
    orderSuccessRate.add(success);
    errorRate.add(!success && res.status >= 500);
    handleUnauth(res);
  });

  sleep(Math.random() * 2 + 1); // user chờ xác nhận đơn hàng (1-3 giây)

  // Bước 4: Xem lại đơn hàng vừa đặt
  group('shopper_view_orders', () => {
    const res = http.get(
      `${BASE_URL}/api/Orders?page=1&pageSize=10`,
      { headers: authH(), timeout: '15s' }
    );
    check(res, {
      'shopper: orders 200': (r) => r.status === 200 || r.status === 401,
      'shopper: orders not 500': (r) => r.status !== 500,
    });
    handleUnauth(res);
  });

  // Nghỉ dài hơn sau khi mua (user đọc email xác nhận, etc.)
  sleep(Math.random() * 4 + 3);
}
