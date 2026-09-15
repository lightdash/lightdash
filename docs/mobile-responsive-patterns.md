# Desktop → mobile patterns

Current implementation map, September 15. This describes component replacements and layout changes separately. Verification and remaining feature coverage live in [the audit](mobile-responsive-audit.md).

Phone-specific layouts and chart/dashboard authoring restrictions start strictly below **768px (`sm`)**. Tablets keep full content controls. Navigation collapses below **992px (`md`)** because the full navigation row needs more room; it stays expanded at 1024px. Container-based wrapping and dashboard grid projection remain independent of this viewport policy.

## Component replacements

| Desktop presentation | Compact presentation | Trigger | Implementation |
| --- | --- | --- | --- |
| Full navigation bar | Menu button → right Drawer | Below `md` / 992px | [MainNavBarContent](../packages/frontend/src/components/NavBar/MainNavBarContent.tsx) |
| Persistent page navigation sidebar | Labeled button → left Drawer, up to 24rem wide | Below `sm` / 768px | [Page](../packages/frontend/src/components/common/Page/Page.tsx) |
| AI agent settings sidebar | Agent settings button → left Drawer, up to 360px wide | Below `sm`; form remains mounted and drafts survive resizing | [ProjectAiAgentEditPage](../packages/frontend/src/ee/pages/AiAgents/ProjectAiAgentEditPage.tsx) |
| Page details sidebar | Full-width right Drawer | Below `sm`, when the caller provides a close handler | [Page](../packages/frontend/src/components/common/Page/Page.tsx) |
| Resizable saved-tree / metric chooser panels | Named buttons → left Drawers, up to 420px wide | Below `sm` | [CanvasSidebar](../packages/frontend/src/features/metricsCatalog/components/Canvas/CanvasSidebar.tsx) |
| Inline dashboard filter bar | Filters button → bottom Drawer, 85dvh high | Below `sm` | [DashboardFiltersBar](../packages/frontend/src/features/dashboardFilters/DashboardFiltersBar.tsx) |
| Content-type / admin-view segmented controls | Labeled Select | Below `sm` / 768px | [ContentTypeFilter](../packages/frontend/src/components/common/ResourceView/ContentTypeFilter.tsx), [AdminContentViewFilter](../packages/frontend/src/components/common/ResourceView/AdminContentViewFilter.tsx) |
| Scheduled-delivery section navigation | Section Select | Below `sm` | [SchedulerDeliveryNav](../packages/frontend/src/features/scheduler/components/SchedulerForm/layout/SchedulerDeliveryNav.tsx) |
| Metric date preset segmented control | Current-range button → date Popover | Below `sm` | [MetricExploreDatePicker](../packages/frontend/src/features/metricsCatalog/components/visualization/MetricExploreDatePicker.tsx) |

## Same component, different layout

| Desktop presentation | Compact presentation | Trigger / exception | Implementation |
| --- | --- | --- | --- |
| Shared form Modal | Fullscreen Modal with scrolling body and reachable actions | Below `sm`. `role="alertdialog"` confirmations remain dialogs. | [MantineModal](../packages/frontend/src/components/common/MantineModal/index.tsx) |
| Search Modal with results and preview beside each other | Fullscreen Modal; results or selected preview shown in one pane | Below `sm`; explicit back/close navigation | [Omnibar](../packages/frontend/src/features/omnibar/components/Omnibar.tsx) |
| App builder and preview beside each other | Build / Preview selector; one pane visible | Below `sm`; iframe and draft remain mounted | [AppGenerate](../packages/frontend/src/pages/AppGenerate.tsx), [styles](../packages/frontend/src/pages/AppGenerate.module.css) |
| Scheduled-delivery multi-column Modal | Fullscreen Modal; section Select and expandable preview | Below `sm` | [SchedulerModalCreateOrEdit](../packages/frontend/src/features/scheduler/components/SchedulerModalCreateOrEdit.tsx) |
| Two-calendar metric date Popover | One-calendar Popover, viewport-bounded with scrolling | Below `sm` | [MetricExploreDatePicker](../packages/frontend/src/features/metricsCatalog/components/visualization/MetricExploreDatePicker.tsx) |
| Shared facet filters | Same Popover, 44px choices, explicit close and accessible toggle state | Below `sm` or coarse pointer for target sizes; dropdown bounds apply at every size | [FilterFacet](../packages/frontend/src/components/common/FilterFacet/FilterFacet.tsx) |
| Category, description and icon Popovers | Same Popovers, bounded width/height, explicit close, larger controls | Compact/touch styles; they do not automatically become drawers | [Category form](../packages/frontend/src/features/metricsCatalog/components/MetricsCatalogCategoryForm.tsx), [description](../packages/frontend/src/features/metricsCatalog/components/MetricsCatalogColumnDescription.tsx) |
| Dashboard grid | One-column display projection with smaller charts | Viewer `xs` below 768px **container** width; `sm` also stacks where explicitly enabled. Saved desktop coordinates remain intact. | [Grid projection](../packages/frontend/src/features/dashboardTabs/gridUtils.ts), [container observer](../packages/frontend/src/features/dashboardTabs/ResponsiveGridLayout.tsx) |
| Dense tables / code | Local horizontal scrolling inside the available width | Intrinsic overflow; retain the data and column controls | Shared content tables and code surfaces; see audit for coverage |
| Hover-only owner email tooltip | Named owner button → details Popover with selectable email | All widths; this improves keyboard and touch access together | [MetricsCatalogColumnOwner](../packages/frontend/src/features/metricsCatalog/components/MetricsCatalogColumnOwner.tsx) |
| Compact emoji skin-tone fan | Wrapping row of 44px choices beneath search | Below `sm` or coarse pointer; desktop keeps the library fan | [Icon picker styles](../packages/frontend/src/features/metricsCatalog/components/MetricsCatalogColumnName.module.css) |
| Hover-only actions | Visible or focus-revealed actions with touch-sized targets | Compact width and/or `pointer: coarse` | Tile menus, category editors and picker controls; see audit for coverage |

