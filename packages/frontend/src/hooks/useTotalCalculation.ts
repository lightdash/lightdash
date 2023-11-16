import {
    ApiError,
    CreateSavedChart,
    Field,
    fieldId as getFieldId,
    isField,
    isMetric,
    MetricQuery,
    MetricType,
    TableCalculation,
} from '@lightdash/common';
import { useQuery } from 'react-query';
import { useParams } from 'react-router-dom';
import { lightdashApi } from '../api';
import { convertDateFilters } from '../utils/dateFilter';

const getTotalCalculationFromQuery = async (
    projectUuid: string,
    payload: any,
): Promise<Record<string, number>> => {
    const timezoneFixPayload: CreateSavedChart = {
        ...payload,
        metricQuery: {
            ...payload.metricQuery,
            filters: convertDateFilters(payload.metricQuery.filters),
        },
    };
    return lightdashApi<any>({
        url: `/projects/${projectUuid}/calculate-total`,
        method: 'POST',
        body: JSON.stringify(timezoneFixPayload),
    });
};

const getTotalCalculationFromSavedChart = async (
    savedChartUuid: string,
): Promise<Record<string, number>> => {
    return lightdashApi<any>({
        url: `/saved/${savedChartUuid}/calculate-total`,
        method: 'POST',
        body: '',
    });
};

export const useTotalCalculation = (data: {
    metricQuery?: MetricQuery;
    explore?: string;
    fields?: any[];
    savedChartUuid?: string;
}) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();

    const metricQuery = data.metricQuery;
    // only add relevant fields to the key (filters, metrics)
    const queryKey = JSON.stringify({
        filters: metricQuery?.filters,
        metrics: metricQuery?.metrics,
        additionalMetrics: metricQuery?.additionalMetrics,
    });

    return useQuery<Record<string, number>, ApiError>({
        queryKey: ['total_calculation', projectUuid, queryKey],
        queryFn: () =>
            data.savedChartUuid
                ? getTotalCalculationFromSavedChart(data.savedChartUuid)
                : getTotalCalculationFromQuery(projectUuid, data),
        retry: false,
        enabled: (data?.fields || []).length > 0,
        onError: (result) =>
            console.error(
                `Unable to get total calculation from query: ${result.error.message}`,
            ),
    });
};

export const getCalculationColumnFields = (
    selectedItemIds: string[],
    itemsMap: Record<string, Field | TableCalculation>,
) => {
    //This method will return the metric ids that need to be calculated in the backend
    // We exclude metrics we already calculate
    const numericTypes: string[] = [
        MetricType.NUMBER,
        MetricType.COUNT,
        MetricType.SUM,
    ]; // We calculate these types already in the frontend

    const items = selectedItemIds
        ?.map((item) => {
            return itemsMap[item];
        })
        .filter(
            (item) =>
                isField(item) &&
                isMetric(item) &&
                !numericTypes.includes(item.type.toString()),
        );

    return items?.reduce<string[]>((acc, item) => {
        if (isField(item)) return [...acc, getFieldId(item)];
        return acc;
    }, []);
};
