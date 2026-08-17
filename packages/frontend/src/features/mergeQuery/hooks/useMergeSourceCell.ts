import {
    getItemId,
    getItemMap,
    QueryExecutionContext,
    type ApiExecuteAsyncMetricQueryResults,
    type ExecuteAsyncMetricQueryRequestParams,
    type ItemsMap,
    type MergeFieldOrigins,
    type MetricQuery,
    type ParametersValuesMap,
    type ResultValue,
} from '@lightdash/common';
import { useCallback, useMemo } from 'react';
import { lightdashApi } from '../../../api';
import { type MetricQueryDataSource } from '../../../components/MetricQueryData/types';
import { useMetricQueryDataContext } from '../../../components/MetricQueryData/useMetricQueryDataContext';
import { useExplore } from '../../../hooks/useExplore';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import { convertDateFilters } from '../../../utils/dateFilter';
import { PRIMARY_SOURCE_ID } from '../constants';
import { useMergeSafe } from '../context/useMerge';

export const getMergeSourceFieldValues = (
    fieldOrigins: MergeFieldOrigins,
    fieldValues: Record<string, ResultValue>,
    sourceId: string,
): Record<string, ResultValue> =>
    Object.entries(fieldValues).reduce<Record<string, ResultValue>>(
        (sourceValues, [mergedFieldId, value]) => {
            const origin = fieldOrigins[mergedFieldId];
            if (origin?.kind === 'source' && origin.sourceId === sourceId) {
                sourceValues[origin.sourceFieldId] = value;
            } else if (origin?.kind === 'joinKey') {
                const sourceFieldId = origin.fieldIdBySourceId[sourceId];
                if (sourceFieldId) sourceValues[sourceFieldId] = value;
            }
            return sourceValues;
        },
        {},
    );

const executeSourceQuery = (
    projectUuid: string,
    metricQuery: MetricQuery,
    parameters: ParametersValuesMap | undefined,
    resolvedTimezone: string | undefined,
) =>
    lightdashApi<ApiExecuteAsyncMetricQueryResults>({
        url: `/projects/${projectUuid}/query/metric-query`,
        version: 'v2',
        method: 'POST',
        body: JSON.stringify({
            context: QueryExecutionContext.VIEW_UNDERLYING_DATA,
            query: {
                ...metricQuery,
                filters: convertDateFilters(metricQuery.filters),
                timezone: resolvedTimezone,
            },
            parameters,
        } satisfies ExecuteAsyncMetricQueryRequestParams),
    });

export type ResolvedMergeSourceCell = {
    item: ItemsMap[string];
    fieldValues: Record<string, ResultValue>;
    source: MetricQueryDataSource;
};

type PreparedMergeSourceCell = Omit<ResolvedMergeSourceCell, 'source'> & {
    source: MetricQueryDataSource & { queryUuid: string };
};

export const useMergeSourceCell = () => {
    const projectUuid = useProjectUuid();
    const merge = useMergeSafe();
    const {
        tableName,
        metricQuery: primaryMetricQuery,
        parameters,
        resolvedTimezone,
    } = useMetricQueryDataContext();
    const additionalSource = merge?.additionalSources[0];
    const { data: primaryExplore } = useExplore(tableName, {
        refetchOnMount: false,
    });
    const { data: additionalExplore } = useExplore(
        additionalSource?.exploreName ?? undefined,
        { refetchOnMount: false },
    );

    const additionalMetricQuery = useMemo<MetricQuery | null>(() => {
        if (!additionalSource?.exploreName || !primaryMetricQuery) return null;
        return {
            exploreName: additionalSource.exploreName,
            dimensions: additionalSource.dimensions,
            metrics: additionalSource.metrics,
            filters: additionalSource.filters,
            sorts: [],
            limit: primaryMetricQuery.limit,
            tableCalculations: [],
            additionalMetrics: additionalSource.additionalMetrics,
            customDimensions: additionalSource.customDimensions,
        };
    }, [additionalSource, primaryMetricQuery]);

    const primaryItemMap = useMemo(
        () =>
            primaryExplore && primaryMetricQuery
                ? getItemMap(
                      primaryExplore,
                      primaryMetricQuery.additionalMetrics,
                      primaryMetricQuery.tableCalculations,
                      primaryMetricQuery.customDimensions,
                  )
                : {},
        [primaryExplore, primaryMetricQuery],
    );
    const additionalItemMap = useMemo(
        () =>
            additionalExplore && additionalMetricQuery
                ? getItemMap(
                      additionalExplore,
                      additionalMetricQuery.additionalMetrics,
                      additionalMetricQuery.tableCalculations,
                      additionalMetricQuery.customDimensions,
                  )
                : {},
        [additionalExplore, additionalMetricQuery],
    );
    const metricQueryBySourceId = useMemo<Record<string, MetricQuery>>(
        () => ({
            ...(primaryMetricQuery
                ? { [PRIMARY_SOURCE_ID]: primaryMetricQuery }
                : {}),
            ...(additionalSource && additionalMetricQuery
                ? { [additionalSource.id]: additionalMetricQuery }
                : {}),
        }),
        [additionalMetricQuery, additionalSource, primaryMetricQuery],
    );
    const itemMapBySourceId = useMemo<Record<string, ItemsMap>>(
        () => ({
            [PRIMARY_SOURCE_ID]: primaryItemMap,
            ...(additionalSource
                ? { [additionalSource.id]: additionalItemMap }
                : {}),
        }),
        [additionalItemMap, additionalSource, primaryItemMap],
    );

    const resolve = useCallback(
        (
            mergedItem: ItemsMap[string],
            fieldValues: Record<string, ResultValue>,
        ): ResolvedMergeSourceCell | null => {
            const mergeResults = merge?.mergeResults;
            if (!mergeResults) return null;

            const origin = mergeResults.fieldOrigins[getItemId(mergedItem)];
            if (origin?.kind !== 'source') return null;

            const sourceItem =
                itemMapBySourceId[origin.sourceId]?.[origin.sourceFieldId];
            const sourceMetricQuery = metricQueryBySourceId[origin.sourceId];
            if (!sourceItem || !sourceMetricQuery) return null;

            return {
                item: sourceItem,
                fieldValues: getMergeSourceFieldValues(
                    mergeResults.fieldOrigins,
                    fieldValues,
                    origin.sourceId,
                ),
                source: {
                    tableName: sourceMetricQuery.exploreName,
                    metricQuery: sourceMetricQuery,
                },
            };
        },
        [itemMapBySourceId, merge, metricQueryBySourceId],
    );

    const prepareUnderlyingData = useCallback(
        async (
            sourceCell: ResolvedMergeSourceCell,
        ): Promise<PreparedMergeSourceCell> => {
            if (!projectUuid) throw new Error('Project is required');
            const started = await executeSourceQuery(
                projectUuid,
                sourceCell.source.metricQuery,
                parameters,
                resolvedTimezone,
            );
            return {
                ...sourceCell,
                source: {
                    ...sourceCell.source,
                    queryUuid: started.queryUuid,
                },
            };
        },
        [parameters, projectUuid, resolvedTimezone],
    );

    return { prepareUnderlyingData, resolve };
};
