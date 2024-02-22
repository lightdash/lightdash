import {
    ChartType,
    fieldId,
    FieldType,
    isTableErrorSearchResult,
    SearchItemType,
} from '@lightdash/common';
import { useMemo, useState } from 'react';
import { useDebounce } from 'react-use';
import { getExplorerUrlFromCreateSavedChartVersion } from '../../../hooks/useExplorerRoute';
import { SearchItem } from '../types/searchItem';
import useSearch from './useSearch';

export const useDebouncedSearch = (
    projectUuid: string,
    query: string | undefined,
) => {
    const [debouncedQuery, setDebouncedQuery] = useState<string>();
    useDebounce(() => setDebouncedQuery(query), 300, [query]);

    const { data, isFetching } = useSearch(projectUuid, debouncedQuery);

    const items = useMemo(() => {
        const spaces =
            data?.spaces.map<SearchItem>((item) => ({
                type: SearchItemType.SPACE,
                title: item.name,
                item: item,
                searchRank: item.search_rank,
                location: {
                    pathname: `/projects/${projectUuid}/spaces/${item.uuid}`,
                },
            })) || [];

        const dashboards =
            data?.dashboards.map<SearchItem>((item) => ({
                type: SearchItemType.DASHBOARD,
                title: item.name,
                description: item.description,
                item: item,
                searchRank: item.search_rank,
                location: {
                    pathname: `/projects/${projectUuid}/dashboards/${item.uuid}`,
                },
            })) || [];

        const savedCharts =
            data?.savedCharts.map<SearchItem>((item) => ({
                type: SearchItemType.SAVED_CHART,
                icon: 'chart',
                title: item.name,
                description: item.description,
                item: item,
                searchRank: item.search_rank,
                location: {
                    pathname: `/projects/${projectUuid}/saved/${item.uuid}`,
                },
            })) || [];

        const tables =
            data?.tables.map<SearchItem>((item) => {
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
                    type: SearchItemType.FIELD,
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
                type: SearchItemType.PAGE,
                title: item.name,
                meta: item,
                location: { pathname: item.url },
            })) || [];

        return [
            ...spaces,
            ...dashboards,
            ...savedCharts,
            ...tables,
            ...fields,
            ...pages,
        ].sort((a, b) => {
            const aSearchRank = a.searchRank || 0;
            const bSearchRank = b.searchRank || 0;

            return bSearchRank - aSearchRank;
        });
    }, [data, projectUuid]);

    return {
        isFetching,
        items,
    };
};
