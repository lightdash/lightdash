import {
    type ApiError,
    type ExternalConnectionApiUsage,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { useLightdashApi } from '../../../providers/LightdashApi/useLightdashApi';

export const useExternalConnectionApiUsage = (projectUuid: string) => {
    const lightdashApi = useLightdashApi();
    return useQuery<ExternalConnectionApiUsage[], ApiError>({
        queryKey: ['external-connections', projectUuid, 'api-usage'],
        queryFn: () =>
            lightdashApi<ExternalConnectionApiUsage[]>({
                url: `/ee/projects/${projectUuid}/external-connections/api-usage`,
                method: 'GET',
                body: undefined,
            }),
    });
};
