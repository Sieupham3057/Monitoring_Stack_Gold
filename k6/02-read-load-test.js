/**
 * 02-read-load-test.js — Read Load Test (So sánh 1 / 2 / 3 backend)
 *
 * Mục đích: Script chuẩn để so sánh hiệu năng khi scale backend.
 * Chạy đúng script này 3 lần với Nginx config khác nhau, kết quả có thể so sánh trực tiếp.
 *
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │  LẦN 1: Nginx upstream chỉ có 1 backend  → ghi kết quả vào bảng Case A    │
 * │  LẦN 2: Nginx upstream có 2 backend      → ghi kết quả vào bảng Case B    │
 * │  LẦN 3: Nginx upstream có 3 backend      → ghi kết quả vào bảng Case C    │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * Chạy:
 *   k6 run 02-read-load-test.js
 *   k6 run --env BASE_URL=https://banking-api.ngiveup.org 02-read-load-test.js
 *
 *   Test trực tiếp Nginx, bỏ qua Cloudflare:
 *   k6 run --env BASE_URL=https://192.168.1.100 \
 *           --env HOST=banking-api.ngiveup.org \
 *           --insecure-skip-tls-verify 02-read-load-test.js
 *
 * Lưu kết quả ra JSON để so sánh:
 *   k6 run --out json=results/case-a-1backend.json 02-read-load-test.js
 *   k6 run --out json=results/case-b-2backend.json 02-read-load-test.js
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { SharedArray } from 'k6/data';
import { Rate, Trend, Counter } from 'k6/metrics';
import papaparse from 'https://jslib.k6.io/papaparse/5.1.1/index.js';

// ─── Cấu hình ──────────────────────────────────────────────────────────────────
const BASE_URL  = __ENV.BASE_URL  || 'https://banking-api.ngiveup.org';
const HOST      = __ENV.HOST      || '';  // Set khi test trực tiếp Nginx LAN

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Accept':       'application/json',
  ...(HOST ? { Host: HOST } : {}),
};

// ─── Stages: tải tăng dần để stress 1 backend và thấy rõ khi scale lên 2-3 ───
// Giữ nguyên stages này qua tất cả các lần chạy để kết quả có thể so sánh.
export const options = {
  stages: [
    { duration: '30s', target: 30  },  // Khởi động — warm up JIT, connection pool
    { duration: '1m',  target: 80  },  // Tải nhẹ — baseline
    { duration: '2m',  target: 150 },  // Tải vừa — 1 backend bắt đầu thấy áp lực
    { duration: '2m',  target: 200 },  // Tải cao — 1 backend thường bắt đầu chậm
    { duration: '1m',  target: 0   },  // Hạ tải — quan sát phục hồi
  ],
  thresholds: {
    // Nếu 1 backend không chịu được → các threshold này sẽ FAIL → đó là tín hiệu cần scale
    http_req_failed:             ['rate<0.05'],         // < 5% lỗi
    http_req_duration:           ['p(95)<2000', 'p(99)<5000'],
    'health_duration':           ['p(95)<500'],         // Health check phải nhanh
    'products_duration':         ['p(95)<2000'],
    'categories_duration':       ['p(95)<1500'],
  },
};

// ─── Custom metrics ────────────────────────────────────────────────────────────
const healthDuration     = new Trend('health_duration',     true);
const productsDuration   = new Trend('products_duration',   true);
const categoriesDuration = new Trend('categories_duration', true);
const ordersDuration     = new Trend('orders_duration',     true);
const errorRate          = new Rate('custom_error_rate');
const totalRequests      = new Counter('total_requests_sent');

// ─── Đọc user pool từ CSV (shared giữa tất cả VU — parse 1 lần duy nhất) ──────
const users = new SharedArray('shoptest_users', function () {
  const content = open('./data/users.csv').replace(/^﻿/, ''); // Strip UTF-8 BOM
  return papaparse.parse(content, { header: true, skipEmptyLines: true }).data
    .filter(u => u.username && u.username.length > 0);
});

// ─── Token cache per-VU ────────────────────────────────────────────────────────
// Mỗi VU giữ token riêng, không login lại mỗi iteration → giảm overhead
const vuState = { token: null };

function getUser() {
  return users[(__VU - 1) % users.length];
}

function login() {
  const user = getUser();
  const res = http.post(
    `${BASE_URL}/api/Auth/login`,
    JSON.stringify({ username: user.username, password: user.password }),
    { headers: JSON_HEADERS }
  );

  if (res.status !== 200) {
    console.warn(`VU ${__VU}: Login thất bại — HTTP ${res.status}`);
    return false;
  }

  try {
    const body = res.json();
    // ĐIỀU CHỈNH nếu API dùng field name khác
    vuState.token = body.token || body.accessToken || body.access_token || null;
    if (!vuState.token) {
      console.warn(`VU ${__VU}: Response không chứa token — body: ${res.body.substring(0, 200)}`);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function authHeaders() {
  return { ...JSON_HEADERS, Authorization: `Bearer ${vuState.token}` };
}

// ─── Setup: đăng ký tất cả user trước khi test bắt đầu ─────────────────────────
// Dùng http.batch() để đăng ký song song theo nhóm 20 — nhanh hơn nhiều với 1000 users
export function setup() {
  // Kiểm tra API online
  const health = http.get(`${BASE_URL}/health`);
  if (health.status !== 200) {
    throw new Error(`API không phản hồi tại ${BASE_URL}/health — status: ${health.status}`);
  }
  console.log(`[SETUP] API online: ${BASE_URL} | ${users.length} users cần đăng ký`);

  // Đăng ký users theo batch 20 để tránh overwhelm API trong setup phase
  const BATCH_SIZE = 20;
  let registered = 0;
  let existed = 0;

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
      else existed++;
    }

    if ((i + BATCH_SIZE) % 100 === 0) {
      console.log(`[SETUP] Tiến độ: ${Math.min(i + BATCH_SIZE, users.length)}/${users.length}`);
    }
  }

  console.log(`[SETUP] Hoàn tất: ${registered} users mới, ${existed} đã tồn tại`);
  console.log(`[SETUP] Bắt đầu test với ${users.length} unique users — mỗi VU dùng account riêng (không dùng chung)`);
}

// ─── Main VU function ──────────────────────────────────────────────────────────
export default function () {
  // Login nếu chưa có token (lần đầu của VU, hoặc sau khi token expire)
  if (!vuState.token) {
    if (!login()) {
      sleep(2);
      return;
    }
  }

  // ── Health check ──────────────────────────────────────────────────────────────
  group('health', () => {
    const start = Date.now();
    const res = http.get(`${BASE_URL}/health`, { headers: authHeaders(), timeout: '10s' });
    healthDuration.add(Date.now() - start);
    totalRequests.add(1);

    const ok = check(res, {
      'health 200': (r) => r.status === 200,
    });
    errorRate.add(!ok);

    // Token hết hạn → login lại iteration tiếp
    if (res.status === 401) vuState.token = null;
  });

  sleep(Math.random() * 0.5 + 0.2); // think time ngắn giữa các request

  // ── Danh sách sản phẩm (trang ngẫu nhiên) ────────────────────────────────────
  group('products_list', () => {
    const page = Math.floor(Math.random() * 5) + 1;
    const start = Date.now();
    const res = http.get(
      `${BASE_URL}/api/Products?page=${page}&pageSize=20`,
      { headers: authHeaders(), timeout: '15s' }
    );
    productsDuration.add(Date.now() - start);
    totalRequests.add(1);

    const ok = check(res, {
      'products 200': (r) => r.status === 200,
    });
    errorRate.add(!ok);
    if (res.status === 401) vuState.token = null;
  });

  sleep(Math.random() * 1 + 0.5);

  // ── Danh sách danh mục ────────────────────────────────────────────────────────
  group('categories', () => {
    const start = Date.now();
    const res = http.get(`${BASE_URL}/api/Categories`, { headers: authHeaders(), timeout: '10s' });
    categoriesDuration.add(Date.now() - start);
    totalRequests.add(1);

    const ok = check(res, {
      'categories 200': (r) => r.status === 200,
    });
    errorRate.add(!ok);
    if (res.status === 401) vuState.token = null;
  });

  sleep(Math.random() * 1 + 0.5);

  // ── Danh sách đơn hàng ────────────────────────────────────────────────────────
  group('orders_list', () => {
    const page = Math.floor(Math.random() * 3) + 1;
    const start = Date.now();
    const res = http.get(
      `${BASE_URL}/api/Orders?page=${page}&pageSize=10`,
      { headers: authHeaders(), timeout: '15s' }
    );
    ordersDuration.add(Date.now() - start);
    totalRequests.add(1);

    const ok = check(res, {
      'orders 200 or 401': (r) => r.status === 200 || r.status === 401,
      'orders not 500':    (r) => r.status !== 500,
    });
    errorRate.add(!ok);
    if (res.status === 401) vuState.token = null;
  });

  // Think time trước khi lặp lại (giả lập user đọc kết quả)
  sleep(Math.random() * 2 + 1);
}
