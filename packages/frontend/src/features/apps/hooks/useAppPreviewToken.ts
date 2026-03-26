import { type ApiError, type ApiPreviewTokenResponse } from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';

const fetchPreviewToken = async (
    projectUuid: string,
    appUuid: string,
    versionUuid: string,
): Promise<string> => {
    const data = await lightdashApi<ApiPreviewTokenResponse['results']>({
        method: 'GET',
        url: `/ee/projects/${projectUuid}/apps/${appUuid}/versions/${versionUuid}/preview-token`,
    });
    return data.token;
};

export const useAppPreviewToken = (
    projectUuid: string | undefined,
    appUuid: string | undefined,
    versionUuid: string | undefined,
) =>
    useQuery<string, ApiError>({
        queryKey: ['app-preview-token', projectUuid, appUuid, versionUuid],
        queryFn: () => fetchPreviewToken(projectUuid!, appUuid!, versionUuid!),
        enabled: !!projectUuid && !!appUuid && !!versionUuid,
    });
