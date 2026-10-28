# Tracking

Event names are in `EventName` (`src/types/Events.ts`); payload types in
`src/providers/Tracking/types.ts`. Every event carries `dashboardUuid` and
`filtersCount` (dimensions plus metrics) and otherwise only counts, booleans
and fixed values: never a filter or section name, label, value or field id.
`ADD_FILTER_CLICKED` keeps the shipped payloads (`mode` `edit`, `viewer` or
`embed`) and fires when a new filter is kept, not when the placeholder opens.

| Event                                     | Sent from                                                                                                |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `dashboard_filter_editor.opened`          | Provider `openExisting` (`pill`) / `openPlaceholder` (`add_filter`, `section_add`)                       |
| `dashboard_filter_editor.closed`          | Provider `trackClosed(outcome)`, called before the way out acts so `hadChanges` is still readable        |
| `dashboard_filter_editor.switch_answered` | `resolvePending` (`apply`, `discard`) and Escape on a pending question (`withdrawn`)                     |
| `dashboard_filters.moved`                 | Edited filter: internal `close()` when its section differs from the snapshot; bar: `countSectionChanges` |
| `dashboard_section.created`               | `NewSection` commit in `SectionedFilters` (the only event for it; moved pills send no `moved`)           |
| `dashboard_sections_tip.dismissed`        | The tip's X                                                                                              |
| `dashboard_section.toggled`               | A viewer's capsule fold                                                                                  |

Rules:

- Edit-mode only, except `dashboard_section.toggled`.
- The context's `close` / `discard` are tracked; the provider's internal ones
  track nothing. An `opened` can stay unpaired by design (stale edit, page
  unmount).
- A reorder within a section is not a move; a dangling `sectionId` counts as
  no section.
- Keep retired enum values (e.g. `add_section_icon`) in the type for past
  events.

Backend `dashboard.created` / `dashboard.updated` /
`dashboard_version.created` carry section counts from
`DashboardService.getSectionEventProperties`.
