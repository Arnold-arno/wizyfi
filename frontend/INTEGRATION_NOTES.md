# Integration notes — Access Plans, Vouchers, Super Admin entry point

These three items touch **existing** files that weren't part of this
delivery (I don't have your live repo in this session — see the top-level
`DELIVERY_NOTES.md` for why). Apply these as edits to the real files rather
than creating new ones.

**Updated**: the uploaded "Complete Experience & Navigation Map" diagram
(now saved at `06_Visual_Diagrams/01_complete_navigation_map.png`) gives
the actual canonical route structure for this product, which corrects a
couple of assumptions below.

## 1. Router — add the new routes

In `src/app/router.tsx` (or wherever your route tree is defined), add,
alongside the other `/app/*` provider routes:

```tsx
import { AccessPlansPage } from "../features/access/pages/AccessPlansPage";
import { PlanEditorPage } from "../features/access/pages/PlanEditorPage";
import { VouchersPage } from "../features/vouchers/pages/VouchersPage";

// ...inside the provider-shell route's children:
{ path: "access-plans", element: <AccessPlansPage /> },
{ path: "access-plans/new", element: <PlanEditorPage /> },
{ path: "access-plans/:id", element: <PlanEditorPage /> },
{ path: "vouchers", element: <VouchersPage /> },
```

The canonical route map also confirms Hard Logout's own route family is
`/app/hard-logout`, `/app/hard-logout/schedule`, `/app/hard-logout/history`,
`/app/hard-logout/:eventId` — worth checking your router matches this
exactly, since the backend's `HardLogoutEventViewSet` (apps.access) maps
cleanly onto that shape (list → history, create → schedule, retrieve →
:eventId).

## 2. Sidebar navigation — add the Vouchers entry

Find the nav config array in `src/components/layout/Sidebar.tsx` (per
doc02 §4, persistent nav must expose all first-class modules — Access
Plans should already be listed; Vouchers was the missing one). Add:

```tsx
{
  label: "Vouchers",
  to: "/app/vouchers",
  icon: TicketIcon, // pick whatever icon set the sidebar already uses
  permission: "vouchers:view",
}
```

Place it directly after the Access Plans entry, matching the IA order in
doc02 §3 (`Access Plans` → `Vouchers` → `Network Cycles`).

## 3. Profile menu — Super Admin portal entry point

**Correction from the first version of this note**: there is no
`platform_admin:access` permission code anywhere in the actual backend
(apps.platform_admin). Platform-admin access is a completely separate
privilege track (`IsPlatformStaff`, checked against a `PlatformStaff`
row) — orthogonal to organization roles/permission codes entirely. The
real, current signal is a field on `/api/v1/auth/me/`:

```tsx
{me.isPlatformStaff && (
  <DropdownMenuItem onSelect={() => navigate("/admin")}>
    Super Admin portal
  </DropdownMenuItem>
)}
```

Two things worth flagging explicitly, per the security threat model (doc11):

- This link is a **UX convenience only**. It must not be the thing that
  decides whether someone can reach `/admin` — your existing `AdminRoute`
  guard (per Expectations_and_workflow) plus the backend's `IsPlatformStaff`
  permission class on every `platform_admin` endpoint remain the actual
  authorization boundary.
- Don't infer platform-admin status from organization role — a user can
  be an OWNER of every organization they belong to and still have zero
  platform access, and vice versa. Check `isPlatformStaff` specifically,
  not a proxy for it.

## 4. Permission codes to confirm exist on the backend

The pages in this delivery gate on:
- `access_plans:create`, `access_plans:edit`
- `vouchers:view`, `vouchers:issue`, `vouchers:revoke`

(Super Admin gating uses `isPlatformStaff` from `/auth/me/`, not a
permission code — see §3 above.)

If any of the codes above don't already exist in the org/membership
permission matrix, add them there before wiring the frontend checks —
the frontend gates listed above only hide/show controls; the DRF
permission classes on the corresponding endpoints are what actually
enforce them.
