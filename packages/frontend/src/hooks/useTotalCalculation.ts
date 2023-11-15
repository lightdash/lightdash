import {
    ApiError,
    CreateSavedChart,
    MetricQuery,
    SavedChart,
} from '@lightdash/common';
import { useQuery } from 'react-query';
import { useParams } from 'react-router-dom';
import { lightdashApi } from '../api';
import { convertDateFilters } from '../utils/dateFilter';
import useToaster from './toaster/useToaster';

const getTotalCalculation = async (
    projectUuid: string,
    payload: any,
): Promise<SavedChart> => {
    const timezoneFixPayload: CreateSavedChart = {
        ...payload,
        metricQuery: {
            ...payload.metricQuery,
            filters: convertDateFilters(payload.metricQuery.filters),
        },
    };
    return lightdashApi<SavedChart>({
        url: `/projects/${projectUuid}/calculate-total`,
        method: 'POST',
        body: JSON.stringify(timezoneFixPayload),
    });
};

export const useTotalCalculation = (data: {
    metricQuery?: MetricQuery;
    fields?: any[];
}) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { showToastError } = useToaster();

    return useQuery<SavedChart, ApiError>({
        queryKey: ['total_calculation', projectUuid],
        queryFn: () => getTotalCalculation(projectUuid, data),
        retry: false,
        enabled: (data?.fields || []).length > 0,
        onError: (result) =>
            showToastError({
                title: `Unable to get total calculation from query`,
                subtitle: result.error.message,
            }),
    });
};
