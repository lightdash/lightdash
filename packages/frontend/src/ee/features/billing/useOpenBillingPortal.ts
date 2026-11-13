import { isApiError } from '@lightdash/common';
import { useMutation } from '@tanstack/react-query';
import useToaster from '../../../hooks/toaster/useToaster';
import { useLightdashApi } from '../../../providers/LightdashApi/useLightdashApi';
import { createBillingPortalLink } from './billingApi';

export function useOpenBillingPortal() {
    const lightdashApi = useLightdashApi();
    const { showToastError } = useToaster();
    const { mutateAsync, isLoading, error } = useMutation({
        mutationFn: () => createBillingPortalLink(lightdashApi),
        retry: false,
    });
    const isNotConfigured = isApiError(error) && error.error.statusCode === 404;

    const open = async () => {
        // Open the tab during the click so popup blockers allow it.
        const tab = window.open('about:blank', '_blank');
        try {
            const { url } = await mutateAsync();
            if (tab) {
                tab.opener = null;
                tab.location.replace(url);
            } else {
                window.location.assign(url);
            }
        } catch (e) {
            tab?.close();
            if (isApiError(e) && e.error.statusCode === 404) return;
            showToastError({
                title: 'Could not open the billing portal',
                subtitle:
                    isApiError(e) && e.error.statusCode === 403
                        ? e.error.message
                        : 'Please try again.',
            });
        }
    };

    return { open, isOpening: isLoading, isNotConfigured };
}
