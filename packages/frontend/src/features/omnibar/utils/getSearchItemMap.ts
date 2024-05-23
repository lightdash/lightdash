import {
    ChartType,
    FieldType,
    getItemId,
    isTableErrorSearchResult,
    SearchItemType,
    type SearchResults,
} from '@lightdash/common';
import { getExplorerUrlFromCreateSavedChartVersion } from '../../../hooks/useExplorerRoute';
import { type SearchItem } from '../types/searchItem';

export const getSearchItemMap = (
    results: SearchResults,
    projectUuid: string,
) => {
    const spaces = results.spaces.map<SearchItem>((item) => ({
        type: SearchItemType.SPACE,
        title: item.name,
        item: item,
        searchRank: item.search_rank,
        location: {
            pathname: `/projects/${projectUuid}/spaces/${item.uuid}`,
        },
    }));

    const dashboards = results.dashboards.map<SearchItem>((item) => ({
        type: SearchItemType.DASHBOARD,
        title: item.name,
        description: item.description,
        item: item,
        searchRank: item.search_rank,
        location: {
            pathname: `/projects/${projectUuid}/dashboards/${item.uuid}`,
        },
    }));

    const savedCharts = results.savedCharts.map<SearchItem>((item) => ({
        type: SearchItemType.CHART,
        icon: 'chart',
        title: item.name,
        description: item.description,
        item: item,
        searchRank: item.search_rank,
        location: {
            pathname: `/projects/${projectUuid}/saved/${item.uuid}`,
        },
    }));

    const tables = results.tables.map<SearchItem>((item) => {
        if (isTableErrorSearchResult(item)) {
            return {
                type: SearchItemType.TABLE,
                typeLabel: 'Table',
                title: item.exploreLabel,
                item: item,
                location: {
                    pathname: `/projects/${projectUuid}/tables`,
                },
            };
        }

        return {
            type: SearchItemType.TABLE,
            typeLabel: item.name === item.explore ? 'Table' : 'Joined table',
            prefix:
                item.name === item.explore
                    ? undefined
                    : `${item.exploreLabel} - `,
            title: item.label,
            description: item.description,
            item: item,
            location: {
                pathname: `/projects/${projectUuid}/tables/${item.explore}`,
            },
        };
    });

    const fields = results.fields.map<SearchItem>((item) => {
        const explorePath = getExplorerUrlFromCreateSavedChartVersion(
            projectUuid,
            {
                tableName: item.explore,
                metricQuery: {
                    exploreName: item.explore,
                    dimensions:
                        item.fieldType === FieldType.DIMENSION
                            ? [getItemId(item)]
                            : [],
                    metrics:
                        item.fieldType === FieldType.METRIC
                            ? [getItemId(item)]
                            : [],
                    filters: {},
                    sorts: [],
                    limit: 500,
                    tableCalculations: [],
                },
                chartConfig: {
                    type: ChartType.CARTESIAN,
                    config: {
                        layout: {},
                        eChartsConfig: {},
                    },
                },
                tableConfig: {
                    columnOrder: [],
                },
            },
        );
        return {
            type: SearchItemType.FIELD,
            typeLabel:
                item.fieldType === FieldType.DIMENSION ? 'Dimension' : 'Metric',
            prefix:
                item.table === item.explore
                    ? `${item.tableLabel} - `
                    : `${item.exploreLabel} - ${item.tableLabel} - `,
            title: item.label,
            description: item.description,
            meta: item,
            location: explorePath,
        };
    });

    const pages = results.pages.map<SearchItem>((item) => ({
        type: SearchItemType.PAGE,
        title: item.name,
        meta: item,
        location: { pathname: item.url },
    }));

    return {
        spaces,
        dashboards,
        savedCharts,
        tables,
        fields,
        pages,
    };
};
