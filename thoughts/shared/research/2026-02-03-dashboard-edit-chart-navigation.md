---
date: 2026-02-03T12:04:28+00:00
researcher: Claude
git_commit: 93f18c4ea5b88cf1708e07b5424d1fc4cba2a1c2
branch: claude/read-full-files-F8BHa
repository: lightdash
topic: "Dashboard Edit Mode - Enabling Chart Editing with Auto-Save"
tags: [research, codebase, dashboard, chart-editing, edit-mode, navigation]
status: complete
last_updated: 2026-02-03
last_updated_by: Claude
---

# Research: Dashboard Edit Mode - Enabling Chart Editing with Auto-Save

**Date**: 2026-02-03T12:04:28+00:00
**Researcher**: Claude
**Git Commit**: 93f18c4ea5b88cf1708e07b5424d1fc4cba2a1c2
**Branch**: claude/read-full-files-F8BHa
**Repository**: lightdash

## Research Question

When a dashboard is in edit mode, the "Edit chart" option on chart tiles is disabled. The current behavior forces users to either lose their work-in-progress or cancel their dashboard edits before editing a chart. The proposed improvement would allow users to click "Edit chart" while in dashboard edit mode, prompt them to save the dashboard first, then navigate to the chart editor, and finally return to the dashboard in edit mode.

## Summary

The current implementation deliberately disables chart editing when in dashboard edit mode to prevent users from losing unsaved dashboard changes. The codebase already has infrastructure for:
1. Storing dashboard state in sessionStorage before navigating to chart edit
2. Navigation blocking when there are unsaved changes
3. A save mechanism that could be triggered before navigation

Implementing the proposed feature would require:
1. Removing the `isEditMode` disable condition on `EditChartMenuItem`
2. Adding a confirmation modal that prompts to save before editing
3. Modifying the return navigation to restore edit mode
4. Potentially storing that the user was in edit mode to restore it on return

## Detailed Findings

### 1. Current Disable Logic

**File:** `packages/frontend/src/components/DashboardTiles/DashboardChartTile.tsx:1224-1230`

```typescript
<EditChartMenuItem
    tile={props.tile}
    disabled={
        isEditMode ||
        !userCanManageChart
    }
/>
```

The `EditChartMenuItem` is disabled when:
- User is in dashboard edit mode (`isEditMode === true`)
- User doesn't have permission to manage the chart (`!userCanManageChart`)

A tooltip is shown when disabled due to edit mode (line 1209-1213):
```typescript
<Tooltip
    disabled={!isEditMode}
    label="Finish editing dashboard to use these actions"
    variant="xs"
>
```

### 2. Edit Mode State Management

**File:** `packages/frontend/src/pages/Dashboard.tsx:91`

Edit mode is determined by the URL parameter:
```typescript
const isEditMode = useMemo(() => mode === 'edit', [mode]);
```

**Routes:**
- View mode: `/projects/:projectUuid/dashboards/:dashboardUuid/view`
- Edit mode: `/projects/:projectUuid/dashboards/:dashboardUuid/edit`

### 3. Dashboard Storage Hook

**File:** `packages/frontend/src/hooks/dashboard/useDashboardStorage.ts`

The `useDashboardStorage` hook already provides infrastructure for storing dashboard state:

**Key functions:**
- `storeDashboard()` (lines 80-123): Stores dashboard state to sessionStorage
  - `unsavedDashboardTiles`
  - `unsavedDashboardFilters`
  - `dashboardUuid`
  - `fromDashboard` (dashboard name)
  - `activeTabUuid`
  - `dashboardTabs`
  - `hasDashboardChanges`

- `clearDashboardStorage()` (lines 69-78): Clears all stored state
- `getEditingDashboardInfo()` (lines 38-44): Retrieves stored dashboard info
- `getHasDashboardChanges()` (lines 59-63): Checks if there were unsaved changes

### 4. EditChartMenuItem Already Stores State

**File:** `packages/frontend/src/components/DashboardTiles/EditChartMenuItem.tsx:39-51`

```typescript
onClick={() => {
    if (tile.properties.belongsToDashboard) {
        storeDashboard(
            dashboardTiles,
            filtersFromContext,
            haveTilesChanged,
            haveFiltersChanged,
            dashboard?.uuid,
            dashboard?.name,
            activeTab?.uuid,
            dashboardTabs,
        );
    }
}}
```

The component already stores dashboard state when navigating to chart edit, but this only happens for charts that "belong to" the dashboard. This infrastructure could be extended to also store the edit mode state.

### 5. Navigation Blocker

**File:** `packages/frontend/src/pages/Dashboard.tsx:509-522`

The dashboard uses `useBlocker` to prevent navigation when there are unsaved changes:

```typescript
const blocker = useBlocker(({ nextLocation }) => {
    if (
        isEditMode &&
        (haveTilesChanged || haveFiltersChanged || haveTabsChanged) &&
        !nextLocation.pathname.includes(
            `/projects/${projectUuid}/dashboards/${dashboardUuid}`,
        ) &&
        // Allow user to add a new table
        !sessionStorage.getItem('unsavedDashboardTiles')
    ) {
        return true; //blocks navigation
    }
    return false; // allow navigation
});
```

