import { type CreateSavedChartVersion } from '@lightdash/common';
import { wasAppInitiatedReload } from '../appReload/appInitiatedReload';

const DRAFT_KEY_PREFIX = 'lightdash-explorer-draft';

type ExplorerDraftSnapshot = {
    draft: CreateSavedChartVersion;
    chartUpdatedAt: string;
};

const draftKey = (chartUuid: string) => `${DRAFT_KEY_PREFIX}:${chartUuid}`;

/** Stable stamp of a chart's server version, used to detect concurrent saves. */
export const chartVersionStamp = (updatedAt: Date | string): string =>
    String(new Date(updatedAt).getTime());

export const persistExplorerDraft = (
    chartUuid: string,
    chartUpdatedAt: string,
    draft: CreateSavedChartVersion,
): void => {
    try {
        const snapshot: ExplorerDraftSnapshot = { draft, chartUpdatedAt };
        sessionStorage.setItem(draftKey(chartUuid), JSON.stringify(snapshot));
    } catch {
        // Storage full or unavailable; the draft just won't survive a reload.
    }
};

export const clearExplorerDraft = (chartUuid: string): void => {
    try {
        sessionStorage.removeItem(draftKey(chartUuid));
    } catch {
        // Storage unavailable; nothing to clear.
    }
};

const readExplorerDraft = (chartUuid: string): ExplorerDraftSnapshot | null => {
    try {
        const raw = sessionStorage.getItem(draftKey(chartUuid));
        if (raw === null) {
            return null;
        }

        const parsed: unknown = JSON.parse(raw);
        if (typeof parsed !== 'object' || parsed === null) {
            return null;
        }

        const { draft, chartUpdatedAt } =
            parsed as Partial<ExplorerDraftSnapshot>;
        if (
            typeof chartUpdatedAt !== 'string' ||
            typeof draft !== 'object' ||
            draft === null ||
            typeof draft.tableName !== 'string' ||
            typeof draft.metricQuery !== 'object'
        ) {
            return null;
        }

        return { draft, chartUpdatedAt };
    } catch {
        return null;
    }
};

/**
 * Return a draft worth restoring for this chart, or null. Restores only after
 * an app-initiated reload, and only when the chart hasn't been saved elsewhere
 * since the draft was taken.
 */
export const readRestorableExplorerDraft = (savedChart: {
    uuid: string;
    updatedAt: Date | string;
    tableName: string;
}): CreateSavedChartVersion | null => {
    const snapshot = readExplorerDraft(savedChart.uuid);
    if (!snapshot) {
        return null;
    }

    if (
        snapshot.chartUpdatedAt !== chartVersionStamp(savedChart.updatedAt) ||
        snapshot.draft.tableName !== savedChart.tableName
    ) {
        clearExplorerDraft(savedChart.uuid);
        return null;
    }

    if (!wasAppInitiatedReload()) {
        return null;
    }

    return snapshot.draft;
};