Saved/SQL dashboard charts use 60% of saved height, bounded to 3–6 grid rows (about 185–380px). Markdown/headings retain their height; Loom uses four rows. Export rendering retains saved chart heights. This is a viewer projection, not a saved layout mutation.

## Phone interaction policy

- Chart/dashboard editor routes show a larger-screen notice below 768px, including direct links to Explorer and SQL Runner. Saved viewers remain available. Create, edit, duplicate, add-to-dashboard and Explore from here actions are unavailable on phones; existing authorization still applies at larger widths.
- **Selected direction B for both headers:** full-width title, compact metadata, then an equally spaced labeled action row. Dashboard: Refresh / Share / More. Saved chart: Share / Favorite / More, subject to existing permissions. Controls are 48px tall with 18px icons, 8px icon-label gaps and a shared 16px horizontal inset. Details and secondary actions live under More; the saved-chart author remains in Details.
- Dashboard Refresh runs immediately. Auto-refresh settings open from More; the same refresh component stays mounted across phone/tablet resizing so its timer survives. Desktop retains its split control. The pre-aggregate bolt is omitted from the phone header.
- Navigation uses grouped vertical rows. Settings, page-details and AI settings drawers use a bounded flex body so their option lists scroll while the close control remains reachable.
- Dashboard filter/parameter rows use a container query below 600px: full-width wrapping controls, with Add filter and Reset kept together. Saved-chart filter rules stack field/operator/value controls below 768px; parameter fields remain one column with wrapping labels.
- Scheduler modals become fullscreen below 768px; tablets keep the full editor with narrower supporting columns.

## Existing AI patterns still under audit

[AiAgentPageLayout](../packages/frontend/src/ee/features/aiCopilot/components/AiAgentPageLayout/AiAgentPageLayout.tsx) already turns the thread sidebar into an 85%-width left Drawer and the preview panel into a 75%-height bottom Drawer. Its existing cutoff is **≤768px**, unlike the strict `<sm` cutoff above. Thread drawer behavior is verified; artifact/preview workflows and the exact boundary still need coverage. Do not generalize this existing implementation into a rule that every Drawer becomes a bottom sheet.

## Rules for subsequent work

- Choose presentation by available space and task: navigation → side drawer; dashboard filters → bottom sheet; substantial forms → fullscreen modal; short confirmations → dialog; small contextual choices → bounded popover.
- Reuse the same controls, queries and permissions. Preserve selections, unsaved input, URL state and canvas/iframe state across resize. A component swap does not imply mounting a second full workspace.
- Use CSS for wrapping, dimensions and touch targets. Use Mantine `useMatches` / `useMediaQuery` when interaction or component placement changes. Observe container width for reusable dashboard/embed content.
- Target 44px controls and 16px form inputs on compact/touch layouts. Keep close/actions reachable with short landscape heights, scrolling content, safe areas and the on-screen keyboard. Check keyboard opening, nested Escape handling and focus return.
- Record each new replacement here with its trigger, exception, source component and audit evidence. Mark unverified behavior explicitly.

Theme breakpoints are `sm=48em`, `md=62em`, `lg=75em` (768/992/1200px at the default font size). Dashboard grid breakpoints are a separate system: 768/996/1200px. A narrow embed can need the stacked grid while its host window remains desktop-sized. These thresholds must not be conflated.
