import {
    type ApiAiCreditUsageResponse,
    type ApiError,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { type LightdashApi } from '../../../../api';
import { useLightdashApi } from '../../../../providers/LightdashApi/useLightdashApi';

const getAiCreditUsage = (lightdashApi: LightdashApi) =>
    lightdashApi<ApiAiCreditUsageResponse['results']>({
        url: '/org/ai-credits/usage',
        method: 'GET',
        body: undefined,
    });

export const useAiCreditUsage = ({ enabled }: { enabled: boolean }) => {
    const lightdashApi = useLightdashApi();
    return useQuery<ApiAiCreditUsageResponse['results'], ApiError>({
        queryKey: ['ai-credit-usage'],
        queryFn: () => getAiCreditUsage(lightdashApi),
        enabled,
        retry: false,
    });
};
