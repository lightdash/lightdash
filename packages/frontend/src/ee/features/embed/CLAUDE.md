<summary>
Embedded dashboards expose a **public CSS class contract**: a fixed set of stable, human-readable classnames (e.g. `ld-dashboard-header`) that embedding customers target to override styles. CSS-module classes are hashed and change across builds, so they can't be targeted; these `ld-*` classes are the stable hooks. The vocabulary and the helper that applies it live in `styles/embedClassContract.ts`.
</summary>

<howToUse>
When you add, rename, or restructure an element of an embedded dashboard that customers may want to style, give it a contract class.

1. Add the classname to `EMBED_CLASS_CONTRACT` in `styles/embedClassContract.ts`. It must match `ld-[surface]-[element]` (the `satisfies` constraint enforces a known surface + element segment at compile time; add a new surface to `EmbedSurface` first if needed).
2. Apply it with `embedContractClass(name, ...moduleClasses)`, which joins the public class with the hashed module class(es):

```tsx
import { embedContractClass } from '../../styles/embedClassContract';

// Inline element (class lives on the embed-owned wrapper DOM node)
<Box className={embedContractClass('ld-dashboard-header', styles.headerBar)}>
```

There are two placement mechanics, because some dropdowns render in a portal at `document.body`, outside the embed DOM tree:

- **Inline elements** — put the class on the embed-owned wrapper. Customers reach inner triggers via descendant selectors (`.ld-dashboard-filters button {}`).
- **Portalled dropdowns** (filter pills, date zoom, parameters) — a wrapper class can't reach them. Pass the class into the shared component's `dropdownClassName` prop, which applies it via Mantine `classNames={{ dropdown }}` so it lands on the portalled node.

```tsx
<DateZoom
    isEditMode={false}
    dropdownClassName={embedContractClass('ld-dashboard-date-zoom-dropdown')}
/>
```
</howToUse>

<importantToKnow>
- **This is a public API.** Once a classname ships, renaming or removing it breaks customer stylesheets. Add freely; treat every existing name as frozen.
- **Never apply a contract class unconditionally inside a shared component** (`features/dateZoom`, `features/dashboardFilters`, `features/parameters`). Those render in the main app too — the class would leak outside embeds. That's why the portalled dropdowns thread an optional `dropdownClassName` prop set only by the embed wrappers; a default/absent prop means no class in the main app.
- **`[surface]` is the embedded surface the customer sees** (`dashboard`), not the React component name. Name by where it appears in the embed, not by which component renders it — the same shared component may render in several places.
- If you change a shared component's dropdown structure, keep the `dropdownClassName` → `classNames={{ dropdown }}` wiring intact, or the contract silently breaks.
</importantToKnow>

<links>
@/packages/frontend/src/ee/features/embed/styles/embedClassContract.ts - The class vocabulary + `embedContractClass` helper
@/packages/frontend/src/ee/features/embed/EmbedDashboard/components/EmbedDashboardHeader.tsx - Inline contract class example
@/packages/frontend/src/ee/features/embed/EmbedDashboard/components/EmbedDashboardFilterBar.tsx - Inline + portalled (date zoom) example
@/packages/frontend/src/features/dashboardFilters/ActiveFilters/Filter.tsx - Portalled dropdown via `dropdownClassName`
</links>
