import {
    type ApiContentAsCodeSettingsResponse,
    type ApiError,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { useLightdashApi } from '../../../providers/LightdashApi/useLightdashApi';

const CONTENT_AS_CODE_SETTINGS_QUERY_KEY = 'content-as-code-settings';

// The content_as_code flags last stamped on the project by an upload or pull
export const useContentAsCodeSettings = (projectUuid: string | undefined) => {
    const lightdashApi = useLightdashApi();
    return useQuery<ApiContentAsCodeSettingsResponse['results'], ApiError>({
        queryKey: [CONTENT_AS_CODE_SETTINGS_QUERY_KEY, projectUuid],
        queryFn: () =>
            lightdashApi<ApiContentAsCodeSettingsResponse['results']>({
                url: `/projects/${projectUuid}/code/sync-settings`,
                method: 'GET',
                body: undefined,
            }),
        enabled: projectUuid !== undefined,
    });
};
