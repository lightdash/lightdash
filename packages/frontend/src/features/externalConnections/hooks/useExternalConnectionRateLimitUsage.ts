import {
    type ApiError,
    type ExternalConnectionRateLimitUsage,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { useLightdashApi } from '../../../providers/LightdashApi/useLightdashApi';

/** A live source's rate-limit usage, read once when the page opens. */
export const useExternalConnectionRateLimitUsage = ({
    projectUuid,
    connectionUuid,
}: {
    projectUuid: string;
    connectionUuid: string;
}) => {
    const lightdashApi = useLightdashApi();
    return useQuery<ExternalConnectionRateLimitUsage, ApiError>({
        queryKey: [
            'external-connections',
            projectUuid,
            connectionUuid,
            'rate-limits',
        ],
        queryFn: () =>
            lightdashApi<ExternalConnectionRateLimitUsage>({
                url: `/ee/projects/${projectUuid}/external-connections/${connectionUuid}/rate-limits`,
                method: 'GET',
                body: undefined,
            }),
        refetchOnWindowFocus: false,
    });
};
