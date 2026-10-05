# Wizyfi Bridge — Round 11: Frontend (Dashboard, Sales, Transactions, Super Admin, shell)

Drop this tree over your repo root (paths mirror `wizyfi-bridge/`). Files are
marked NEW or CHANGED. Nothing else in your repo is overwritten.

## Verification — what was and wasn't run
| Check | Result |
|---|---|
| `tsc --noEmit`, strict mode, whole frontend | ✅ clean |
| `vite build` with Tailwind + the theme CSS import | ✅ builds |
| gunicorn serving `dist/` (SPA fallback, cache headers, 404 on missing asset, `--reload` on rebuild) | ✅ tested |
| Backend `py_compile` on all new/changed Python | ✅ |
| **Backend pytest (new tests below)** | ⚠️ **Not run.** Your backend isn't on disk in this session (only pasted into context), so I could not execute the suite as in earlier rounds. Run `pytest` before merging. |
| Frontend in a real browser against a live API | ⚠️ Not run. |

Typecheck used reproductions of your `EmptyState / ErrorState / TableSkeleton`,
`types/accessPlan.ts` and `usePlans` (copied from the upload) and stubs for
`AccessPlansPage / PlanEditorPage / VouchersPage`, which I didn't touch.

## Backend changes (apply first)
NEW `apps/dashboard/` — `GET /api/v1/dashboard/` (org-scoped aggregates; sales block is `null` without `sales:view`).
CHANGED `config/urls.py` — adds `path("api/v1/", include("apps.dashboard.urls"))` (full file supplied).
**Manual edit, `config/settings/base.py`** — add `"apps.dashboard",` to `INSTALLED_APPS` (after `"apps.commercial"`).
CHANGED `apps/organizations/serializers.py` — memberships now include `permissions` + `revokedPermissions`.
CHANGED `apps/commercial/serializers.py` — `SaleSerializer` adds `placeName`, `accessPlanName` (customer deliberately not expanded).
**Manual edit, `apps/platform_admin/views.py`** — in `PlanViewSet` add:
```python
from django.db.models import ProtectedError          # top of file

    def perform_destroy(self, instance):              # inside PlanViewSet
        try:
            instance.delete()
        except ProtectedError:
            raise ConflictError(
                "This plan has subscribed organizations. Archive it instead of deleting it."
            )
```
NEW tests: `apps/dashboard/tests.py`, `apps/organizations/test_membership_permissions.py`,
`apps/commercial/test_sale_names.py`, `apps/platform_admin/test_plan_delete.py`.

## Problems I found in the earlier delivery (and fixed)
1. **No permission list reached the frontend.** `/organizations/` returned only the role, and the Round-10 `usePermissions` read a `window` global, so every gated button (Create plan, Generate vouchers…) would have been hidden for everyone. Fixed server-side (above) + new `usePermissions`.
2. **Client never sent `X-Organization-Id`.** `OrganizationScopedMixin` needs it, so every org-scoped call returned 403. Fixed in `client.ts`.
3. **No token refresh.** Access tokens live 15 min; the client now refreshes once (single-flight — refresh tokens are rotated/blacklisted, so parallel refreshes would invalidate each other) and retries.
4. **Runtime crash in Access Plans.** DRF sends `price` as a string; `PlanTable`/`PlanPreview` call `price.toFixed(2)`. Normalised in `accessPlansApi.ts`.
5. **Theme tokens were never imported.** `index.css` didn't load `theme-foundation.css`, so every `var(--surface)` was undefined. Fixed.
6. **`app.tsx` vs `import "./App"`** fails on case-sensitive systems. Now `App.tsx` — **delete `src/app.tsx`**.
7. `@tanstack/react-query` was missing from `package.json` although the hooks use it.
8. Deleting a platform plan with subscribers would have returned an unhandled 500 (PROTECT FK). Now a 409.
9. **Duplicate tree**: your upload contains both `frontend/src/…` and `frontend/src/src/…` with identical files. `src/src/` looks accidental — remove it after confirming.

