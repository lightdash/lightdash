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
