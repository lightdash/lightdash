import {
    ChartType,
    deriveDataAppVizPivotConfig,
    type ChartConfig,
    type CreateSavedChartVersion,
    type DataAppVizChart,
    type DataAppVizRenderMetadata,
    type MetricQuery,
    type ParametersValuesMap,
} from '@lightdash/common';
import { toSavedMerge } from '../../../../features/mergeQuery/hooks/useSavedMerge';
import {
    remapFieldIdsDeep,
    type CanonicalAiMerge,
} from './canonicalizeAiMerge';

type BuildAiSavedChartDataArgs = {
    metricQuery: MetricQuery | undefined;
    chartConfig: ChartConfig;
    columnOrder: string[];
    pivotDimensions: string[] | undefined;
    /** Set for merge artifacts. */
    merge: { parameters: ParametersValuesMap | undefined } | null;
    canonicalMerge: CanonicalAiMerge | null;
    /** Fetched for custom-chart-type answers; undefined for builtin answers. */
    customChartTypeMetadata: DataAppVizRenderMetadata | undefined;
};

export const getCustomChartTypeConfig = (
    chartConfig: ChartConfig,
): DataAppVizChart | undefined =>
    chartConfig.type === ChartType.DATA_APP_VIZ
        ? chartConfig.config
        : undefined;

/** The saved-chart version an AI answer persists through the save flows. */
export const buildAiSavedChartData = ({
    metricQuery,
    chartConfig,
    columnOrder,
    pivotDimensions,
    merge,
    canonicalMerge,
    customChartTypeMetadata,
}: BuildAiSavedChartDataArgs): CreateSavedChartVersion | undefined => {
    if (!metricQuery) return undefined;
    // A merged result's own metricQuery is synthetic; the chart persists
    // the primary source's query (always first) plus the stored merge.
    if (merge) {
        if (!canonicalMerge) return undefined;
        const { fieldIdByAiFieldId } = canonicalMerge;
        const [primary] = canonicalMerge.mergeQuery.sources;
        return {
            metricQuery: primary.metricQuery,
            tableName: primary.metricQuery.exploreName,
            chartConfig: remapFieldIdsDeep(chartConfig, fieldIdByAiFieldId),
            tableConfig: {
                columnOrder: remapFieldIdsDeep(columnOrder, fieldIdByAiFieldId),
            },
            pivotConfig: pivotDimensions?.length
                ? {
                      columns: remapFieldIdsDeep(
                          pivotDimensions,
                          fieldIdByAiFieldId,
                      ),
                  }
                : undefined,
            merge: toSavedMerge(canonicalMerge.mergeQuery),
            parameters: merge.parameters,
        };
    }
    const customChartTypeConfig = getCustomChartTypeConfig(chartConfig);
    // The thread pivots custom answers server-side from the type's schema;
    // persisting the same derivation makes the saved chart round-trip.
    if (customChartTypeConfig) {
        if (customChartTypeMetadata?.state !== 'ready') return undefined;
        return {
            metricQuery,
            tableName: metricQuery.exploreName,
            chartConfig,
            tableConfig: { columnOrder },
            pivotConfig: deriveDataAppVizPivotConfig(
                customChartTypeMetadata.schema.fields,
                customChartTypeConfig.fieldMapping,
            ),
        };
    }
    return {
        metricQuery,
        tableName: metricQuery.exploreName,
        chartConfig,
        tableConfig: { columnOrder },
        pivotConfig: pivotDimensions?.length
            ? { columns: pivotDimensions }
            : undefined,
    };
};
