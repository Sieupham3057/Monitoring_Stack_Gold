/**
 * 05-failover-test.js — Failover Test
 *
 * Mục đích: Quan sát hành vi hệ thống khi TẮT 1 backend TRONG KHI đang có tải.
 *
 * Kịch bản:
 *   - K6 đang gửi 80 VU đều đặn
 *   - Tại phút thứ 2-3: anh SSH vào 192.168.1.51 và tắt service
 *   - Quan sát: Nginx có tự chuyển sang .50 không? Error rate spike bao lâu?
 *   - Tại phút thứ 5: bật lại .51 → Nginx có tự recover không?
 *
 * ┌────────────────────────────────────────────────────────────────────────────┐
 * │  TIMELINE:                                                                 │
 * │  0:00 - 1:00  → Ramp up từ 0 → 80 VU                                      │
 * │  1:00 - 3:00  → Steady 80 VU (2 backend đang nhận tải đều)                │
 * │  ~2:30        → *** TẮT backend .51 tại đây ***                            │
 * │  3:00 - 5:00  → Steady tiếp (Nginx nên failover sang .50)                  │
 * │  ~4:30        → *** BẬT LẠI backend .51 ***                                │
 * │  5:00 - 6:00  → Ramp down về 0                                             │
 * └────────────────────────────────────────────────────────────────────────────┘
 *
 * Cách tắt backend từ máy Windows của anh:
 *   ssh user@192.168.1.51
 *   sudo systemctl stop banking-api   # hoặc: sudo docker stop <container>
 *
 * Cách bật lại:
 *   sudo systemctl start banking-api
 *
 * Chạy test:
 *   k6 run 05-failover-test.js
 *   k6 run --env BASE_URL=https://banking-api.ngiveup.org 05-failover-test.js
 *
 * Theo dõi Nginx log trên server 192.168.1.100 (mở cửa sổ riêng):
 *   sudo tail -f /var/log/nginx/banking-api-access.log | grep upstream_addr
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { SharedArray } from 'k6/data';
import { Rate, Trend, Counter } from 'k6/metrics';
import { scenario } from 'k6/execution';
import papaparse from 'https://jslib.k6.io/papaparse/5.1.1/index.js';

// ─── Cấu hình ──────────────────────────────────────────────────────────────────
const BASE_URL = __ENV.BASE_URL || 'https://banking-api.ngiveup.org';
const HOST     = __ENV.HOST     || '';

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Accept':       'application/json',
  ...(HOST ? { Host: HOST } : {}),
};

// ─── Steady load trong 6 phút — tắt backend tay tại phút 2.5 ─────────────────
export const options = {
  stages: [
    { duration: '1m',  target: 80 },   // Ramp up
    { duration: '4m',  target: 80 },   // STEADY — tắt/bật backend trong giai đoạn này
    { duration: '1m',  target: 0  },   // Ramp down
  ],
  thresholds: {
    // Chấp nhận spike khi backend tắt, nhưng hệ thống phải recover
    http_req_failed:   ['rate<0.15'],   // Cho phép đến 15% lỗi (spike tạm thời khi failover)
    http_req_duration: ['p(95)<5000'],
    'failover_error_rate': ['rate<0.15'],
  },
};

// ─── Metrics ───────────────────────────────────────────────────────────────────
const failoverErrorRate = new Rate('failover_error_rate');
const responseDuration  = new Trend('response_duration', true);
const requestCounter    = new Counter('total_requests');

// ─── Users ────────────────────────────────────────────────────────────────────
const users = new SharedArray('shoptest_users', function () {
  const content = open('./data/users.csv').replace(/^﻿/, '');
  return papaparse.parse(content, { header: true, skipEmptyLines: true }).data
    .filter(u => u.username);
});

// ─── Token cache ──────────────────────────────────────────────────────────────
const vuState = { token: null };

function login() {
  const user = users[(__VU - 1) % users.length];
  const res = http.post(
    `${BASE_URL}/api/Auth/login`,
    JSON.stringify({ username: user.username, password: user.password }),
    { headers: JSON_HEADERS, timeout: '15s' }
  );
  if (res.status !== 200) return false;
  try {
    const body = res.json();
    vuState.token = body.token || body.accessToken || body.access_token || null;
    return !!vuState.token;
  } catch { return false; }
}

function authH() {
  return { ...JSON_HEADERS, Authorization: `Bearer ${vuState.token}` };
}

// ─── Setup ────────────────────────────────────────────────────────────────────
export function setup() {
  const health = http.get(`${BASE_URL}/health`);
  if (health.status !== 200) throw new Error(`API offline: ${health.status}`);

  // Seed users theo batch
  const BATCH_SIZE = 20;
  for (let i = 0; i < users.length; i += BATCH_SIZE) {
    const batch = users.slice(i, i + BATCH_SIZE).map(u => ([
      'POST',
      `${BASE_URL}/api/Auth/register`,
      JSON.stringify({ username: u.username, email: u.email, password: u.password }),
      { headers: JSON_HEADERS },
    ]));
    http.batch(batch);
  }

  console.log(`[FAILOVER] Test bắt đầu. BASE_URL=${BASE_URL}`);
  console.log('[FAILOVER] ─────────────────────────────────────────────────────');
  console.log('[FAILOVER] TIMELINE:');
  console.log('[FAILOVER]   0:00 - 1:00  → Ramp up 0→80 VU');
  console.log('[FAILOVER]   1:00 - 5:00  → Steady 80 VU');
  console.log('[FAILOVER]   ~2:30        → *** TẮT backend .51 ngay bây giờ ***');
  console.log('[FAILOVER]   ~4:30        → *** BẬT LẠI backend .51 ***');
  console.log('[FAILOVER]   5:00 - 6:00  → Ramp down');
  console.log('[FAILOVER] ─────────────────────────────────────────────────────');
  console.log('[FAILOVER] Mở cửa sổ khác để theo dõi Nginx log:');
  console.log('[FAILOVER]   sudo tail -f /var/log/nginx/banking-api-access.log | grep upstream_addr');
}

// ─── Main function ────────────────────────────────────────────────────────────
export default function () {
  // Log progress mỗi 30 giây (chỉ VU đầu tiên để không spam)
  if (__VU === 1 && __ITER % 5 === 0) {
    const elapsed = Math.round(scenario.progress * 6 * 60);
    console.log(`[FAILOVER] Elapsed ~${elapsed}s | VU=${__VU} | ITER=${__ITER}`);
    if (elapsed >= 150 && elapsed <= 200) {
      console.log('[FAILOVER] *** Đây là lúc tắt backend .51! ***');
    }
    if (elapsed >= 270 && elapsed <= 310) {
      console.log('[FAILOVER] *** Đây là lúc bật lại backend .51! ***');
    }
  }

  if (!vuState.token) {
    if (!login()) { sleep(2); return; }
  }

  const params = { headers: authH(), timeout: '15s' };

  // ── Health ─────────────────────────────────────────────────────────────────────
  group('health', () => {
    const start = Date.now();
    const res = http.get(`${BASE_URL}/health`, params);
    responseDuration.add(Date.now() - start);
    requestCounter.add(1);

    const ok = check(res, {
      'health 200': (r) => r.status === 200,
      'health not 502/503': (r) => r.status !== 502 && r.status !== 503,
    });
    failoverErrorRate.add(!ok);
    if (res.status === 401) vuState.token = null;

    // Ghi chú lỗi để thấy khi nào failover xảy ra
    if (res.status >= 500) {
      console.warn(`[FAILOVER] ERROR ${res.status} tại elapsed ~${Math.round(scenario.progress * 360)}s — đây có thể là failover moment`);
    }
  });

  sleep(Math.random() * 0.5 + 0.3);

  // ── Products ───────────────────────────────────────────────────────────────────
  group('products', () => {
    const page = Math.floor(Math.random() * 3) + 1;
    const start = Date.now();
    const res = http.get(
      `${BASE_URL}/api/Products?page=${page}&pageSize=20`,
      params
    );
    responseDuration.add(Date.now() - start);
    requestCounter.add(1);

    const ok = check(res, { 'products 200': (r) => r.status === 200 });
    failoverErrorRate.add(!ok);
    if (res.status === 401) vuState.token = null;
  });

  sleep(Math.random() * 1 + 0.5);

  // ── Categories ─────────────────────────────────────────────────────────────────
  group('categories', () => {
    const start = Date.now();
    const res = http.get(`${BASE_URL}/api/Categories`, params);
    responseDuration.add(Date.now() - start);
    requestCounter.add(1);

    const ok = check(res, { 'categories 200': (r) => r.status === 200 });
    failoverErrorRate.add(!ok);
    if (res.status === 401) vuState.token = null;
  });

  sleep(Math.random() * 1.5 + 1);
}
