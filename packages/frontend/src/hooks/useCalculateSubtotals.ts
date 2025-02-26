import {
    getItemId,
    isField,
    isMetric,
    type ApiCalculateSubtotalsResponse,
    type ApiError,
    type CalculateSubtotalsFromQuery,
    type ItemsMap,
    type MetricQuery,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useParams } from 'react-router';
import { lightdashApi } from '../api';
import { convertDateFilters } from '../utils/dateFilter';

const calculateSubtotalsFromQuery = async (
    projectUuid: string,
    metricQuery?: MetricQuery,
    explore?: string,
    groupedDimensions?: string[],
): Promise<ApiCalculateSubtotalsResponse['results']> => {
    if (!metricQuery || !explore || !groupedDimensions) {
        throw new Error(
            'missing metricQuery, explore, or groupedDimensions on calculateSubtotalsFromQuery',
        );
    }

    const timezoneFixPayload: CalculateSubtotalsFromQuery = {
        explore: explore,
        metricQuery: {
            ...metricQuery,
            filters: convertDateFilters(metricQuery.filters),
        },
        groupedDimensions,
    };
    return lightdashApi<ApiCalculateSubtotalsResponse['results']>({
        url: `/projects/${projectUuid}/calculate-subtotals`,
        method: 'POST',
        body: JSON.stringify(timezoneFixPayload),
    });
};

const getCalculationColumnFields = (
    selectedItemIds: string[],
    itemsMap: ItemsMap,
) => {
    // This method will return the metric ids that need to be calculated in the backend
    const items = selectedItemIds
        ?.map((item) => {
            return itemsMap[item];
        })
        .filter((item) => isField(item) && isMetric(item));

    return items?.reduce<string[]>((acc, item) => {
        if (isField(item)) return [...acc, getItemId(item)];
        return acc;
    }, []);
};

export const useCalculateSubtotals = ({
    metricQuery,
    explore,
    fieldIds,
    itemsMap,
    showSubtotals,
    groupedDimensions,
}: {
    metricQuery?: MetricQuery;
    explore?: string;
    fieldIds?: string[];
    itemsMap: ItemsMap | undefined;
    showSubtotals?: boolean;
    groupedDimensions?: string[];
}) => {
    const metricsWithSubtotals = useMemo(() => {
        if (!fieldIds || !itemsMap) return [];
        if (showSubtotals === false) return [];
        return getCalculationColumnFields(fieldIds, itemsMap);
    }, [fieldIds, itemsMap, showSubtotals]);

    const { projectUuid } = useParams<{ projectUuid: string }>();

    // only add relevant fields to the key (filters, metrics, groupedDimensions)
    const queryKey = {
        filters: metricQuery?.filters,
        metrics: metricQuery?.metrics,
        additionalMetrics: metricQuery?.additionalMetrics,
        groupedDimensions,
    };

    return useQuery<ApiCalculateSubtotalsResponse['results'], ApiError>({
        queryKey: ['calculate_subtotals', projectUuid, queryKey],
        queryFn: () =>
            projectUuid
                ? calculateSubtotalsFromQuery(
                      projectUuid,
                      metricQuery,
                      explore,
                      groupedDimensions,
                  )
                : Promise.reject(),
        retry: false,
        enabled:
            !window.location.pathname.startsWith('/embed/') &&
            metricsWithSubtotals.length > 0 &&
            showSubtotals === true &&
            metricQuery !== undefined &&
            groupedDimensions !== undefined &&
            groupedDimensions.length > 0,
        onError: (result) =>
            console.error(
                `Unable to calculate subtotals from query: ${
                    result?.error?.message || result
                }`,
            ),
    });
};
