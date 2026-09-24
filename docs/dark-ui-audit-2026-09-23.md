# Dark UI differential audit — 2026-09-23

## Scope and baseline

Reviewed the dark UI changes since `3631155`, including the two committed scene/asset changes from the later local checkout,
its uncommitted page changes, and this checkout's earlier uncommitted experiment. The product/API/DB implementation was
left intact. The pre-redesign release ledger records 131 passing gates; the dark reference gates remain open until the
remaining pages are finished and visually checked.

## Findings and action

| Severity | Finding | Evidence | Action |
|---|---|---|---|
| High | First-time reporters could be sent to a receipt that displayed the no-membership state. | `test_geolocation_denied_still_allows_landmark_report_without_land_assertion` failed after submission; `submit_report` creates membership while `/me` was cached for 15 seconds. | Refresh `/me` on the `server_received` transition before navigating. The same browser test passed. |
| High | Scene and map line animations used a one-unit CSS dash on paths hundreds of units long, leaving the home route invisible. | A settled 1440×900 browser capture showed only the amber origin; the main path measured 1,130 units while its computed dash was 1 px. | Set dash lengths from `getTotalLength()` for scene, network, and list-map paths. A new browser test failed before the fix and passed afterward. |
| Medium | The PDF content verification test could not import `pypdf` in a fresh checkout. | The test imports it, the local virtual environment lacked it, and `requirements.lock` omitted it. | Pin `pypdf==6.10.2`; the affected test group passed 21/21. Test-only dependency; no browser download cost. |

The only new server route serves two fixed MapLibre worker filenames from its installed package. The filename allowlist
prevents client-selected path traversal. No authorization or scientific calculation was changed by this UI pass.

## Open audit items

- The later checkout still had ten page groups in older markup under the new tokens; they need visual and interaction review.
- WebGL water currently keeps a requestAnimationFrame callback scheduled when its scene is hidden, although it clears the
  canvas and reports inactive. Check true pause/resume behavior against the handoff's offscreen power budget.
- Static example illustrations and loading linework also use one-unit CSS dashes. Their visible linework and reduced-motion
  states need the same browser-level check before declaring motion coverage complete.
- Desktop and mobile captures have been inspected for the home route. The other reference pages have not yet completed the
  full 34-page visual comparison, so exact visual parity is not claimed.
