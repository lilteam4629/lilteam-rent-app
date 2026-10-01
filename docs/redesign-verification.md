# Redesign verification

Scope: rent.lilteam.site only, its public, member and rental administration interfaces. Main/tenant store templates are used read-only for screenshot capture.

Covered routes: /, /login, /register, /admin/login, /my-shops, /start, /wallet, /sales, /admin, /admin/plans, /admin/rentals, /admin/topups, /admin/users, /admin/payment. Financial request/detail routes retain existing protection and algorithms; not submitted against production.

Browser fixture uses an isolated temporary datastore and localhost internal API stub. Desktop 1440px and mobile 390px cover actual server rendering, gallery switching, roving keyboard tabs, image dialog, Escape, theme selection, responsive navigation, setup price updates, document overflow, browser errors and broken image checks. Backend preview records are test data.

The existing npm test suite covers security, session isolation, safe redirects, wallet concurrent/idempotent writes, private receipts and MIME validation, EJS templates and payment-provider outage handling. Manual Impeccable detection found one initial missing dialog image source; corrected with a real gallery asset.

Intentional implementation boundary: financial processing and provision API are preserved. New system work is the member/admin navigation and dashboard, setup summary, shop status/renewal interface and screenshot presentation. No live customer payments, renewals, feature deployments or account mutations were used to test the redesign.

2026-10-01 motion refinement: inspected the live main shop in light and dark modes; matched accents #4f70a4 and #9aa1ac with black/white neutral surfaces across the shared theme. Added an explicitly illustrative inventory/shop/order animation. Browser verification additionally executes automatic stage progression, manual step selection, pause stability, prefers-reduced-motion, matching theme tokens, and desktop/mobile layout. The previous uncropped-image and non-overlapping hero regressions remain covered.

Owner access: owner credentials entered at either /login or /admin/login now land on /admin. An authenticated owner sees “จัดการเว็บเช่า” in the homepage header and member navigation; the public footer links to the dedicated owner login. Already authenticated owners skip the admin login form. Browser fixture verifies both owner login flows, visible owner links, all six administration routes, and denial of customer access to the owner dashboard. Production login-page discovery is checked read-only; production owner credentials were not used.
