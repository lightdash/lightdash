import { HotkeyConfig, IconName, useHotkeys } from '@blueprintjs/core';
import { ChartType, fieldId, FieldType, SearchResult } from '@lightdash/common';
import { useMemo, useState } from 'react';
import { useDebounce } from 'react-use';
import useGlobalSearch from '../../../hooks/globalSearch/useGlobalSearch';
import { getExplorerUrlFromCreateSavedChartVersion } from '../../../hooks/useExplorerRoute';
import { getItemIconName } from '../../Explorer/ExploreTree/TableTree/TableTree';

export type SearchItem = {
    icon: IconName;
    name: string;
    prefix?: string;
    description?: string;
    location: { pathname: string; search?: string };
    meta?: SearchResult;
};

export const useGlobalSearchHotKeys = (
    toggleSearchOpen: (val: boolean) => void,
) => {
    const hotkeys = useMemo<HotkeyConfig[]>(() => {
        return [
            {
                combo: 'mod+k',
                label: 'Show search',
                onKeyDown: () => toggleSearchOpen(true),
                global: true,
                preventDefault: true,
                stopPropagation: true,
            },
        ];
    }, [toggleSearchOpen]);
    useHotkeys(hotkeys);
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
    const { data } = useGlobalSearch(projectUuid, debouncedQuery);

    const isSearching = query && query.length > 2 && query !== debouncedQuery;

    const items = useMemo(() => {
        const spaces =
            data?.spaces.map<SearchItem>((item) => ({
                icon: 'folder-close',
                name: item.name,
                meta: item,
                location: {
                    pathname: `/projects/${projectUuid}/spaces/${item.uuid}`,
                },
            })) || [];

        const dashboards =
            data?.dashboards.map<SearchItem>((item) => ({
                icon: 'control',
                name: item.name,
                description: item.description,
                meta: item,
                location: {
                    pathname: `/projects/${projectUuid}/dashboards/${item.uuid}`,
                },
            })) || [];

        const saveCharts =
            data?.savedCharts.map<SearchItem>((item) => ({
                icon: 'chart',
                name: item.name,
                description: item.description,
                meta: item,
                location: {
                    pathname: `/projects/${projectUuid}/saved/${item.uuid}`,
                },
            })) || [];

        const tables =
            data?.tables.map<SearchItem>((item) => ({
                icon: 'th',
                prefix: `${item.exploreLabel} - `,
                name: item.label,
                description: item.description,
                meta: item,
                location: {
                    pathname: `/projects/${projectUuid}/tables/${item.explore}`,
                },
            })) || [];

        const fields =
            data?.fields.map<SearchItem>((item) => {
                const explorePath = getExplorerUrlFromCreateSavedChartVersion(
                    projectUuid,
                    {
                        tableName: item.explore,
                        metricQuery: {
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
                    icon: getItemIconName(item.type),
                    prefix: `${item.exploreLabel} - ${item.tableLabel} - `,
                    name: item.label,
                    description: item.description,
                    meta: item,
                    location: explorePath,
                };
            }) || [];

        return [...spaces, ...dashboards, ...saveCharts, ...tables, ...fields];
    }, [data, projectUuid]);

    return {
        isSearching,
        items,
    };
};
