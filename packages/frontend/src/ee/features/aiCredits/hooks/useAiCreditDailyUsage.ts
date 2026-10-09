import {
    type AiCreditUsageBreakdown,
    type ApiAiCreditDailyUsageResponse,
    type ApiError,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { type LightdashApi } from '../../../../api';
import { useLightdashApi } from '../../../../providers/LightdashApi/useLightdashApi';

const getAiCreditDailyUsage = (
    lightdashApi: LightdashApi,
    breakdown: AiCreditUsageBreakdown,
) =>
    lightdashApi<ApiAiCreditDailyUsageResponse['results']>({
        url: `/org/ai-credits/usage/daily?${new URLSearchParams({ breakdown })}`,
        method: 'GET',
        body: undefined,
    });

export const useAiCreditDailyUsage = (breakdown: AiCreditUsageBreakdown) => {
    const lightdashApi = useLightdashApi();
    return useQuery<ApiAiCreditDailyUsageResponse['results'], ApiError>({
        queryKey: ['ai-credit-daily-usage', breakdown],
        queryFn: () => getAiCreditDailyUsage(lightdashApi, breakdown),
        // Keeps the chart in place while another breakdown loads.
        keepPreviousData: true,
        retry: false,
    });
};
