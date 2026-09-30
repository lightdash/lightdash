import {
    type ApiAiCreditUsageResponse,
    type ApiError,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../../../api';

const getAiCreditUsage = () =>
    lightdashApi<ApiAiCreditUsageResponse['results']>({
        url: '/org/ai-credits/usage',
        method: 'GET',
        body: undefined,
    });

export const useAiCreditUsage = ({ enabled }: { enabled: boolean }) =>
    useQuery<ApiAiCreditUsageResponse['results'], ApiError>({
        queryKey: ['ai-credit-usage'],
        queryFn: getAiCreditUsage,
        enabled,
        retry: false,
    });
