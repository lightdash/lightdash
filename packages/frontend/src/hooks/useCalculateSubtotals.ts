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
    metricQuery?: MetricQuery,
    explore?: string,
): Promise<ApiCalculateSubtotalsResponse['results']> => {
    if (!metricQuery || !explore) {
        throw new Error(
            'missing metricQuery and explore on calculateSubtotalsFromQuery',
        );
    }

    const timezoneFixPayload: CalculateSubtotalsFromQuery = {
        explore: explore,
        metricQuery: {
            ...metricQuery,
            filters: convertDateFilters(metricQuery.filters),
        },
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
}: {
    metricQuery?: MetricQuery;
    explore?: string;
    showSubtotals?: boolean;
}) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();

    return useQuery<ApiCalculateSubtotalsResponse['results'], ApiError>({
        queryKey: ['calculate_subtotals', projectUuid, metricQuery, explore],
        queryFn: () =>
            projectUuid
                ? calculateSubtotalsFromQuery(projectUuid, metricQuery, explore)
                : Promise.reject(),
        retry: false,
        enabled:
            showSubtotals === true &&
            metricQuery !== undefined &&
            metricQuery.metrics.length > 0,
        onError: (result) =>
            console.error(
                `Unable to calculate subtotals from query: ${
                    result?.error?.message || result
                }`,
            ),
    });
};
