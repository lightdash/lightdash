# Mobile responsiveness plan

Initial planning estimate, 2026-09-14. The subsequent request expanded this to responsive feature parity, excluding chart and dashboard editing. Implementation and browser audit are underway; see [the live audit](mobile-responsive-audit.md) for verified behavior and remaining work. The source constraints below describe the baseline before implementation.

For the implemented desktop → mobile component replacements and their exact breakpoints, see [the responsive pattern map](mobile-responsive-patterns.md).

Recommended first release: sign in, browse spaces/content, view dashboards/charts, apply filters/parameters, and use Ask AI. Budget 3–5 engineer-weeks for an engineer familiar with the frontend, with design/review support. Broad coverage including authoring and administration: roughly 8–12+ engineer-weeks total; re-estimate after an interaction prototype.

## Existing foundations and constraints

- `packages/frontend/package.json` pins Mantine **9.6.0**; AGENTS.md's v8 reference is stale. No Mantine upgrade needed for this work.
- `src/App.tsx` chooses separate mobile/desktop route trees using `src/utils/isMobile.ts`: `window.innerWidth < 768`, evaluated once. Resize/orientation changes cannot switch route trees without reloading.
- `src/MobileRoutes.tsx` includes mobile home/spaces/content lists, explicitly unsupported routes, and redirects saved content to minimal viewers. `components/Mobile/RedirectToResource.tsx` rebuilds URLs without the incoming query string; URL/filter/tab preservation needs explicit coverage during consolidation.
- `components/Mobile/MobileNavBar.tsx` already uses Burger + Drawer. Ask AI's `AiAgentPageLayout.tsx` already swaps its sidebar and preview into drawers.
- `features/dashboardTabs/gridUtils.ts` already supports vertical stacking, enabled by `pages/MinimalDashboard.tsx`. Normal dashboard and embed call sites do not enable that option. Existing grid breakpoints: 1200/996/768, columns: 36/30/18. Mantine CSS breakpoints: 1200/992/768. These serve different layout systems; align deliberately, not by blindly replacing grid constants.
- `components/common/Page/Page.module.css` imposes content minimum widths from `Page/constants.ts`: 900px normally, 600px with a sidebar. Fixing only individual pages will leave shared overflow constraints.
- Minimal dashboards also serve export flows. Shared changes must preserve PDF/image rendering, embeds, tabs, saved desktop coordinates, and filter semantics.

Paths above are relative to `packages/frontend/` where prefixed with `src/`, otherwise to `packages/frontend/src/`.

## Proposed delivery slices

| Slice | Work and completion condition | Estimate |
| --- | --- | --- |
| 1. Audit + representative journey | Exercise login → space → dashboard → filter → chart detail at phone/tablet widths. Inventory OSS/EE routes, unsupported actions, chart types, tables, overlays, and export dependencies. Capture baseline screenshots. | 1–2 days |
| 2. Navigation + browse | Make the shared page shell shrink safely; adapt header/navigation and content lists. Consolidate supported browse routes incrementally, preserving guards, URLs, query strings, and history. Resize without resetting state. | 3–5 days |
| 3. Dashboard consumption | Deterministic mobile tile order within each tab; useful heights by tile type; compact header; filters/parameters sheet; accessible chart detail and table scrolling. Same dashboard opens from shared links and survives rotation. | 5–8 days |
| 4. Remaining viewer flows | Saved charts, search, content actions, and Ask AI integration. Reuse existing mobile drawers. Make essential actions available on touch. | 3–5 days |
| 5. Release hardening | Safari/Chrome touch checks, keyboard/safe areas, accessibility, desktop/embed/export regressions, targeted performance checks. | 3–5 days |

Total: 15–25 working days. Each slice should deliver an end-to-end user journey; extract shared components when a second use validates the abstraction.

Afterward: prototype Explorer as Fields / Filters / Chart / Results steps or tabs, with shared query state and a reachable Run action. Treat SQL editing, dashboard drag/resize, visualization configuration, and administrative forms as separate workstreams. Do not promise full authoring parity from CSS changes alone.

## Mantine techniques

- **Responsive layout props:** `p={{ base: 'sm', sm: 'lg' }}`, `Flex` direction, and `SimpleGrid` columns for browse pages. Use CSS modules for repeated tile/row styling. Use `hiddenFrom`/`visibleFrom` for small presentation changes, and `useMediaQuery` when behavior changes. Keep one mounted chart/query tree to avoid duplicate work. [Responsive styles](https://mantine.dev/styles/responsive/)
- **Navigation:** keep the existing Burger/Drawer initially. Consider `AppShell` when consolidating the shell: it supports breakpoint-aware navbar collapse and section sizing. A wholesale shell migration is not a prerequisite. [AppShell](https://mantine.dev/core/app-shell/)
- **Filters as a bottom sheet:** compose `Drawer position="bottom"` with the existing filter/parameter controls and active-filter summary. Preserve existing apply/reset/required-filter behavior and state across presentation changes. Handle nested combobox portals, focus return, and on-screen keyboard. [Drawer](https://mantine.dev/core/drawer/)
- **Container-responsive cards:** `SimpleGrid type="container" cols={{ base: 1, '40em': 2 }}` adapts browse/card collections to their actual available width—useful inside embeds and resizable panels. Keep the dashboard's persisted grid/editor semantics separate. [SimpleGrid](https://mantine.dev/core/simple-grid/)
- **Chart focus mode:** tap an explicit expand action to open a full-screen `Modal`; retain full labels, legend controls, and underlying-data access there. Dense tables get local horizontal scrolling. [Modal](https://mantine.dev/core/modal/)

Use theme/PostCSS breakpoint values consistently. Prefer available-container width for reusable embedded content. For phone dashboards, derive display positions from stored coordinates with stable ordering (tab, y, x, deterministic tie-break); never write derived mobile positions back to the saved desktop layout. Validate grid minimum-width constraints and heading/markdown/table heights before simply enabling one-column mode everywhere.

## Acceptance checks

- Viewports: 360, 390, 430, 768, 1024, 1440px; boundary checks around 768 and 992px. Rotate and resize in-session.
- No page-level horizontal overflow on supported flows; tables and code may scroll locally. Charts resize after drawer/navigation/layout changes.
- Shared URLs retain filters, parameters, active tab, and auth return location. Browser back behaves predictably.
- Loading, empty, error, long-title, many-filter, multi-tab, required-filter, and wide-table cases remain usable.
- Essential controls have visible touch access; target 44px hit areas. No hover-only interactions. Drawers/modals manage focus and keyboard dismissal; mobile keyboard and safe areas do not obscure actions.
- Scrolling a dashboard does not drag tiles or accidentally activate chart gestures. Opening detail does not issue duplicate queries unnecessarily.
- Desktop layout saves, embedded narrow-container rendering, and image/PDF exports retain existing behavior.
- Add pure-function tests for mobile tile projection and behavioral tests for route-state preservation and filter application. Use `agent-browser` for viewport/UI verification (load `agent-browser skills get core --full` first); supplement with real iOS Safari and Android Chrome checks.

Roll out migrated routes incrementally. If gating is useful, use the existing shared feature-flag system per `docs/feature-flags.md`. Retire each duplicate mobile page only after its responsive replacement passes these checks.
