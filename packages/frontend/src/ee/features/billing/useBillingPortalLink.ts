import { isApiError } from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { useLightdashApi } from '../../../providers/LightdashApi/useLightdashApi';
import { createBillingPortalLink } from './billingApi';

export function useBillingPortalLink() {
    const lightdashApi = useLightdashApi();
    const { data, isInitialLoading, error } = useQuery({
        queryKey: ['billing-portal-link'],
        queryFn: () => createBillingPortalLink(lightdashApi),
        retry: false,
        refetchOnWindowFocus: false,
        cacheTime: 0,
    });

    return {
        url: data?.url ?? null,
        isLoading: isInitialLoading,
        isNotConfigured: isApiError(error) && error.error.statusCode === 404,
    };
}
