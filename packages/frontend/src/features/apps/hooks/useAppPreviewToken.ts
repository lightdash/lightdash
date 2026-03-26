import { type ApiError, type ApiPreviewTokenResponse } from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';

const fetchPreviewToken = async (
    projectUuid: string,
    appUuid: string,
    version: number,
): Promise<string> => {
    const data = await lightdashApi<ApiPreviewTokenResponse['results']>({
        method: 'GET',
        url: `/ee/projects/${projectUuid}/apps/${appUuid}/versions/${version}/preview-token`,
    });
    return data.token;
};

export const useAppPreviewToken = (
    projectUuid: string | undefined,
    appUuid: string | undefined,
    version: number | undefined,
) =>
    useQuery<string, ApiError>({
        queryKey: ['app-preview-token', projectUuid, appUuid, version],
        queryFn: () => fetchPreviewToken(projectUuid!, appUuid!, version!),
        enabled:
            !!projectUuid && !!appUuid && version !== undefined && version > 0,
    });
