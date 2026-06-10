// ============================================================
// K6 STRESS TEST — Tìm điểm giới hạn (breaking point) của ShopApi
//
// Mục tiêu: Tăng tải liên tục đến khi hệ thống không đáp ứng được
// Kết quả: Biết được "Maximum Throughput" và điểm bắt đầu degradation
//
// CẢNH BÁO: Test này CÓ THỂ làm server không phản hồi tạm thời.
// Chỉ chạy trên môi trường DEV/STAGING, KHÔNG chạy production.
//
// Chạy:
//   k6 run --out influxdb=http://localhost:8086/k6 src/k6/stress-test.js
// ============================================================

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

const errorRate    = new Rate('stress_error_rate');
const reqDuration  = new Trend('stress_req_duration', true);
const serverErrors = new Counter('stress_server_errors_5xx');

const BASE_URL = __ENV.BASE_URL || 'http://localhost:5065';

export const options = {
  // ----------------------------------------------------------
  // STRESS STAGES — tăng dần đến breaking point
  // Mỗi stage = 1 "level" áp lực
  // ----------------------------------------------------------
  stages: [
    // Level 0: Baseline — đây là trạng thái bình thường
    { duration: '1m',  target: 10  },
    // Level 1: Normal load
    { duration: '2m',  target: 30  },
    // Level 2: High load — bắt đầu thấy degradation
    { duration: '2m',  target: 60  },
    // Level 3: Very high — nhiều hệ thống bắt đầu bị throttle
    { duration: '2m',  target: 100 },
    // Level 4: Extreme — tìm breaking point
    { duration: '2m',  target: 150 },
    // Level 5: Maximum stress — hầu hết API đều fail tại đây
    { duration: '2m',  target: 200 },
    // Recovery: quan trọng — xem hệ thống có tự phục hồi không?
    { duration: '3m',  target: 30  },
    // Cool-down
    { duration: '1m',  target: 0   },
  ],

  thresholds: {
    // Stress test PASS nếu error rate dưới 10% (ngưỡng nới hơn load test)
    'http_req_failed': ['rate<0.10'],
    // P99 dưới 5s (rộng hơn) — ta muốn đo đến đâu hệ thống còn sống
    'http_req_duration': ['p(99)<5000'],
  },
};

// Các endpoint quan trọng cần stress
const ENDPOINTS = [
  { name: 'Health Check',    url: '/health',                method: 'GET',  auth: false },
  { name: 'Products List',   url: '/api/products?page=1',   method: 'GET',  auth: true  },
  { name: 'Auth Login',      url: '/api/auth/login',        method: 'POST', auth: false },
];

// JWT token pool — lấy ở setup, tái dụng để tránh đăng nhập mỗi request
let sharedTokens = [];

export function setup() {
  const healthRes = http.get(`${BASE_URL}/health`);
  if (healthRes.status !== 200) {
    throw new Error(`[STRESS SETUP] ShopApi không lên tại ${BASE_URL}`);
  }

  // Tạo sẵn 10 user để VU tái dùng token (tránh login bottleneck)
  const tokens = [];
  for (let i = 0; i < 10; i++) {
    const uname = `stress_shared_${i}_${Date.now()}`;
    http.post(`${BASE_URL}/api/auth/register`, JSON.stringify({
      username: uname, email: `${uname}@stress.local`, password: 'Stress@2026!'
    }), { headers: { 'Content-Type': 'application/json' } });

    const loginRes = http.post(`${BASE_URL}/api/auth/login`, JSON.stringify({
      username: uname, password: 'Stress@2026!'
    }), { headers: { 'Content-Type': 'application/json' } });

    if (loginRes.status === 200) {
      try { tokens.push(JSON.parse(loginRes.body).token); } catch {}
    }
  }

  console.log(`[STRESS SETUP] Tạo xong ${tokens.length} shared tokens`);
  return { tokens, baseUrl: BASE_URL };
}

export default function (data) {
  // Tái dùng shared token thay vì login mỗi VU (giảm tải lên Auth endpoint)
  const token = data.tokens.length > 0
    ? data.tokens[__VU % data.tokens.length]
    : null;

  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
  };

  // --- Test 1: Health endpoint (phải luôn trả lời) ---
  const healthRes = http.get(`${BASE_URL}/health`);
  const healthOk = check(healthRes, {
    'health: alive': (r) => r.status === 200,
  });
  errorRate.add(!healthOk ? 1 : 0);
  reqDuration.add(healthRes.timings.duration);

  sleep(0.1);

  // --- Test 2: Products (read-heavy) ---
  const t1 = Date.now();
  const productsRes = http.get(`${BASE_URL}/api/products?page=1&pageSize=10`, { headers });
  reqDuration.add(Date.now() - t1);

  const prodOk = check(productsRes, {
    'products: không phải 5xx': (r) => r.status < 500,
  });

  if (!prodOk || productsRes.status >= 500) {
    serverErrors.add(1);
    errorRate.add(1);
  } else {
    errorRate.add(0);
  }

  sleep(0.2);
}

export function teardown(data) {
  console.log('[STRESS TEARDOWN] Xem kết quả tại: http://localhost:3000');
  console.log('[STRESS TEARDOWN] Dashboard → K6 Load Test → chọn "Stress Test" trong filter');
}
