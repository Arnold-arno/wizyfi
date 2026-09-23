# Uploaded images — what they were and where they now live

You uploaded 11 images. Here's an honest breakdown of what each one
actually is, what I did with it, and why — rather than treating them all
the same way.

## 1. Brand icon/logo — extracted a real favicon set

`1789972876595...jpg` (icon + wordmark on dark navy) was the best
candidate for actual functional icon use: clean, square-ish, high
contrast. I cropped just the icon mark (excluding the wordmark text,
which doesn't survive small sizes) and generated a full favicon/app-icon
set:

```
frontend/public/brand/
  favicon.ico          — multi-resolution (16/32/48/64px)
  favicon-16x16.png
  favicon-32x32.png
  favicon-48x48.png
  apple-touch-icon.png — 180px, for iOS home-screen bookmarks
  icon-192.png         — PWA manifest icon
  icon-512.png         — PWA manifest icon
  logo-icon-lockup.jpg — the original full lockup (icon + "Wizyfi Bridge" wordmark)
  logo-with-tagline.jpg — full lockup + "Bridging Networks..." tagline
```

**Honest caveat**: at 32px and up these read clearly. At 16px (the
smallest real browser-tab size) the mark is legible but a bit muddy —
that's an inherent limitation of cropping an intricate 3D-rendered
logo down that far, not something more careful cropping fixes. If a
crisp 16px favicon matters to you, a simplified flat-vector version of
just the "W" bridge shape (no gradients/bevels) would hold up much
better at that size — worth commissioning separately if it matters.

**To wire in**: since this delivery doesn't include your actual
`index.html` (see the top-level `DELIVERY_NOTES.md` for why), add these
to yours:
```html
<link rel="icon" type="image/x-icon" href="/brand/favicon.ico" />
<link rel="icon" type="image/png" sizes="32x32" href="/brand/favicon-32x32.png" />
<link rel="icon" type="image/png" sizes="16x16" href="/brand/favicon-16x16.png" />
<link rel="apple-touch-icon" sizes="180x180" href="/brand/apple-touch-icon.png" />
```
And reference `icon-192.png`/`icon-512.png` from your PWA manifest if you
have one.

## 2. Storefront signage mockup — reference only, not a functional asset

`1789972893501...jpg` is an AI-generated mockup of the logo on a
building's signage. This is marketing/pitch material, not something a
web app uses. Saved to `marketing-assets/storefront-signage-mockup.jpg`
for safekeeping, not wired into anything.

## 3. Full lockup with tagline

`1789972909161...jpg` — same icon as #1, but with the full tagline
("Bridging Networks. Connecting People. Empowering Communities.")
underneath. Genuinely useful for an About page, email footer, or investor
material. Saved alongside the icon assets as `logo-with-tagline.jpg`.

## 4 & 5. Multi-context marketing collages — reference only

`1789972923312...jpg` and `1789972945853...jpg` are both composite mockup
collages (laptop/phone/tablet/billboard/router-hardware shots showing the
brand in various settings). These are pitch-deck or landing-page hero
material, not extractable functional assets — there's no single clean
image in either one meant to be used standalone. Saved to
`marketing-assets/` for safekeeping.

## 6. The actual Dashboard UI design — a real, valuable reference

`1789972965877...jpg` is different from the rest: it's not a mockup of
the product in a lifestyle photo, it's an actual flat UI design for the
Dashboard screen — sidebar nav (Dashboard, Networks, Devices, Clients,
Sessions, Analytics, Alerts, Logs, Reports, Settings), a KPI row (Total
Networks, Active Clients, Active Sessions, Total Data Usage), a network
activity chart, a clients-by-status donut, top-networks-by-usage bars,
a world map with live status, an alerts panel, and a settings panel.

This matches doc04 §4's Dashboard spec closely and is considerably more
detailed than the text spec alone. Saved to
`frontend/design-reference/dashboard-ui-reference.png` — when the actual
`DashboardPage` gets built (not done yet in this delivery), build against
this image directly rather than only the text spec.

## 7, 8, 10, 11. The Visual Diagram Atlas — these were missing before now

These four are the actual rendered diagrams that `13_Visual_Diagram_Atlas`
and other docs only had text placeholders for (e.g. "*Figure 1 — Product
and experience architecture.*" with no image). Copied into a new
`06_Visual_Diagrams/` folder, named to match `MANIFEST.txt` where an
exact entry already existed:

| Uploaded image | Saved as |
|---|---|
| Product & Experience Architecture | `01_product_experience_architecture.png` |
| Hard Logout Safety & Execution Flow | `02_hard_logout_safety_execution_flow.png` |
| Complete Experience & Navigation Map | `01_complete_navigation_map.png` |
| Logical System Architecture | `01_logical_system_architecture.png` |

This closes a real gap: doc00's Round-1 completion gate explicitly
requires "Canonical diagrams are supplied as actual visual assets, not
text-only pseudo-diagrams" — until now, they weren't.

**The navigation map diagram is also functionally useful, not just
documentation**: it lists the actual canonical routes (`/app/hard-logout/schedule`,
`/app/hard-logout/history`, `/app/hard-logout/:eventId`, the full
`/portal/*` flow, etc.), which I used to correct an assumption in
`frontend/INTEGRATION_NOTES.md` about the Hard Logout route structure.

## 9. A new diagram — fills a previously-empty figure placeholder

`1789974617825...jpg` ("Provider Operational Mental Model") doesn't
match any existing `MANIFEST.txt` entry, but it's exactly the diagram
doc01 PRD's §10 refers to ("*Figure 2 — Provider operational mental
model.*") — which also never had an actual image before. Saved as
`01_provider_operational_mental_model.png`, a genuine net-new addition
to the atlas rather than a duplicate of something already covered.

## What I didn't do

I didn't regenerate any of the `.docx` specification files to actually
embed these images — that's a separate, sizeable task (opening each
`.docx`, finding the right figure placeholder, inserting the image,
resizing correctly) and wasn't part of what was asked this round. The
images are organized and ready for that if/when you want it done.
