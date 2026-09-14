import {
    ChartType,
    mergeDashboardCustomMetrics,
    type AdditionalMetric,
    type CreateSavedChartVersion,
    type SavedChart,
} from '@lightdash/common';
import { buildInitialExplorerState } from '../../features/explorer/store';
import { ExplorerSection } from '../../providers/Explorer/types';
/**
 * Explorer state for a dashboard-hosted editing session. Seeded registry
 * metrics fill gaps in the draft (the chart's own snapshot wins on collision)
 * and the same seeded query becomes the savedChart baseline, so host-provided
 * seeding never reads as an unsaved user edit. The palette must be seeded
 * explicitly: the custom-initial-state path of buildInitialExplorerState
 * does not derive unsavedColorPaletteUuid from savedChart.
 *
 * An override handed over in the url replaces the draft wholesale: it comes
 * from this same modal, so it already carries the seeded metrics.
 */
export const buildDashboardEditorInitialState = ({
    exploreId,
    editChart,
    seededMetrics,
    unsavedChartVersionOverride,
}: {
    exploreId: string;
    editChart: SavedChart | undefined;
    seededMetrics: AdditionalMetric[];
    unsavedChartVersionOverride?: CreateSavedChartVersion;
}) => {
    const seededMetricQuery = editChart
        ? {
              ...editChart.metricQuery,
              additionalMetrics: mergeDashboardCustomMetrics(
                  editChart.metricQuery.additionalMetrics ?? [],
                  seededMetrics,
              ),
          }
        : undefined;
    return buildInitialExplorerState({
        isEditMode: true,
        initialState: {
            expandedSections: [
                ExplorerSection.FILTERS,
                ExplorerSection.VISUALIZATION,
                ExplorerSection.RESULTS,
            ],
            unsavedColorPaletteUuid: editChart?.colorPaletteUuid ?? null,
            savedChart:
                editChart && seededMetricQuery
                    ? { ...editChart, metricQuery: seededMetricQuery }
                    : editChart,
            unsavedChartVersion: unsavedChartVersionOverride ?? {
                tableName: exploreId,
                metricQuery: seededMetricQuery ?? {
                    exploreName: exploreId,
                    dimensions: [],
                    metrics: [],
                    filters: {},
                    sorts: [],
                    limit: 500,
                    tableCalculations: [],
                    additionalMetrics: seededMetrics,
                    timezone: undefined,
                },
                chartConfig: editChart?.chartConfig ?? {
                    type: ChartType.CARTESIAN,
                    config: {
                        layout: { xField: '', yField: [] },
                        eChartsConfig: { series: [] },
                    },
                },
                tableConfig: editChart?.tableConfig ?? {
                    columnOrder: [],
                },
                // Mirror the chart exactly — defaulting an absent pivotConfig
                // to { columns: [] } reads as an unsaved edit in the dirty diff
                pivotConfig: editChart
                    ? editChart.pivotConfig
                    : { columns: [] },
            },
        },
        defaultLimit: 500,
    });
};
