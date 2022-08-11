import { HotkeyConfig, IconName, useHotkeys } from '@blueprintjs/core';
import { ChartType, fieldId, FieldType, SearchResult } from '@lightdash/common';
import { useMemo, useState } from 'react';
import { useDebounce } from 'react-use';
import useGlobalSearch from '../../../hooks/globalSearch/useGlobalSearch';
import { getExplorerUrlFromCreateSavedChartVersion } from '../../../hooks/useExplorerRoute';
import { useTracking } from '../../../providers/TrackingProvider';
import { EventName } from '../../../types/Events';
import { getItemIconName } from '../../Explorer/ExploreTree/TableTree/Tree/TreeSingleNode';

export type SearchItem = {
    type: 'space' | 'dashboard' | 'saved_chart' | 'table' | 'field';
    typeLabel:
        | 'Space'
        | 'Dashboard'
        | 'Chart'
        | 'Table'
        | 'Joined table'
        | 'Dimension'
        | 'Metric';
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
    const { track } = useTracking();
    const hotkeys = useMemo<HotkeyConfig[]>(() => {
        return [
            {
                combo: 'mod+k',
                label: 'Show search',
                onKeyDown: () => {
                    track({
                        name: EventName.GLOBAL_SEARCH_OPEN,
                        properties: {
                            action: 'hotkeys',
                        },
                    });
                    toggleSearchOpen(true);
                },
                global: true,
                preventDefault: true,
                stopPropagation: true,
                allowInInput: true,
            },
        ];
    }, [toggleSearchOpen, track]);
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
                type: 'space',
                typeLabel: 'Space',
                icon: 'folder-close',
                name: item.name,
                meta: item,
                location: {
                    pathname: `/projects/${projectUuid}/spaces/${item.uuid}`,
                },
            })) || [];

        const dashboards =
            data?.dashboards.map<SearchItem>((item) => ({
                type: 'dashboard',
                typeLabel: 'Dashboard',
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
                type: 'saved_chart',
                typeLabel: 'Chart',
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
                type: 'table',
                typeLabel:
                    item.name === item.explore ? 'Table' : 'Joined table',
                icon: 'th',
                prefix:
                    item.name === item.explore
                        ? undefined
                        : `${item.exploreLabel} - `,
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
                    type: 'field',
                    typeLabel:
                        item.fieldType === FieldType.DIMENSION
                            ? 'Dimension'
                            : 'Metric',
                    icon: getItemIconName(item.type),
                    prefix:
                        item.table === item.explore
                            ? `${item.tableLabel} - `
                            : `${item.exploreLabel} - ${item.tableLabel} - `,
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
