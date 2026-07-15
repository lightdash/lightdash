import { type DashboardTab } from '../types/dashboard';

/**
 * Resolves which dashboard tabs a per-tab export renders, in dashboard order.
 * null = "all tabs" → non-hidden only; explicit selection honors hidden tabs.
 */
export const resolveExportTabs = (
    tabs: DashboardTab[],
    selectedTabs: string[] | null,
): DashboardTab[] => {
    const ordered = [...tabs].sort((a, b) => a.order - b.order);
    if (selectedTabs === null) return ordered.filter((t) => !t.hidden);
    return ordered.filter((t) => selectedTabs.includes(t.uuid));
};

/**
 * The tab that hosts orphan (legacy, no-tab) tiles in a per-tab export: the
 * first tab in resolved render order. Orphans render on this tab's page.
 * Null when nothing renders. Keying on the first RESOLVED tab (not the literal
 * first dashboard tab) keeps orphans visible when the first tab is hidden or
 * unselected.
 */
export const getPagedExportOrphanHomeTabUuid = (
    resolvedTabUuids: string[],
): string | null => resolvedTabUuids[0] ?? null;

/**
 * Whether a tile is rendered by a per-tab (css-paged) export for the given
 * resolved tab selection. A tabbed tile renders iff its tab is resolved; an
 * orphan (legacy, no-tab) tile renders iff there is an orphan-home tab. Backend
 * and frontend both call this so their awaited-tile sets stay in lock-step —
 * disagreement makes screenshot readiness hang.
 */
export const isTileInPagedExport = (
    tile: { tabUuid?: string | null },
    resolvedTabUuids: string[],
): boolean =>
    tile.tabUuid
        ? resolvedTabUuids.includes(tile.tabUuid)
        : getPagedExportOrphanHomeTabUuid(resolvedTabUuids) !== null;
