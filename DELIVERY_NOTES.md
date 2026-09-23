# Wizyfi Bridge — Delivery Notes (Access Plans + Vouchers package)

## What this is

A recreation of the frontend files that `Expectations_and_workflow` flagged
as outstanding: `AccessPlansPage`, `VouchersPage`, and their supporting
components/hooks/types/api clients, built to the contracts in docs 02, 04,
05, 08 and 09.

## Important honesty note on provenance

This session's container starts empty — there is no persistent code storage
between conversations, so I could not pull your actual existing repository
to edit in place. Everything in this package was **rebuilt from the
specification documents and the `Expectations_and_workflow` summary**, not
copied from a prior working tree. Before merging:

1. Diff every file here against your real repo. Where a file already
   exists (e.g. `src/lib/api/client.ts`, `src/hooks/usePermissions.ts`),
   **keep your real implementation** and only merge in the specific calls
   this package needs — see the "⚠️ RECONCILIATION NOTE" comment at the top
   of each such file.
2. Confirm the `AccessPlan` / `Voucher` field names here (`durationMinutes`,
   `maskedCode`, etc.) match your actual DRF serializer output. I inferred
   field names from doc 08's entity table; your real serializers may use
   slightly different keys.
3. Run `tsc --noEmit` and your existing test suite once merged — this
   package has not been run against your real build.

## What's included

```
frontend/src/types/accessPlan.ts
frontend/src/types/voucher.ts
frontend/src/lib/api/client.ts                 (reference — reconcile)
frontend/src/lib/api/accessPlansApi.ts
frontend/src/lib/api/vouchersApi.ts
frontend/src/hooks/usePermissions.ts           (reference — reconcile)
frontend/src/components/ui/EmptyState.tsx
frontend/src/components/ui/ErrorState.tsx
frontend/src/components/ui/TableSkeleton.tsx
frontend/src/features/access/hooks/usePlans.ts
frontend/src/features/access/hooks/usePlan.ts
frontend/src/features/access/components/PlanStatusBadge.tsx
frontend/src/features/access/components/PlanTable.tsx
frontend/src/features/access/components/PlanEditorForm.tsx
frontend/src/features/access/components/PlanPreview.tsx
frontend/src/features/access/pages/AccessPlansPage.tsx
frontend/src/features/access/pages/PlanEditorPage.tsx
frontend/src/features/vouchers/hooks/useVouchers.ts
frontend/src/features/vouchers/hooks/useVoucherBatch.ts
frontend/src/features/vouchers/components/VoucherStatusBadge.tsx
frontend/src/features/vouchers/components/VoucherTable.tsx
frontend/src/features/vouchers/components/BulkVoucherWizard.tsx
frontend/src/features/vouchers/components/VoucherDetailDrawer.tsx
frontend/src/features/vouchers/pages/VouchersPage.tsx
frontend/INTEGRATION_NOTES.md                  (router/sidebar/profile-menu edits)
```

## What's still outstanding (per Expectations_and_workflow)

| Item | Status |
|---|---|
| `AccessPlansPage` | ✅ Delivered this round |
| `VouchersPage` | ✅ Delivered this round |
| Sidebar nav update for Vouchers | 📝 Instructions in `INTEGRATION_NOTES.md` (edit, not a new file) |
| Super Admin entry point in profile menu | 📝 Instructions in `INTEGRATION_NOTES.md` (edit, not a new file) |
| Backend endpoint verification | ⏳ Not yet done — see checklist below |
| Final full re-verification + zip packaging | ⏳ Blocked on the above being merged into your real repo |

Items 3 and 4 are edits to files I don't have, so I've written them as
precise patch instructions rather than guessing at your file's exact
current contents and risking a bad overwrite.

## Backend verification checklist (next round)

Only act on these if inspection of your real backend shows a gap —
`Expectations_and_workflow` says `AccessPlan`, `Voucher`, `NetworkCycle`,
`Session`, `HardLogoutEvent` models already exist:

- [ ] `apps/access/serializers.py` — `AccessPlanSerializer`, `VoucherSerializer`,
      `VoucherBatchCreateSerializer` match the field names used above
- [ ] `apps/access/views.py` — endpoints matching doc09's inventory:
      `GET/POST /access-plans`, `PATCH /access-plans/{id}`,
      `POST /vouchers/batches`, `GET /vouchers`
- [ ] Voucher batch-create endpoint honors an `Idempotency-Key` header
      (doc09 requirement for retriable commands)
- [ ] Plan-limit / permission checks: `access_plans:create`,
      `access_plans:edit`, `vouchers:issue`, `vouchers:revoke` codes exist
      in the permission matrix

## Next round

Tell me which of these to do next:
1. Build out the backend verification/gap-fill for the checklist above (needs your real repo)
2. Wire the router/sidebar/profile-menu edits directly if you paste in those three existing files
3. Move on to final re-verification + zip packaging once 1–2 are merged
