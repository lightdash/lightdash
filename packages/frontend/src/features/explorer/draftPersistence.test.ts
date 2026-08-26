import { ChartType, type CreateSavedChartVersion } from '@lightdash/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { wasAppInitiatedReload } from '../appReload/appInitiatedReload';
import {
    chartVersionStamp,
    clearExplorerDraft,
    persistExplorerDraft,
    readRestorableExplorerDraft,
} from './draftPersistence';

vi.mock('../appReload/appInitiatedReload', () => ({
    wasAppInitiatedReload: vi.fn(),
}));

const wasAppInitiatedReloadMock = vi.mocked(wasAppInitiatedReload);

const CHART_UUID = 'chart-uuid-1';
const UPDATED_AT = new Date('2026-08-01T10:00:00.000Z');

const draft: CreateSavedChartVersion = {
    tableName: 'orders',
    metricQuery: {
        exploreName: 'orders',
        dimensions: ['orders_status'],
        metrics: ['orders_total'],
        filters: {},
        sorts: [],
        limit: 500,
        tableCalculations: [],
    },
    chartConfig: {
        type: ChartType.CARTESIAN,
        config: { layout: {}, eChartsConfig: {} },
    },
    tableConfig: { columnOrder: [] },
};

const savedChart = {
    uuid: CHART_UUID,
    updatedAt: UPDATED_AT,
    tableName: 'orders',
};

describe('draftPersistence', () => {
    beforeEach(() => {
        sessionStorage.clear();
        wasAppInitiatedReloadMock.mockReturnValue(true);
    });

    it('restores a persisted draft after an app-initiated reload', () => {
        persistExplorerDraft(CHART_UUID, chartVersionStamp(UPDATED_AT), draft);

        expect(readRestorableExplorerDraft(savedChart)).toEqual(draft);
    });

    it('does not restore after a user-initiated reload', () => {
        wasAppInitiatedReloadMock.mockReturnValue(false);
        persistExplorerDraft(CHART_UUID, chartVersionStamp(UPDATED_AT), draft);

        expect(readRestorableExplorerDraft(savedChart)).toBeNull();
    });

    it('drops the draft when the chart was saved elsewhere since the snapshot', () => {
        persistExplorerDraft(CHART_UUID, chartVersionStamp(UPDATED_AT), draft);

        const newerChart = {
            ...savedChart,
            updatedAt: new Date('2026-08-02T10:00:00.000Z'),
        };
        expect(readRestorableExplorerDraft(newerChart)).toBeNull();

        // The stale snapshot is cleared, so even the original version cannot restore it
        expect(readRestorableExplorerDraft(savedChart)).toBeNull();
    });

    it('drops the draft when the chart points at a different table', () => {
        persistExplorerDraft(CHART_UUID, chartVersionStamp(UPDATED_AT), draft);

        expect(
            readRestorableExplorerDraft({
                ...savedChart,
                tableName: 'customers',
            }),
        ).toBeNull();
    });

    it('ignores corrupted snapshots', () => {
        sessionStorage.setItem(
            `lightdash-explorer-draft:${CHART_UUID}`,
            'not-json',
        );

        expect(readRestorableExplorerDraft(savedChart)).toBeNull();
    });

    it('clears a draft', () => {
        persistExplorerDraft(CHART_UUID, chartVersionStamp(UPDATED_AT), draft);
        clearExplorerDraft(CHART_UUID);

        expect(readRestorableExplorerDraft(savedChart)).toBeNull();
    });

    it('stamps chart versions identically for Date and string inputs', () => {
        expect(chartVersionStamp(UPDATED_AT)).toEqual(
            chartVersionStamp('2026-08-01T10:00:00.000Z'),
        );
    });
});
