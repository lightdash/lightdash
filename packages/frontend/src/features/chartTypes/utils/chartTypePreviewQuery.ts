import {
    deriveDataAppVizPivotConfig,
    deriveDataAppVizPivotConfiguration,
    getItemId,
    isCustomDimension,
    isDimension,
    QueryExecutionContext,
    QueryHistoryStatus,
    type ApiExecuteAsyncMetricQueryResults,
    type DataAppVizFieldMapping,
    type DataAppVizSchema,
    type ExecuteAsyncMetricQueryRequestParams,
    type ItemsMap,
    type MetricQuery,
    type ReadyQueryResultsPage,
    type ResultRow,
} from '@lightdash/common';
import { lightdashApi } from '../../../api';
import { convertDateFilters } from '../../../utils/dateFilter';
import { pollForResults } from '../../queryRunner/executeQuery';
import { buildTestMetricQuery } from '../components/dataAppVizTestQuery';
import { retainBoundTableCalculations } from './chartTypePreviewTableCalcs';

/** One page of rows is all a preview ever needs, and the cap the panel shows. */
export const CHART_TYPE_PREVIEW_ROW_LIMIT = 500;

export const emptyChartTypePreviewMetricQuery = (
    exploreName: string,
): MetricQuery => ({
    exploreName,
    dimensions: [],
    metrics: [],
    filters: {},
    sorts: [],
    limit: CHART_TYPE_PREVIEW_ROW_LIMIT,
    tableCalculations: [],
});

/**
 * Rebuild the preview's query from the current binding.
 *
 * The columns follow the bound inputs. A bound table calculation is selected
 * through `tableCalculations`, never as a metric, and drags in the columns it
 * references; the calculations nothing binds are dropped, because a preview
 * narrows the columns underneath them. Filters and custom fields carry
 * through; sorts survive only while the column they name is still selected.
 */
export const deriveChartTypePreviewMetricQuery = ({
    base,
    schema,
    fieldMapping,
    itemsMap,
}: {
    base: MetricQuery;
    schema: DataAppVizSchema;
    fieldMapping: DataAppVizFieldMapping;
    itemsMap: ItemsMap;
}): MetricQuery => {
    const bound = buildTestMetricQuery(
        base.exploreName,
        schema,
        fieldMapping,
        itemsMap,
    );
    const calcNames = new Set(base.tableCalculations.map(getItemId));
    const boundIds = [...new Set([...bound.dimensions, ...bound.metrics])];
    const { tableCalculations, referencedFieldIds } =
        retainBoundTableCalculations(
            base,
            boundIds.filter((id) => calcNames.has(id)),
        );

    const dimensions = new Set(
        bound.dimensions.filter((id) => !calcNames.has(id)),
    );
    const metrics = new Set(bound.metrics.filter((id) => !calcNames.has(id)));
    // A retained calculation only compiles while the columns it names are in
    // the query, so they come back in on the side its own query put them.
    for (const id of referencedFieldIds) {
        if (base.dimensions.includes(id)) dimensions.add(id);
        else if (base.metrics.includes(id)) metrics.add(id);
        else if (isDimension(itemsMap[id]) || isCustomDimension(itemsMap[id])) {
            dimensions.add(id);
        } else metrics.add(id);
    }

    const selected = new Set([
        ...dimensions,
        ...metrics,
        ...tableCalculations.map(getItemId),
    ]);

    return {
        ...base,
        dimensions: [...dimensions],
        metrics: [...metrics],
        tableCalculations,
        sorts: base.sorts.filter((sort) => selected.has(sort.fieldId)),
        limit: Math.min(base.limit, CHART_TYPE_PREVIEW_ROW_LIMIT),
    };
};

export type ChartTypePreviewQueryResult = {
    rows: ResultRow[];
    itemsMap: ItemsMap;
    pivotDetails: ReadyQueryResultsPage['pivotDetails'];
};

/**
 * Run the preview's query once and hand back its rows. Nothing else in the
 * builder reaches the warehouse, so this is called only from an explicit run.
 */
export const executeChartTypePreviewQuery = async ({
    projectUuid,
    metricQuery,
    schema,
    fieldMapping,
    itemsMap,
}: {
    projectUuid: string;
    metricQuery: MetricQuery;
    schema: DataAppVizSchema;
    fieldMapping: DataAppVizFieldMapping;
    itemsMap: ItemsMap;
}): Promise<ChartTypePreviewQueryResult> => {
    const pivotConfiguration = deriveDataAppVizPivotConfiguration(
        fieldMapping,
        deriveDataAppVizPivotConfig(schema.fields, fieldMapping),
        metricQuery,
        itemsMap,
    );
    const query = await lightdashApi<ApiExecuteAsyncMetricQueryResults>({
        url: `/projects/${projectUuid}/query/metric-query`,
        version: 'v2',
        method: 'POST',
        body: JSON.stringify({
            context: QueryExecutionContext.DATA_APP_SAMPLE,
            query: {
                ...metricQuery,
                filters: convertDateFilters(metricQuery.filters),
            },
            pivotConfiguration,
        } satisfies ExecuteAsyncMetricQueryRequestParams),
    });

    const results = await pollForResults(projectUuid, query.queryUuid);
    if (results.status !== QueryHistoryStatus.READY) {
        throw new Error(
            ('error' in results ? results.error : null) ??
                'The preview query did not finish',
        );
    }

    return {
        rows: results.rows,
        itemsMap: query.fields,
        pivotDetails: results.pivotDetails,
    };
};
