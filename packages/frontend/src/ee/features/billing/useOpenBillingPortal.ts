import { isApiError } from '@lightdash/common';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import useToaster from '../../../hooks/toaster/useToaster';
import { useLightdashApi } from '../../../providers/LightdashApi/useLightdashApi';
import useTracking from '../../../providers/Tracking/useTracking';
import { EventName } from '../../../types/Events';
import { createBillingPortalLink } from './billingApi';

const QUERY_KEY = ['billing-portal-link'];
// Portal links are short-lived, so a link older than this is replaced on click.
const LINK_MAX_AGE_MS = 60 * 1000;

export function useOpenBillingPortal() {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    const { showToastError } = useToaster();
    const { track } = useTracking();
    const [isOpening, setIsOpening] = useState(false);
    const queryFn = () => createBillingPortalLink(lightdashApi);
    const { isInitialLoading, isSuccess, error } = useQuery({
        queryKey: QUERY_KEY,
        queryFn,
        retry: false,
        refetchOnWindowFocus: false,
        cacheTime: 0,
    });
    const isNotConfigured = isApiError(error) && error.error.statusCode === 404;

    const open = async () => {
        track({ name: EventName.BILLING_PORTAL_BUTTON_CLICKED });
        // Open the tab during the click so popup blockers allow it.
        const tab = window.open('about:blank', '_blank');
        setIsOpening(true);
        try {
            const { url } = await queryClient.fetchQuery({
                queryKey: QUERY_KEY,
                queryFn,
                staleTime: LINK_MAX_AGE_MS,
                retry: false,
            });
            if (tab) {
                tab.opener = null;
                tab.location.replace(url);
            } else {
                window.location.assign(url);
            }
        } catch (e) {
            tab?.close();
            showToastError({
                title: 'Could not open the billing portal',
                subtitle:
                    isApiError(e) && e.error.statusCode === 403
                        ? e.error.message
                        : 'Please try again.',
            });
        } finally {
            setIsOpening(false);
        }
    };

    return {
        open,
        isOpening,
        isLoading: isInitialLoading,
        isAvailable: isSuccess,
        isNotConfigured,
    };
}
