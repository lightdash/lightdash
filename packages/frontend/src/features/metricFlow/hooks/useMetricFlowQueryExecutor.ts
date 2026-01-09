import {
    convertItemTypeToDimensionType,
    QueryHistoryStatus,
    type ApiError,
    type ApiExecuteAsyncMetricQueryResults,
    type Explore,
    type ItemsMap,
    type MetricQuery,
    type ResultColumns,
} from '@lightdash/common';
import { useMemo } from 'react';
import { type InfiniteQueryResults } from '../../../hooks/useQueryResults';
import convertMetricFlowQueryResultsToResultsData from '../utils/convertMetricFlowQueryResultsToResultsData';
import { convertMetricQueryToMetricFlowQuery } from '../utils/convertMetricQueryToMetricFlowQuery';
import useMetricFlowQueryResults from './useMetricFlowQueryResults';

const buildResultColumns = (fields: ItemsMap): ResultColumns =>
    Object.entries(fields).reduce<ResultColumns>((acc, [fieldId, item]) => {
        acc[fieldId] = {
            reference: fieldId,
            type: convertItemTypeToDimensionType(item),
        };
        return acc;
    }, {});

export const useMetricFlowQueryExecutor = ({
    projectUuid,
    explore,
    metricQuery,
    missingRequiredParameters,
    enabled,
}: {
    projectUuid: string | undefined;
    explore: Explore | undefined;
    metricQuery: MetricQuery;
    missingRequiredParameters: string[] | null;
    enabled: boolean;
}) => {
    const metricFlowQuery = useMemo(() => {
        if (!enabled || !explore || missingRequiredParameters?.length) {
            return undefined;
        }
        return convertMetricQueryToMetricFlowQuery(metricQuery, explore);
    }, [enabled, explore, metricQuery, missingRequiredParameters]);

    const metricFlowQueryResults = useMetricFlowQueryResults(
        enabled ? projectUuid : undefined,
        enabled ? metricFlowQuery : undefined,
    );
    const metricFlowSql = metricFlowQueryResults.data?.query.sql ?? null;

    const resultsData = useMemo(() => {
        if (!explore || !metricFlowQueryResults.data?.query.jsonResult) {
            return undefined;
        }
        return convertMetricFlowQueryResultsToResultsData(
            explore,
            metricFlowQueryResults.data.query.jsonResult,
            metricQuery,
        );
    }, [explore, metricFlowQueryResults.data, metricQuery]);

    const queryUuid = metricFlowQueryResults.queryId;

    const queryData = useMemo<ApiExecuteAsyncMetricQueryResults | undefined>(
        () =>
            resultsData
                ? {
                      queryUuid: queryUuid || 'metricflow',
                      cacheMetadata: { cacheHit: false },
                      metricQuery: resultsData.metricQuery,
                      fields: resultsData.fields,
                      warnings: [],
                      parameterReferences: [],
                      usedParametersValues: {},
                  }
                : undefined,
        [queryUuid, resultsData],
    );

    const query = {
        data: queryData,
        error: metricFlowQueryResults.error as ApiError | null,
        isFetching: metricFlowQueryResults.isLoading,
        isInitialLoading: metricFlowQueryResults.isLoading,
        status: metricFlowQueryResults.status,
        isFetched:
            !!metricFlowQueryResults.data || !!metricFlowQueryResults.error,
    };

    const queryResults = useMemo<InfiniteQueryResults>(
        () => ({
            projectUuid,
            queryUuid: queryUuid || undefined,
            queryStatus: resultsData ? QueryHistoryStatus.READY : undefined,
            rows: resultsData?.rows ?? [],
            columns: resultsData
                ? buildResultColumns(resultsData.fields)
                : undefined,
            pivotDetails: null,
            totalResults: resultsData?.rows.length ?? 0,
            isInitialLoading: metricFlowQueryResults.isLoading,
            isFetchingFirstPage: metricFlowQueryResults.isLoading,
            isFetchingRows: metricFlowQueryResults.isLoading,
            isFetchingAllPages: false,
            fetchMoreRows: () => {},
            setFetchAll: () => {},
            fetchAll: false,
            hasFetchedAllRows: true,
            totalClientFetchTimeMs: undefined,
            error: metricFlowQueryResults.error ?? null,
        }),
        [
            projectUuid,
            queryUuid,
            resultsData,
            metricFlowQueryResults.error,
            metricFlowQueryResults.isLoading,
        ],
    );

    return {
        query,
        queryResults,
        metricFlowSql,
        metricFlowStatus: metricFlowQueryResults.status,
        metricFlowError: metricFlowQueryResults.error as ApiError | null,
    };
};
