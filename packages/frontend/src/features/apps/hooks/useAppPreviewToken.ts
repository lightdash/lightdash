import { type ApiError, type ApiPreviewTokenResponse } from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';
import {
    appApiBase,
    appPreviewTokenQueryKey,
    type ChartTypeOwner,
} from '../../chartTypes/utils/chartTypeOwner';
import {
    getPreviewTokenRefetchInterval,
    previewTokenQueryOptions,
} from './previewTokenQueryOptions';

const fetchPreviewToken = async (
    projectUuid: string,
    appUuid: string,
    version: number,
    owner: ChartTypeOwner,
): Promise<string> => {
    const data = await lightdashApi<ApiPreviewTokenResponse['results']>({
        method: 'GET',
        url: `${appApiBase(owner, projectUuid)}/${appUuid}/versions/${version}/preview-token`,
    });
    return data.token;
};

export const useAppPreviewToken = (
    projectUuid: string | undefined,
    appUuid: string | undefined,
    version: number | undefined,
    owner: ChartTypeOwner,
) =>
    useQuery<string, ApiError>({
        queryKey: appPreviewTokenQueryKey(owner, projectUuid, appUuid, version),
        queryFn: () =>
            fetchPreviewToken(projectUuid!, appUuid!, version!, owner),
        enabled:
            !!projectUuid && !!appUuid && version !== undefined && version > 0,
        refetchInterval: (_data, query) =>
            getPreviewTokenRefetchInterval(query.state.error),
        ...previewTokenQueryOptions,
    });