Note: The blocker already has an exception for when `unsavedDashboardTiles` is in sessionStorage.

### 6. Save Dashboard Handler

**File:** `packages/frontend/src/pages/Dashboard.tsx:577-615`

```typescript
const handleSaveDashboard = () => {
    // Combines filters and calls mutate()
    mutate({
        tiles: dashboardTiles,
        filters: {...},
        name: dashboard.name,
        tabs: dashboardTabs,
        config: {...},
        parameters: dashboardParameters,
    });
};
```

**On success (lines 266-287):**
- Resets all change flags
- Navigates to view mode: `/projects/${projectUuid}/dashboards/${dashboardUuid}/view`

### 7. Change Detection

**File:** `packages/frontend/src/pages/Dashboard.tsx:628-635`

The `hasDashboardChanged` flag combines multiple change indicators:
```typescript
hasDashboardChanged:
    haveTilesChanged ||
    haveFiltersChanged ||
    hasTemporaryFilters ||
    haveTabsChanged ||
    hasDateZoomDisabledChanged ||
    parametersHaveChanged ||
    havePinnedParametersChanged,
```

### 8. Save Mutation Hook

**File:** `packages/frontend/src/hooks/dashboard/useDashboard.ts:337-403`

The `useUpdateDashboard` hook provides:
- `mutate()` - triggers the save
- `isLoading` (aliased as `isSaving`) - for loading states
- `isSuccess` - to detect when save completes
- Optional `onSuccessCallback` parameter for post-save actions

## Code References

| File | Line | Description |
|------|------|-------------|
| `packages/frontend/src/components/DashboardTiles/DashboardChartTile.tsx` | 1226-1228 | Disable condition for EditChartMenuItem |
| `packages/frontend/src/components/DashboardTiles/DashboardChartTile.tsx` | 1209-1213 | Tooltip shown when in edit mode |
| `packages/frontend/src/components/DashboardTiles/EditChartMenuItem.tsx` | 39-51 | Current storeDashboard call on click |
| `packages/frontend/src/pages/Dashboard.tsx` | 91 | Edit mode determination from URL |
| `packages/frontend/src/pages/Dashboard.tsx` | 509-522 | Navigation blocker for unsaved changes |
| `packages/frontend/src/pages/Dashboard.tsx` | 577-615 | Save dashboard handler |
| `packages/frontend/src/pages/Dashboard.tsx` | 266-287 | Post-save navigation to view mode |
| `packages/frontend/src/hooks/dashboard/useDashboardStorage.ts` | 80-123 | storeDashboard function |
| `packages/frontend/src/hooks/dashboard/useDashboard.ts` | 337-403 | useUpdateDashboard mutation hook |

## Architecture Documentation

### Current Flow (Dashboard Edit Mode -> Chart Edit - BLOCKED)

```
1. User enters dashboard edit mode (URL: /dashboards/:id/edit)
2. User makes changes to dashboard (tiles, filters, tabs)
3. User wants to edit a chart tile
4. "Edit chart" menu item is DISABLED
5. User must either:
   a. Cancel changes and lose work, then edit chart
   b. Save changes, exit edit mode, then edit chart
```

### Proposed Flow

```
1. User enters dashboard edit mode (URL: /dashboards/:id/edit)
2. User makes changes to dashboard
3. User clicks "Edit chart" on a tile
4. Modal appears: "Save dashboard before editing chart?"
   - "Save and edit" -> Saves dashboard, navigates to chart edit
   - "Cancel" -> Returns to dashboard edit mode
5. After chart editing, user clicks "Return to dashboard"
6. User returns to dashboard in EDIT mode (not view mode)
```

### Key Implementation Points

1. **Remove isEditMode from disable condition** in `DashboardChartTile.tsx:1226-1228`

2. **Add confirmation modal** that:
   - Checks if `hasDashboardChanged`
   - Offers to save before navigating
   - Could use existing `MantineModal` pattern from blocker (lines 651-677)

3. **Modify EditChartMenuItem** to:
   - Store `isEditMode` state in sessionStorage
   - Trigger save if needed before navigation

4. **Modify post-save behavior** in Dashboard.tsx to:
   - Not automatically navigate to view mode if editing chart
   - Or navigate to chart edit after save completes

5. **Modify return navigation** to:
   - Check if user was in edit mode
   - Navigate to `/dashboards/:id/edit` instead of `/dashboards/:id/view`

### Existing Infrastructure to Leverage

- `useDashboardStorage` hook for state persistence
- `useUpdateDashboard` hook with `onSuccessCallback` for post-save actions
- Navigation blocker exception for `unsavedDashboardTiles` in sessionStorage
- Existing modal pattern for unsaved changes warning

## Open Questions

1. Should the save happen automatically when clicking "Edit chart", or should the user explicitly confirm?
2. If the save fails, should the user still be blocked from editing the chart?
3. Should there be a "Don't save, edit anyway" option that stores unsaved state and restores it on return?
4. How should this interact with the existing navigation blocker?
5. Should this behavior apply to all tile menu actions or just "Edit chart"?
