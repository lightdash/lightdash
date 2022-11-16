import { URL } from 'url';
import { MetricQuery } from '../types/metricQuery';
import {
    CreateSavedChart,
    CreateSavedChartVersion,
    SavedChart,
    UpdateSavedChart,
} from '../types/savedCharts';
import { ParseError } from '../types/errors';

export type ChartsV1Resource = {
    resource: 'v1beta/chart';
    uuid?: string;
    name: string;
    description?: string;
    explore: string;
    query: MetricQuery;
    pivot: SavedChart['pivotConfig'];
    chart: SavedChart['chartConfig'];
    tableConfig?: SavedChart['tableConfig'];
};

export const chartsV1ResourceFromApi = (api: SavedChart): ChartsV1Resource => ({
    resource: 'v1beta/chart',
    uuid: api.uuid,
    name: api.name,
    description: api.description,
    explore: api.tableName,
    query: api.metricQuery,
    pivot: api.pivotConfig,
    chart: api.chartConfig,
});

export const chartsV1ResourceToPostApi = (
    resource: ChartsV1Resource,
): CreateSavedChart => ({
    name: resource.name,
    description: resource.description,
    tableName: resource.explore,
    metricQuery: resource.query,
    pivotConfig: resource.pivot,
    chartConfig: resource.chart,
    tableConfig: resource.tableConfig || {
        // TODO: should be nullable
        columnOrder: [
            ...resource.query.dimensions,
            ...resource.query.metrics,
            ...resource.query.tableCalculations.map((tc) => tc.name),
        ],
    },
});

export const chartsV1ResourceToPatchApi = (
    resource: ChartsV1Resource,
): UpdateSavedChart => ({
    name: resource.name,
    description: resource.description,
    spaceUuid: '', // TODO: should be nullable
});

export const chartsV1ResourceToNewVersionApi = (
    resource: ChartsV1Resource,
): CreateSavedChartVersion => ({
    tableName: resource.explore,
    metricQuery: resource.query,
    pivotConfig: resource.pivot,
    chartConfig: resource.chart,
    tableConfig: resource.tableConfig || {
        // TODO: should be nullable
        columnOrder: [
            ...resource.query.dimensions,
            ...resource.query.metrics,
            ...resource.query.tableCalculations.map((tc) => tc.name),
        ],
    },
});

export const chartV1ResourceIdFromUrl = (url: string) => {
    let uuid = url;
    if (url.startsWith('http')) {
        let parsed: URL;
        try {
            parsed = new URL(url);
        } catch (e) {
            throw new ParseError('Not a valid url');
        }
        [, , , , uuid] = parsed.pathname.split('/');
    }
    // todo: test if uuid is valid
    return uuid;
};
