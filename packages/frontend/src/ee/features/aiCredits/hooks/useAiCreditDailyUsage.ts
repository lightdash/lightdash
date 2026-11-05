import {
    type ApiAiCreditDailyUsageResponse,
    type ApiError,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { type LightdashApi } from '../../../../api';
import { useLightdashApi } from '../../../../providers/LightdashApi/useLightdashApi';

const getAiCreditDailyUsage = (lightdashApi: LightdashApi) =>
    lightdashApi<ApiAiCreditDailyUsageResponse['results']>({
        url: '/org/ai-credits/usage/daily',
        method: 'GET',
        body: undefined,
    });

export const useAiCreditDailyUsage = () => {
    const lightdashApi = useLightdashApi();
    return useQuery<ApiAiCreditDailyUsageResponse['results'], ApiError>({
        queryKey: ['ai-credit-daily-usage'],
        queryFn: () => getAiCreditDailyUsage(lightdashApi),
        retry: false,
    });
};
