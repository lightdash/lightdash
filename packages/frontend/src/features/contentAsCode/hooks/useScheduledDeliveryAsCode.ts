import { type ApiScheduledDeliveryAsCodeListResponse } from '@lightdash/common';
import { useLightdashApi } from '../../../providers/LightdashApi/useLightdashApi';
import { useContentAsCode } from './useContentAsCode';

const SCHEDULED_DELIVERY_FIELDS_TO_OMIT = ['downloadedAt'];

const selectScheduledDelivery = (
    results: ApiScheduledDeliveryAsCodeListResponse['results'],
) => results.scheduledDeliveries[0];

export const useScheduledDeliveryAsCode = ({
    projectUuid,
    deliverySlug,
    enabled,
}: {
    projectUuid: string;
    deliverySlug: string;
    enabled: boolean;
}) => {
    const lightdashApi = useLightdashApi();
    return useContentAsCode<ApiScheduledDeliveryAsCodeListResponse['results']>({
        queryKey: ['scheduled-delivery-as-code', projectUuid, deliverySlug],
        queryFn: () =>
            lightdashApi<ApiScheduledDeliveryAsCodeListResponse['results']>({
                method: 'GET',
                url: `/projects/${projectUuid}/code/scheduledDeliveries?${new URLSearchParams(
                    [['slugs', deliverySlug]],
                ).toString()}`,
                body: undefined,
            }),
        selectDocument: selectScheduledDelivery,
        enabled,
        fieldsToOmit: SCHEDULED_DELIVERY_FIELDS_TO_OMIT,
    });
};
