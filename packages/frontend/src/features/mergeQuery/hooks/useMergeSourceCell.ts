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
import { useExploreQueries } from '../../../hooks/useExplore';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import { convertDateFilters } from '../../../utils/dateFilter';
import { EMPTY_MERGE, PRIMARY_SOURCE_ID } from '../constants';
import { useMergeSafe } from '../context/useMerge';
import { getMergeSourceMetricQuery } from '../utils/getMergeSourceMetricQuery';
import { useMergeSourceNames } from './useMergeSourceNames';

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
    const { handleByName } = useMergeSourceNames();
    const {
        tableName,
        metricQuery: primaryMetricQuery,
        parameters,
        resolvedTimezone,
    } = useMetricQueryDataContext();
    const additionalSources =
        merge?.additionalSources ?? EMPTY_MERGE.additionalSources;
    const explores = useExploreQueries([
        tableName,
        ...additionalSources.map((source) => source.exploreName ?? undefined),
    ]);
    const metricQueryBySourceId = useMemo<Record<string, MetricQuery>>(
        () =>
            primaryMetricQuery
                ? Object.fromEntries([
                      [PRIMARY_SOURCE_ID, primaryMetricQuery],
                      ...additionalSources.map((source) => [
                          source.id,
                          getMergeSourceMetricQuery(
                              source,
                              primaryMetricQuery.limit,
                          ),
                      ]),
                  ])
                : {},
        [additionalSources, primaryMetricQuery],
    );
    const itemMapBySourceId = useMemo<Record<string, ItemsMap>>(
        () =>
            Object.fromEntries(
                [
                    PRIMARY_SOURCE_ID,
                    ...additionalSources.map((source) => source.id),
                ].map((id, index) => {
                    const explore = explores[index].data;
                    const query = metricQueryBySourceId[id];
                    return [
                        id,
                        explore && query
                            ? getItemMap(
                                  explore,
                                  query.additionalMetrics,
                                  query.tableCalculations,
                                  query.customDimensions,
                              )
                            : {},
                    ];
                }),
            ),
        [additionalSources, explores, metricQueryBySourceId],
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

            // Results name sources as they ran; the editor holds them by handle
            const handle = handleByName[origin.sourceId] ?? origin.sourceId;
            const sourceItem =
                itemMapBySourceId[handle]?.[origin.sourceFieldId];
            const sourceMetricQuery = metricQueryBySourceId[handle];
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
        [handleByName, itemMapBySourceId, merge, metricQueryBySourceId],
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
