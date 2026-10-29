# Round 19 — two small edits to files not replaced wholesale

1. `backend/config/settings/base.py` — record sign-ins so "Last active" has data.
   Add `"UPDATE_LAST_LOGIN": True,` inside the existing `SIMPLE_JWT = { ... }` dict.
   (simplejwt does NOT update `User.last_login` by default; without this every agent shows "Never".)

2. `backend/apps/platform_admin/tests.py` — the strict allow-list test now has two more safe keys.
   In `test_list_shape_is_the_strict_allow_list_only` replace the expected set with:
       {"id", "name", "status", "placeCount", "maxPlaces", "planName", "lastActiveAt", "createdAt"}
