import {
    ChartType,
    deriveDataAppVizPivotConfig,
    type CreateSavedChartVersion,
    type DataAppVizFieldMapping,
    type DataAppVizOptionValues,
    type DataAppVizSchema,
    type MetricQuery,
} from '@lightdash/common';
import { validate as isUuidString } from 'uuid';
import { stringifyCreateSavedChartVersion } from '../../../hooks/useExplorerRoute';

/** Marks an Explorer arrival as coming from Chart Studio, carrying the chart
 *  type to offer a way back to. The mirror of the `create_saved_chart_version`
 *  the Explorer hands the builder on the way in. */
const CHART_STUDIO_ORIGIN_PARAM = 'fromChartStudio';

/**
 * "Use in Explorer" for a chart type previewed on a real query: the Explorer
 * opens on that same query with this chart type selected and its inputs
 * already bound, so nothing is re-mapped on arrival.
 *
 * The search is built from scratch rather than inherited: the builder's own
 * url carries state the Explorer has no use for, and no space or dashboard
 * origin to pass on.
 */
export const buildChartTypeInExplorerDestination = ({
    projectUuid,
    dataAppVizUuid,
    exploreName,
    metricQuery,
    schema,
    fieldMapping,
    optionValues,
}: {
    projectUuid: string;
    dataAppVizUuid: string;
    exploreName: string;
    /** The query the preview would run, not the selection's base. */
    metricQuery: MetricQuery;
    /** The latest ready version's declaration, which is what charts render. */
    schema: DataAppVizSchema;
    fieldMapping: DataAppVizFieldMapping;
    optionValues: DataAppVizOptionValues;
}): { pathname: string; search: string } => {
    const chart: CreateSavedChartVersion = {
        tableName: exploreName,
        metricQuery,
        pivotConfig: deriveDataAppVizPivotConfig(schema.fields, fieldMapping),
        tableConfig: { columnOrder: [] },
        chartConfig: {
            type: ChartType.DATA_APP_VIZ,
            config: { dataAppVizUuid, fieldMapping, optionValues },
        },
    };
    const search = new URLSearchParams();
    search.set(
        'create_saved_chart_version',
        stringifyCreateSavedChartVersion(chart, false),
    );
    // The author asked for this query, so the Explorer runs it on arrival.
    search.set('isExploreFromHere', 'true');
    search.set(CHART_STUDIO_ORIGIN_PARAM, dataAppVizUuid);
    // The bound inputs are the thing to check on arrival, so the panel that
    // shows them opens with the chart.
    search.set('chartSidebar', 'configure');

    return {
        pathname: `/projects/${projectUuid}/tables/${exploreName}`,
        search: search.toString(),
    };
};

/** The explore's table page with this chart type preselected and its config
 *  panel open. No query state, so the Explorer runs nothing on arrival. */
export const chartTypeInExplorerPath = (
    projectUuid: string,
    exploreName: string,
    dataAppVizUuid: string,
): string =>
    `/projects/${projectUuid}/tables/${exploreName}?dataAppVizUuid=${dataAppVizUuid}&chartSidebar=configure`;

/** The chart type an Explorer arrival came from, when Chart Studio sent it. */
export const parseChartStudioOriginFromSearchParams = (
    search: string,
): string | null => {
    const dataAppVizUuid = new URLSearchParams(search).get(
        CHART_STUDIO_ORIGIN_PARAM,
    );
    return dataAppVizUuid && isUuidString(dataAppVizUuid)
        ? dataAppVizUuid
        : null;
};
