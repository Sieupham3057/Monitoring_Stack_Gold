/**
 * 04-stress-breakpoint-test.js — Stress & Breakpoint Test
 *
 * Mục đích: Tăng tải liên tục để TÌM ĐIỂM GÃY của hệ thống.
 *
 * Câu hỏi cần trả lời:
 *   - Hệ thống bắt đầu chậm dần ở bao nhiêu VU?
 *   - Error rate vượt 5% ở bao nhiêu VU?
 *   - RPS đạt tối đa rồi bắt đầu giảm ở đâu? (đó là điểm bão hòa)
 *   - Sau khi hạ tải, hệ thống có phục hồi không?
 *
 * Chạy CẢ BỘ 3:
 *   1. Chạy với 1 backend → ghi "điểm gãy 1 backend" là bao nhiêu VU
 *   2. Bật 2 backend → chạy lại → điểm gãy tăng lên không?
 *   3. Bật 3 backend → chạy lại → điểm gãy tiếp tục tăng?
 *
 * Chạy:
 *   k6 run 04-stress-breakpoint-test.js
 *   k6 run --env BASE_URL=https://banking-api.ngiveup.org 04-stress-breakpoint-test.js
 *
 *   Lưu kết quả:
 *   k6 run --out json=results/stress-1backend.json 04-stress-breakpoint-test.js
 *
 * LƯU Ý: Test này kéo dài ~18 phút. Theo dõi CPU server trong khi test chạy.
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

// ─── Stages: tăng tải hung hăng để tìm điểm gãy ──────────────────────────────
// Mỗi stage 2 phút để đủ thời gian quan sát metrics ổn định tại mức đó.
// Cuối cùng: cool down để quan sát xem hệ thống có recover không.
export const options = {
  stages: [
    { duration: '1m',  target: 50  },  // [PHASE 1] Baseline — hệ thống ổn
    { duration: '2m',  target: 50  },  // Giữ ở 50 VU để lấy baseline
    { duration: '1m',  target: 100 },  // [PHASE 2] Tải nhẹ
    { duration: '2m',  target: 100 },  // Quan sát ở 100 VU
    { duration: '1m',  target: 200 },  // [PHASE 3] Tải vừa
    { duration: '2m',  target: 200 },  // Quan sát ở 200 VU
    { duration: '1m',  target: 350 },  // [PHASE 4] Bắt đầu stress
    { duration: '2m',  target: 350 },  // Quan sát ở 350 VU — 1 backend thường gãy ở đây
    { duration: '1m',  target: 500 },  // [PHASE 5] Heavy stress
    { duration: '2m',  target: 500 },  // Quan sát ở 500 VU
    { duration: '2m',  target: 0   },  // [COOLDOWN] Hạ tải — xem có recover không
  ],

  // Threshold rộng — mục tiêu là QUAN SÁT điểm gãy, không phải pass/fail cứng
  thresholds: {
    http_req_failed:   ['rate<0.50'],    // Chấp nhận đến 50% lỗi (đang tìm điểm gãy)
    http_req_duration: ['p(99)<30000'],  // Chỉ fail nếu p99 > 30 giây (timeout hoàn toàn)
  },
};

// ─── Metrics ───────────────────────────────────────────────────────────────────
const errorRate      = new Rate('custom_error_rate');
const successRate    = new Rate('custom_success_rate');
const p95Trend       = new Trend('req_duration_trend', true);
const requestCounter = new Counter('total_requests');

// ─── Users ────────────────────────────────────────────────────────────────────
const users = new SharedArray('shoptest_users', function () {
  const content = open('./data/users.csv').replace(/^﻿/, '');
  return papaparse.parse(content, { header: true, skipEmptyLines: true }).data
    .filter(u => u.username);
});

// ─── Token cache per-VU ───────────────────────────────────────────────────────
const vuState = { token: null, loginFails: 0 };

function login() {
  if (vuState.loginFails >= 3) return false; // Tránh spam login khi server đã quá tải

  const user = users[(__VU - 1) % users.length];
  const res = http.post(
    `${BASE_URL}/api/Auth/login`,
    JSON.stringify({ username: user.username, password: user.password }),
    { headers: JSON_HEADERS, timeout: '15s' }
  );

  if (res.status !== 200) {
    vuState.loginFails++;
    return false;
  }

  try {
    const body = res.json();
    vuState.token = body.token || body.accessToken || body.access_token || null;
    if (vuState.token) vuState.loginFails = 0;
    return !!vuState.token;
  } catch {
    return false;
  }
}

function authH() {
  return { ...JSON_HEADERS, Authorization: `Bearer ${vuState.token}` };
}

// ─── Setup ────────────────────────────────────────────────────────────────────
export function setup() {
  const health = http.get(`${BASE_URL}/health`);
  if (health.status !== 200) {
    throw new Error(`API offline: ${health.status}`);
  }

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
  console.log(`[SETUP] Stress test sẵn sàng. ${registered} users mới. Pool: ${users.length}. BASE_URL=${BASE_URL}`);
  console.log('[SETUP] THEO DÕI CPU của backend server trong khi test chạy!');
}

// ─── Main VU function ─────────────────────────────────────────────────────────
// Stress test dùng read-only để isolate bottleneck ở backend logic,
// không bị nhiễu bởi DB write locks
export default function () {
  if (!vuState.token) {
    if (!login()) {
      sleep(2);
      return;
    }
  }

  const params = { headers: authH(), timeout: '20s' };

  // ── Health ────────────────────────────────────────────────────────────────────
  let healthOk = false;
  group('health', () => {
    const start = Date.now();
    const res = http.get(`${BASE_URL}/health`, params);
    p95Trend.add(Date.now() - start);
    requestCounter.add(1);

    healthOk = check(res, { 'health 200': (r) => r.status === 200 });
    errorRate.add(!healthOk);
    successRate.add(healthOk);

    if (res.status === 401) vuState.token = null;
  });

  // Nếu health đã fail → hệ thống quá tải, không cần gửi thêm request
  if (!healthOk) {
    sleep(1);
    return;
  }

  // ── Products ──────────────────────────────────────────────────────────────────
  group('products', () => {
    const page = Math.floor(Math.random() * 5) + 1;
    const start = Date.now();
    const res = http.get(
      `${BASE_URL}/api/Products?page=${page}&pageSize=20`,
      params
    );
    p95Trend.add(Date.now() - start);
    requestCounter.add(1);

    const ok = check(res, { 'products 200': (r) => r.status === 200 });
    errorRate.add(!ok);
    successRate.add(ok);
    if (res.status === 401) vuState.token = null;
  });

  // ── Categories ────────────────────────────────────────────────────────────────
  group('categories', () => {
    const start = Date.now();
    const res = http.get(`${BASE_URL}/api/Categories`, params);
    p95Trend.add(Date.now() - start);
    requestCounter.add(1);

    const ok = check(res, { 'categories 200': (r) => r.status === 200 });
    errorRate.add(!ok);
    successRate.add(ok);
    if (res.status === 401) vuState.token = null;
  });

  // Think time ngắn (stress test nên minimize think time để đẩy tải tối đa)
  sleep(Math.random() * 0.5 + 0.2);
}
