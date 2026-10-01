import {
    type AiCreditUsageBreakdown,
    type ApiAiCreditDailyUsageResponse,
    type ApiError,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../../../api';

const getAiCreditDailyUsage = (breakdown: AiCreditUsageBreakdown) =>
    lightdashApi<ApiAiCreditDailyUsageResponse['results']>({
        url: `/org/ai-credits/usage/daily?${new URLSearchParams({ breakdown })}`,
        method: 'GET',
        body: undefined,
    });

export const useAiCreditDailyUsage = (breakdown: AiCreditUsageBreakdown) =>
    useQuery<ApiAiCreditDailyUsageResponse['results'], ApiError>({
        queryKey: ['ai-credit-daily-usage', breakdown],
        queryFn: () => getAiCreditDailyUsage(breakdown),
        // Keeps the chart in place while another breakdown loads.
        keepPreviousData: true,
        retry: false,
    });
