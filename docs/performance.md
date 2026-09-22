# Performance (J01, J03)

Measured by `tests/e2e/test_performance.py` in headless Chromium (Playwright) against `next start` :3000 and the API :8000 on a local Windows 11 laptop, 2026-09-22.

Setup: `.venv/Scripts/python.exe scripts/seed_load.py` (10,000 synthetic cases, 600 with a located report, in a separate example workspace), then

```
.venv/Scripts/python.exe -m pytest tests/e2e/test_performance.py -q -p no:cacheprovider -s
```

## Profiles

| Profile | Viewport | Network | CPU |
|---|---|---|---|
| Desktop | 1440x900 | unthrottled (loopback) | unthrottled |
| Mobile | 390x844 | CDP: 150 ms latency, 1.6 Mbit/s down, 750 kbit/s up | 4x slowdown |

## Public landing (J01)

Budgets: LCP <= 2.5 s, CLS <= 0.1, initial JavaScript <= 250 KB gzip (the landing page's own `script[src]` files; later route prefetches are excluded).

| Run | Desktop LCP | Desktop CLS | Mobile LCP | Mobile CLS | Initial JS (gzip) |
|---|---|---|---|---|---|
| 1 | 396 ms | 0.044 | 2372 ms | 0.048 | 148 KB |
| 2 | 396 ms | 0.044 | 2384 ms | 0.048 | 148 KB |
| 3 | 116 ms | 0.047 | 2352 ms | 0.048 | 148 KB |

The mobile LCP element is the hero image. What got it under budget:
- A 480x720 WebP at quality 50 (79 KB) replaced the 3.4 MB PNG (the PNG remains the source file only).
- A `preload` with `fetchPriority: "high"` in `app/page.tsx` so the image loads before the seven font files.
- `OfflineStatus` (Dexie) now loads only on report and workspace routes, not the root layout.

Remaining risk: mobile LCP has about 120 ms of headroom. The seven self-hosted font weights compete for bandwidth, and dropping weights is the next lever.

## Large directory and map (J03)

- Directory API p95 over 30 mixed requests (cursor pages and title searches) on 10,000 cases: 86 ms, against a 500 ms budget. The `case_read` RLS policy uses set-wise membership checks (migration `202609210014_fast_case_policy.sql`); the previous per-row check took 1.7 s per search.
- Directory UI loads 25 rows per page ("Show more"), never the whole table.
- Map with 600 located investigations: ready in under 10 s (the test asserts this). Features are drawn as WebGL layers, and the map container holds fewer than 200 DOM nodes.
