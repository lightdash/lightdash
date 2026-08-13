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
import { SOURCE_A, SOURCE_B } from '../constants';
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
        metricQuery: metricQueryA,
        parameters,
        resolvedTimezone,
    } = useMetricQueryDataContext();
    const { data: exploreA } = useExplore(tableName, { refetchOnMount: false });
    const { data: exploreB } = useExplore(
        merge?.queryB.exploreName ?? undefined,
        { refetchOnMount: false },
    );

    const metricQueryB = useMemo<MetricQuery | null>(() => {
        if (!merge?.queryB.exploreName || !metricQueryA) return null;
        return {
            exploreName: merge.queryB.exploreName,
            dimensions: merge.queryB.dimensions,
            metrics: merge.queryB.metrics,
            filters: merge.filtersB,
            sorts: [],
            limit: metricQueryA.limit,
            tableCalculations: [],
            additionalMetrics: merge.queryB.additionalMetrics,
            customDimensions: merge.queryB.customDimensions,
        };
    }, [merge, metricQueryA]);

    const itemMapA = useMemo(
        () =>
            exploreA && metricQueryA
                ? getItemMap(
                      exploreA,
                      metricQueryA.additionalMetrics,
                      metricQueryA.tableCalculations,
                      metricQueryA.customDimensions,
                  )
                : {},
        [exploreA, metricQueryA],
    );
    const itemMapB = useMemo(
        () =>
            exploreB && metricQueryB
                ? getItemMap(
                      exploreB,
                      metricQueryB.additionalMetrics,
                      metricQueryB.tableCalculations,
                      metricQueryB.customDimensions,
                  )
                : {},
        [exploreB, metricQueryB],
    );

    const resolve = useCallback(
        (
            mergedItem: ItemsMap[string],
            fieldValues: Record<string, ResultValue>,
        ): ResolvedMergeSourceCell | null => {
            const mergeResults = merge?.mergeResults;
            if (!mergeResults || !metricQueryA || !metricQueryB) return null;

            const origin = mergeResults.fieldOrigins[getItemId(mergedItem)];
            if (origin?.kind !== 'source') return null;

            const isA = origin.sourceId === SOURCE_A;
            const isB = origin.sourceId === SOURCE_B;
            if (!isA && !isB) return null;
            const sourceItem = (isA ? itemMapA : itemMapB)[
                origin.sourceFieldId
            ];
            if (!sourceItem) return null;

            return {
                item: sourceItem,
                fieldValues: getMergeSourceFieldValues(
                    mergeResults.fieldOrigins,
                    fieldValues,
                    origin.sourceId,
                ),
                source: {
                    tableName: isA ? tableName : metricQueryB.exploreName,
                    metricQuery: isA ? metricQueryA : metricQueryB,
                },
            };
        },
        [itemMapA, itemMapB, merge, metricQueryA, metricQueryB, tableName],
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
