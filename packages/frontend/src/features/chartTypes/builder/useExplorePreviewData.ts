import {
    getItemId,
    getVisibleFields,
    isDimension,
    type Item,
    type ItemsMap,
    type ReadyQueryResultsPage,
    type ResultRow,
} from '@lightdash/common';
import { useDebouncedValue } from '@mantine/hooks';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useExploreByProjectUuid } from '../../../hooks/useExplore';
import {
    buildExplorePreviewMetricQuery,
    executeExplorePreviewQuery,
} from '../utils/explorePreviewQuery';
import { getDataAppVizFieldItems } from '../utils/getDataAppVizFieldItems';
import { type SavedChartPreviewQueryResult } from '../utils/savedChartPreviewQuery';
import { type ExploreFieldOption } from './exploreSource';

/** How long a change to the field set settles before the query re-runs. */
const FIELD_CHANGE_DEBOUNCE_MS = 400;

/** A finished run, in the shape the saved-chart preview produces. */
export type LivePreviewRun = {
    rows: ResultRow[];
    itemsMap: ItemsMap;
    /** Result columns, dimensions before metrics. */
    columns: Item[];
    pivotDetails: ReadyQueryResultsPage['pivotDetails'];
    rowCount: number;
    ranAt: Date;
};

export type LoadedExplore = {
    name: string;
    label: string;
    joinedTableLabels: string[];
    /** Visible fields, dimensions before metrics. */
    fields: ExploreFieldOption[];
    /** The same visible fields keyed by item id: what inputs bind against. */
    itemsMap: ItemsMap;
};

export type AttachedExploreData = {
    /** Null while nothing is attached, or the explore is loading or failed. */
    explore: LoadedExplore | null;
    /** Why the explore failed to load; null otherwise. */
    error: string | null;
    retry: () => void;
};

export type ExplorePreviewRun = {
    run:
        | { status: 'idle' }
        | { status: 'running' }
        | { status: 'error'; message: string }
        | ({ status: 'ready' } & LivePreviewRun);
    /** A run is pending or in flight; a ready run keeps its rows meanwhile. */
    isRunning: boolean;
    retry: () => void;
};

/** Base-table fields read as their own label; joined ones carry their table. */
const toFieldOption = (
    item: ExploreFieldOption['item'],
    baseTable: string,
): ExploreFieldOption => ({
    id: getItemId(item),
    label:
        item.table === baseTable
            ? item.label
            : `${item.tableLabel} ${item.label}`,
    item,
});

/** Load the attached explore and the visible fields its inputs can bind. */
export const useAttachedExplore = ({
    projectUuid,
    exploreName,
    enabled,
}: {
    projectUuid: string | undefined;
    exploreName: string | null;
    enabled: boolean;
}): AttachedExploreData => {
    const { data, error, refetch } = useExploreByProjectUuid(
        enabled ? (exploreName ?? undefined) : undefined,
        projectUuid,
    );

    const explore = useMemo<LoadedExplore | null>(() => {
        if (!data || data.name !== exploreName) return null;
        const fields = getVisibleFields(data)
            .map((item) => toFieldOption(item, data.baseTable))
            .sort(
                (a, b) =>
                    Number(!isDimension(a.item)) - Number(!isDimension(b.item)),
            );
        return {
            name: data.name,
            label: data.label,
            joinedTableLabels: data.joinedTables.map(
                (join) => data.tables[join.table]?.label ?? join.table,
            ),
            fields,
            itemsMap: Object.fromEntries(
                fields.map((field) => [field.id, field.item]),
            ),
        };
    }, [data, exploreName]);

    return useMemo(
        () => ({
            explore: enabled ? explore : null,
            error: enabled && error ? error.error.message : null,
            retry: () => void refetch(),
        }),
        [enabled, error, explore, refetch],
    );
};

/**
 * Run an ad-hoc query over the explore fields the chart inputs are bound to.
 * The field set is debounced so a burst of changes runs once; the previous
 * rows stay on screen while a changed set re-runs.
 */
export const useExplorePreviewData = ({
    projectUuid,
    explore,
    fieldIds,
}: {
    projectUuid: string | undefined;
    /** Null runs nothing. */
    explore: LoadedExplore | null;
    fieldIds: string[];
}): ExplorePreviewRun => {
    const exploreName = explore?.name ?? null;
    const fieldKey = explore
        ? fieldIds.filter((id) => id in explore.itemsMap).join(',')
        : '';
    const [debouncedFieldKey] = useDebouncedValue(
        fieldKey,
        FIELD_CHANGE_DEBOUNCE_MS,
    );

    const canRun =
        Boolean(projectUuid) && explore !== null && debouncedFieldKey !== '';
    const query = useQuery<
        SavedChartPreviewQueryResult & { exploreName: string },
        Error
    >({
        queryKey: [
            'chart-type-explore-preview',
            projectUuid,
            exploreName,
            debouncedFieldKey,
        ],
        queryFn: async () => ({
            ...(await executeExplorePreviewQuery({
                projectUuid: projectUuid ?? '',
                query: buildExplorePreviewMetricQuery(
                    exploreName ?? '',
                    explore?.itemsMap ?? {},
                    debouncedFieldKey.split(','),
                ),
            })),
            exploreName: exploreName ?? '',
        }),
        enabled: canRun,
        keepPreviousData: true,
        retry: false,
        refetchOnWindowFocus: false,
        staleTime: Infinity,
    });

    const { error, refetch, isFetching, dataUpdatedAt } = query;
    // Rows kept from an earlier set only count while they belong to this
    // explore and something is still bound.
    const data =
        query.data && query.data.exploreName === exploreName && fieldKey !== ''
            ? query.data
            : null;

    return useMemo<ExplorePreviewRun>(() => {
        const retry = () => {
            if (canRun) void refetch();
        };
        const isRunning =
            fieldKey !== '' &&
            (fieldKey !== debouncedFieldKey || isFetching || (!data && !error));
        if (fieldKey === '') {
            return { run: { status: 'idle' }, isRunning: false, retry };
        }
        if (error && !isFetching && fieldKey === debouncedFieldKey) {
            return {
                run: { status: 'error', message: error.message },
                isRunning: false,
                retry,
            };
        }
        if (!data) return { run: { status: 'running' }, isRunning, retry };
        const { dimensions, metrics } = getDataAppVizFieldItems(data.itemsMap);
        return {
            run: {
                status: 'ready',
                rows: data.rows,
                itemsMap: data.itemsMap,
                columns: [...dimensions, ...metrics],
                pivotDetails: data.pivotDetails,
                rowCount: data.rows.length,
                ranAt: new Date(dataUpdatedAt),
            },
            isRunning,
            retry,
        };
    }, [
        canRun,
        data,
        dataUpdatedAt,
        debouncedFieldKey,
        error,
        fieldKey,
        isFetching,
        refetch,
    ]);
};