## Decisions worth knowing
- **One aggregate endpoint** for the dashboard instead of five browser round trips; every figure computed server-side. 30 s polling + visible "Updated hh:mm"; stale data after a failed refresh is flagged.
- **Revenue is never summed across currencies.** Dashboard uses the top currency of the 7-day window and says when others exist. "Today" is the **UTC** day (Organization has no timezone).
- **No fake telemetry:** the reference's world map and "data usage" panels are not built — no backend data exists for them.
- **Charts are dependency-free SVG** with text legends / hidden data tables (not colour-only).
- **Cache is cleared on org switch / sign-out** because existing hooks' query keys don't include the org id.
- **Super Admin entry** shows from `/auth/me/ → isPlatformStaff` only; `/admin` is still guarded by `AdminRoute` (UX) and `IsPlatformStaff` (authority). Suspension requires typing the agent's name.
- **Tokens are in localStorage** (matches the Bearer-JWT backend). Any XSS can read them; cookie auth would need a backend change. Your call.

## Gunicorn for the frontend — read this
gunicorn can't run Node/Vite; it serves the **built** `dist/` via WhiteNoise (`frontend/serve/`).
```
pip install -r serve/requirements.txt
npm run build
npm run serve          # production-style, binds 0.0.0.0:8080
npm run serve:dev      # auto-reload (Linux/macOS shell syntax)
```
`--reload` restarts workers when serving code changes **or** a new `vite build` rewrites `dist/index.html`. For day-to-day UI work keep using `npm run dev` (HMR); gunicorn reload can't do hot-module replacement. If you deploy to **Cloudflare Pages**, you don't need gunicorn at all — it's static hosting; set `VITE_API_BASE_URL` to the HTTPS API and add a `_redirects` rule `/* /index.html 200`.

## Not built / known gaps
- **Super Admin spec items without backend support** (not drawn, not faked): revenue & outstanding fees, agent/connection growth charts, platform availability, expiring accounts, last login. Each needs models/endpoints first.
- `/platform-admin/agents/` is an unpaginated array (client-side search). Paginate before thousands of agents.
- `SalesSummary.totalRevenue` sums across currencies (backend); the UI labels it accordingly.
- `POST /sales/` has no idempotency key (doc09 asks for one on retriable commands); the dialog blocks double-submit but a network retry could duplicate a sale. Refund is gated on `sales:create` — consider its own `sales:refund` code.
- Sidebar entries for Places, Devices, Live connections, Users, Network cycles, Hard logout route to `ModulePlaceholder` here — **replace with your real pages** (Expectations says Places etc. exist). Add-Place route is assumed `/app/places/new`.
- `Login`/`Onboarding` are minimal stand-ins; keep yours if present. Registration UI isn't included.
- Still open from before: realtime gateway, real Celery dispatch for Hard Logout, diagrams embedded in the `.docx` specs, Hard Logout UI.
- Tailwind: `package.json` pins v3 (`@tailwind` directives) while your notes say v4. New code works on both; existing `border-[var(--danger)]/30` in `ErrorState` only gets its opacity on v4.

## File index
NEW backend: `apps/dashboard/*`, 3 test files listed above.
CHANGED backend: `config/urls.py`, `apps/organizations/serializers.py`, `apps/commercial/serializers.py` (+2 manual edits).
CHANGED frontend: `package.json`, `src/index.css`, `src/main.tsx`, `src/lib/api/client.ts`, `src/lib/api/accessPlansApi.ts`, `src/hooks/usePermissions.ts`, `src/App.tsx` (replaces `app.tsx`).
NEW frontend: `src/state/`, `src/lib/{format,theme,queryClient}.ts`, `src/lib/api/{session,authApi,dashboardApi,salesApi,adminApi}.ts`, `src/types/{common,session,dashboard,sales,admin}.ts`, `src/components/{ui,layout,auth,charts}/*`, `src/features/{dashboard,sales,transactions,admin,auth}/*`, `src/styles/theme-foundation.css`, `serve/*`, `.env.example`.
