import {
    isExecuteAsyncDashboardChartRequestParams,
    type DashboardTileRenderRequest,
    type ExecuteAsyncDashboardChartRequestParams,
    type ExecuteAsyncSavedChartRequestParams,
    type ParametersValuesMap,
} from '@lightdash/common';

type ChartRequestParams = (
    | ExecuteAsyncSavedChartRequestParams
    | ExecuteAsyncDashboardChartRequestParams
) & { resultEffectiveParameters?: ParametersValuesMap };

/**
 * What a chart-image render needs beyond the chart itself. A dashboard tile
 * replays its own request, so the render is authorized through the dashboard
 * and keeps the tile's filters, sorts, date zoom and parameters. A saved
 * chart only carries parameters, and none at all when it has none: any
 * override makes the chart page run an ad hoc query viewers cannot run.
 */
export const getChartImageRenderOverrides = (
    requestParameters: ChartRequestParams,
): {
    dashboardTileRenderRequest?: DashboardTileRenderRequest;
    parameters?: ParametersValuesMap;
} => {
    if (isExecuteAsyncDashboardChartRequestParams(requestParameters)) {
        return {
            dashboardTileRenderRequest: {
                dashboardUuid: requestParameters.dashboardUuid,
                tileUuid: requestParameters.tileUuid,
                dashboardFilters: requestParameters.dashboardFilters,
                dashboardSorts: requestParameters.dashboardSorts,
                dateZoom: requestParameters.dateZoom,
                parameters: requestParameters.parameters,
                excludedParameterKeys: requestParameters.excludedParameterKeys,
            },
        };
    }
    const parameters =
        requestParameters.resultEffectiveParameters ??
        requestParameters.parameters;
    return parameters && Object.keys(parameters).length > 0
        ? { parameters }
        : {};
};
