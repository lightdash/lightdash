# Dashboard Filters

## Overview

Dashboard filters allow users to filter data across multiple chart tiles. Filters can be scoped to specific tiles/tabs using `tileTargets`.

## Key Concepts

### Filter Tile Targeting (`tileTargets`)

A `DashboardFilterRule` has an optional `tileTargets` property that controls which tiles the filter applies to:

```typescript
tileTargets?: Record<string, DashboardTileTarget>
// where DashboardTileTarget = DashboardFieldTarget | false
```

**Tile targeting logic** (see `FilterConfiguration/utils/index.ts`):

| `tileTargets` state | `tileTargets[uuid]` value   | Result                                          |
| ------------------- | --------------------------- | ----------------------------------------------- |
| `undefined`         | N/A                         | Filter applies to ALL tiles that have the field |
| defined             | `false`                     | Tile is explicitly **excluded**                 |
| defined             | `{fieldId, tableName}`      | Tile is explicitly **included** (mapped)        |
| defined             | `undefined` (not in object) | Auto-applies if tile has the field              |

### Filter-Tile Relationship Types

From `getFilterTileRelation()`:

-   **`auto`**: Filter automatically applies to tiles that have the matching field
-   **`disabled`**: Tile is explicitly excluded from this filter
-   **`mapped`**: Tile is explicitly included with a specific field mapping

### Autocomplete Filtering

When configuring a filter value, the autocomplete suggestions can be filtered by other dashboard filters. The logic in `FiltersProvider.tsx` (`getAutocompleteFilterGroup`):

**Rules:**

1. **Same-field filters**: Always excluded (never cross-filter each other)
2. **Different-field filters + tile overlap**: Included (do affect autocomplete)
3. **Different-field filters + no tile overlap**: Excluded

**How it works:**

When configuring a filter value, the autocomplete fetches possible values from the database. Other active filters (that pass the rules above) are included in the WHERE clause of that query.

For example, if Status=completed is set and you're configuring a Promo Code filter on the same tiles, the autocomplete query becomes:

```sql
SELECT DISTINCT promo_code FROM orders WHERE status = 'completed'
```

This means the autocomplete only shows values that exist in rows matching the other filters.

**Same-field exception:**

Same-field filters are always excluded because they would over-restrict the autocomplete. If Status=completed is set and you're configuring another Status filter, you'd only see "completed" in the autocomplete - making it impossible to select a different value.

## Key Files

-   `FilterConfiguration/utils/index.ts` - Core utilities for filter-tile relationships

    -   `getFilterTileRelation()` - Determines relationship between filter and tile
    -   `doesFilterApplyToTile()` - Checks if filter applies to a specific tile
    -   `getTabsForFilterRule()` - Gets which tabs a filter applies to

-   `FiltersProvider.tsx` (in `components/common/Filters/`) - Provides filter context including `getAutocompleteFilterGroup()` for autocomplete filtering

-   `ActiveFilters/index.tsx` - Renders active filters, handles tab-based visibility

-   `FilterConfiguration/index.tsx` - Filter configuration UI (value selection, tile targeting)

## Common Patterns

### Checking if a filter applies to a tile

```typescript
import { doesFilterApplyToTile } from './FilterConfiguration/utils';

const applies = doesFilterApplyToTile(
    filterRule,
    tile,
    filterableFieldsByTileUuid,
);
```

### Getting tabs for a filter

```typescript
import { getTabsForFilterRule } from './FilterConfiguration/utils';

const tabUuids = getTabsForFilterRule(
    filterRule,
    dashboardTiles,
    sortedTabUuids,
    filterableFieldsByTileUuid,
);
```
