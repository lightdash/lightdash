import {
    type ApiCalculateSubtotalsResponse,
    type ApiError,
    type CalculateSubtotalsFromQuery,
    type MetricQuery,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router';
import { lightdashApi } from '../api';
import { convertDateFilters } from '../utils/dateFilter';

const calculateSubtotalsFromQuery = async (
    projectUuid: string,
    explore: string,
    metricQuery: MetricQuery,
    columnOrder: string[],
): Promise<ApiCalculateSubtotalsResponse['results']> => {
    const timezoneFixPayload: CalculateSubtotalsFromQuery = {
        explore: explore,
        metricQuery: {
            ...metricQuery,
            filters: convertDateFilters(metricQuery.filters),
        },
        columnOrder,
    };
    return lightdashApi<ApiCalculateSubtotalsResponse['results']>({
        url: `/projects/${projectUuid}/calculate-subtotals`,
        method: 'POST',
        body: JSON.stringify(timezoneFixPayload),
    });
};

export const useCalculateSubtotals = ({
    metricQuery,
    explore,
    showSubtotals,
    columnOrder,
}: {
    metricQuery?: MetricQuery;
    explore?: string;
    showSubtotals?: boolean;
    columnOrder?: string[];
}) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();

    return useQuery<ApiCalculateSubtotalsResponse['results'], ApiError>({
        queryKey: [
            'calculate_subtotals',
            projectUuid,
            metricQuery,
            explore,
            columnOrder,
            showSubtotals,
        ],
        queryFn: () =>
            projectUuid && metricQuery && explore && columnOrder
                ? calculateSubtotalsFromQuery(
                      projectUuid,
                      explore,
                      metricQuery,
                      columnOrder,
                  )
                : Promise.reject(),
        retry: false,
        enabled:
            !window.location.pathname.startsWith('/embed/') &&
            showSubtotals === true &&
            metricQuery !== undefined &&
            metricQuery.metrics.length > 0 &&
            columnOrder !== undefined &&
            explore !== undefined,
        onError: (result) =>
            console.error(
                `Unable to calculate subtotals from query: ${
                    result?.error?.message || result
                }`,
            ),
    });
};
