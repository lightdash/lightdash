import {
    type DataAppViewContext,
    type ApiError,
    type ApiPreviewTokenResponse,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';
import {
    getPreviewTokenRefetchInterval,
    previewTokenQueryOptions,
} from './previewTokenQueryOptions';

const fetchPreviewToken = async (
    projectUuid: string,
    appUuid: string,
    version: number,
    viewContext: DataAppViewContext,
): Promise<string> => {
    const data = await lightdashApi<ApiPreviewTokenResponse['results']>({
        method: 'GET',
        url: `/ee/projects/${projectUuid}/apps/${appUuid}/versions/${version}/preview-token?viewContext=${viewContext}`,
    });
    return data.token;
};

export const useAppPreviewToken = (
    projectUuid: string | undefined,
    appUuid: string | undefined,
    version: number | undefined,
    viewContext: DataAppViewContext = 'unknown',
) =>
    useQuery<string, ApiError>({
        queryKey: [
            'app-preview-token',
            projectUuid,
            appUuid,
            version,
            viewContext,
        ],
        queryFn: () =>
            fetchPreviewToken(projectUuid!, appUuid!, version!, viewContext),
        enabled:
            !!projectUuid && !!appUuid && version !== undefined && version > 0,
        refetchInterval: (_data, query) =>
            getPreviewTokenRefetchInterval(query.state.error),
        ...previewTokenQueryOptions,
    });
