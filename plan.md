# Progressive Chart Loading - Implementation Plan

## Goal
Charts render in visual order (top-left to bottom-right, row by row). All queries execute in parallel, but chart *rendering* is gated: a chart only becomes visible once all tiles before it in the visual order have rendered. This creates a "waterfall" reveal effect.

## Current Architecture
- Each `DashboardChartTile` independently calls `useDashboardChartReadyQuery` → `useInfiniteQueryResults` → renders when data arrives
- Tiles are positioned absolutely by react-grid-layout based on `(x, y, w, h)` coordinates
- Tiles are already sorted by `(y, x)` in the grid rendering loop
- Loading state shows a skeleton `TileBase` with `isLoading`
- There's no coordination between tiles on when they reveal

## Design

### New hook: `useProgressiveReveal`

A single React context/hook at the dashboard level that coordinates tile reveal order.

**State it manages:**
- `tileOrder: string[]` — tile UUIDs sorted by `(y, x)` position (computed from dashboard tiles)
- `readySet: Set<string>` — tiles whose data has loaded (query + first page of results)
- `revealedUpTo: number` — index into `tileOrder` of the highest contiguously-ready tile

**API:**
- `markTileReady(tileUuid: string)` — called by each tile when its data is loaded
- `isTileRevealed(tileUuid: string): boolean` — returns whether this tile should show content vs skeleton

**Logic:**
When `readySet` changes, advance `revealedUpTo` as far as possible through the contiguous prefix of ready tiles. A tile is "revealed" if its index in `tileOrder` is ≤ `revealedUpTo`.

Non-chart tiles (markdown, loom, heading) are always immediately marked as ready since they don't have async queries.

### Where it lives

Add to `DashboardProvider` (or as a separate context consumed alongside it). The provider already has access to `dashboardTiles` for computing the sort order.

### Integration points

1. **`DashboardChartTile` (the bottom-level component, ~line 2003)**
   - After `useDashboardChartReadyQuery` and `useInfiniteQueryResults` resolve, call `markTileReady(tileUuid)`
   - Replace the `isLoading` condition: a tile shows skeleton if `isLoading || !isTileRevealed(tileUuid)`
   - Queries still fire in parallel — only the *render reveal* is gated

2. **`GridTile`**
   - For non-chart tile types (MARKDOWN, LOOM, HEADING), call `markTileReady` immediately on mount

3. **`DashboardTabs/index.tsx`**
   - The `tileOrder` is derived from the same `(y, x)` sort already used for `sortedTiles`
   - Pass sorted order into the progressive reveal provider

### Edge cases
- **Tile errors**: A tile that errors should still be marked as "ready" (so it doesn't block subsequent tiles)
- **Tab switching**: Reset `readySet` when switching tabs (only track tiles on the active tab)
- **Edit mode**: Could disable progressive reveal in edit mode for instant feedback
- **Empty dashboards**: No-op when there are no tiles
- **Tile resize/reorder in edit mode**: Recompute `tileOrder` when tiles change positions

### Files to modify

| File | Change |
|------|--------|
| `packages/frontend/src/providers/Dashboard/DashboardProvider.tsx` | Add progressive reveal state + context selectors |
| `packages/frontend/src/providers/Dashboard/useDashboardContext.ts` | Expose new selectors |
| `packages/frontend/src/components/DashboardTiles/DashboardChartTile.tsx` | Call `markTileReady`, gate reveal |
| `packages/frontend/src/components/DashboardTiles/DashboardSqlChartTile.tsx` | Same as above for SQL chart tiles |
| `packages/frontend/src/features/dashboardTabs/GridTile.tsx` | Mark non-chart tiles as immediately ready |
| `packages/frontend/src/features/dashboardTabs/index.tsx` | Compute and pass tile order |
| `packages/frontend/src/hooks/useProgressiveReveal.ts` | New hook with the core logic |

### Optional: CSS transition
Add a subtle fade-in (opacity 0→1, ~200ms) when a tile transitions from skeleton to revealed, so the "pop-in" feels smooth rather than jarring.

### Performance notes
- Zero impact on query parallelism — all queries fire immediately as today
- The only change is visual: skeleton → content transition is ordered
- `readySet` updates trigger a single re-render via context, advancing the reveal watermark
- Tiles that are already revealed don't re-render when later tiles become ready (stable `isTileRevealed` return)
