import {
    ChartType,
    fieldId,
    FieldType,
    isTableErrorSearchResult,
    SearchResult,
} from '@lightdash/common';
import { useMemo, useState } from 'react';
import { useDebounce } from 'react-use';
import useGlobalSearch from '../../../hooks/globalSearch/useGlobalSearch';
import { getExplorerUrlFromCreateSavedChartVersion } from '../../../hooks/useExplorerRoute';

export type SearchItem = {
    type: 'space' | 'dashboard' | 'saved_chart' | 'table' | 'field' | 'page';
    typeLabel:
        | 'Space'
        | 'Dashboard'
        | 'Chart'
        | 'Table'
        | 'Joined table'
        | 'Dimension'
        | 'Metric'
        | 'Page';
    title: string;
    prefix?: string;
    description?: string;
    location: { pathname: string; search?: string };
    item?: SearchResult;
};

export const useDebouncedSearch = (
    projectUuid: string,
    query: string | undefined,
) => {
    const [debouncedQuery, setDebouncedQuery] = useState<string>();
    useDebounce(
        () => {
            setDebouncedQuery(query);
        },
        500,
        [query],
    );
    const { data, isFetching } = useGlobalSearch(projectUuid, debouncedQuery);

    const isSearching =
        (query && query.length > 2 && query !== debouncedQuery) || isFetching;

    const items = useMemo(() => {
        const spaces =
            data?.spaces.map<SearchItem>((item) => ({
                type: 'space',
                typeLabel: 'Space',
                title: item.name,
                item: item,
                location: {
                    pathname: `/projects/${projectUuid}/spaces/${item.uuid}`,
                },
            })) || [];

        const dashboards =
            data?.dashboards.map<SearchItem>((item) => ({
                type: 'dashboard',
                typeLabel: 'Dashboard',
                title: item.name,
                description: item.description,
                item: item,
                location: {
                    pathname: `/projects/${projectUuid}/dashboards/${item.uuid}`,
                },
            })) || [];

        const saveCharts =
            data?.savedCharts.map<SearchItem>((item) => ({
                type: 'saved_chart',
                typeLabel: 'Chart',
                icon: 'chart',
                title: item.name,
                description: item.description,
                item: item,
                location: {
                    pathname: `/projects/${projectUuid}/saved/${item.uuid}`,
                },
            })) || [];

        const tables =
            data?.tables.map<SearchItem>((item) => {
                if (isTableErrorSearchResult(item)) {
                    return {
                        type: 'table',
                        typeLabel: 'Table',
                        title: item.exploreLabel,
                        item: item,
                        location: {
                            pathname: `/projects/${projectUuid}/tables`,
                        },
                    };
                }

                return {
                    type: 'table',
                    typeLabel:
                        item.name === item.explore ? 'Table' : 'Joined table',
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
            }) || [];

        const fields =
            data?.fields.map<SearchItem>((item) => {
                const explorePath = getExplorerUrlFromCreateSavedChartVersion(
                    projectUuid,
                    {
                        tableName: item.explore,
                        metricQuery: {
                            exploreName: item.explore,
                            dimensions:
                                item.fieldType === FieldType.DIMENSION
                                    ? [fieldId(item)]
                                    : [],
                            metrics:
                                item.fieldType === FieldType.METRIC
                                    ? [fieldId(item)]
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
                    type: 'field',
                    typeLabel:
                        item.fieldType === FieldType.DIMENSION
                            ? 'Dimension'
                            : 'Metric',
                    prefix:
                        item.table === item.explore
                            ? `${item.tableLabel} - `
                            : `${item.exploreLabel} - ${item.tableLabel} - `,
                    title: item.label,
                    description: item.description,
                    meta: item,
                    location: explorePath,
                };
            }) || [];

        const pages =
            data?.pages.map<SearchItem>((item) => ({
                type: 'page',
                typeLabel: 'Page',
                title: item.name,
                meta: item,
                location: { pathname: item.url },
            })) || [];
        return [
            ...spaces,
            ...dashboards,
            ...saveCharts,
            ...tables,
            ...fields,
            ...pages,
        ];
    }, [data, projectUuid]);

    return {
        isSearching,
        items,
    };
};
