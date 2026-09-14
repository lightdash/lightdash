import {
    MetricType,
    type AdditionalMetric,
    type CreateSavedChartVersion,
    type SavedChart,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    createExplorerStore,
    explorerActions,
    selectHasUnsavedChanges,
} from '../../features/explorer/store';
import { mockSavedChartResponse } from '../../testing/savedChartResponse.mock';
import { buildDashboardEditorInitialState } from './buildDashboardEditorInitialState';

const registryMetric: AdditionalMetric = {
    name: 'first_name_count_distinct',
    label: 'Count distinct of First name',
    table: 'customers',
    sql: '${TABLE}.first_name',
    type: MetricType.COUNT_DISTINCT,
    baseDimensionName: 'first_name',
};

const editChart = mockSavedChartResponse();

const buildStore = (seededMetrics: AdditionalMetric[]) =>
    createExplorerStore({
        explorer: buildDashboardEditorInitialState({
            exploreId: 'payments',
            editChart,
            seededMetrics,
        }),
    });

describe('buildDashboardEditorInitialState', () => {
    it('opens an editing session clean with an empty registry', () => {
        // Pins the non-seed dirty sources: pivotConfig defaulting and the
        // palette baseline.
        const store = buildStore([]);
        expect(selectHasUnsavedChanges(store.getState())).toBe(false);
    });

    it('opens an editing session clean when registry metrics are seeded', () => {
        const store = buildStore([registryMetric]);

        // The seed reaches the draft…
        expect(
            store.getState().explorer.unsavedChartVersion.metricQuery
                .additionalMetrics,
        ).toEqual([registryMetric]);
        // …but is baseline context, not an unsaved edit.
        expect(selectHasUnsavedChanges(store.getState())).toBe(false);
    });

    it('keeps the chart snapshot on collision and still opens clean', () => {
        const chartsOwnCopy = { ...registryMetric, label: 'Chart-local label' };
        const chartWithMetric = {
            ...editChart,
            metricQuery: {
                ...editChart.metricQuery,
                additionalMetrics: [chartsOwnCopy],
            },
        } as SavedChart;
        const store = createExplorerStore({
            explorer: buildDashboardEditorInitialState({
                exploreId: 'payments',
                editChart: chartWithMetric,
                seededMetrics: [registryMetric],
            }),
        });

        expect(
            store.getState().explorer.unsavedChartVersion.metricQuery
                .additionalMetrics,
        ).toEqual([chartsOwnCopy]);
        expect(selectHasUnsavedChanges(store.getState())).toBe(false);
    });

    it('starts the session on a handed-over version, dirty against the baseline', () => {
        const handedOver: CreateSavedChartVersion = {
            tableName: editChart.tableName,
            metricQuery: { ...editChart.metricQuery, limit: 25 },
            chartConfig: editChart.chartConfig,
            tableConfig: editChart.tableConfig,
            pivotConfig: { columns: ['payments_payment_method'] },
        };
        const store = createExplorerStore({
            explorer: buildDashboardEditorInitialState({
                exploreId: 'payments',
                editChart,
                seededMetrics: [registryMetric],
                unsavedChartVersionOverride: handedOver,
            }),
        });

        // The override replaces the draft wholesale, pivotConfig included.
        expect(store.getState().explorer.unsavedChartVersion).toEqual(
            handedOver,
        );
        // The baseline is still the seeded saved chart…
        expect(store.getState().explorer.savedChart?.metricQuery.limit).toBe(
            500,
        );
        expect(
            store.getState().explorer.savedChart?.metricQuery.additionalMetrics,
        ).toEqual([registryMetric]);
        // …so the handed-over edits read as unsaved.
        expect(selectHasUnsavedChanges(store.getState())).toBe(true);
    });

    it('still reads dirty after a real edit', () => {
        const store = buildStore([registryMetric]);
        store.dispatch(explorerActions.setRowLimit(25));
        expect(selectHasUnsavedChanges(store.getState())).toBe(true);
    });
});
