import {
    type ApiError,
    type AppExternalConnectionLinked,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { type LightdashApi } from '../../../api';
import { useLightdashApi } from '../../../providers/LightdashApi/useLightdashApi';

export const getAppExternalConnections = async (
    lightdashApi: LightdashApi,
    projectUuid: string,
    appUuid: string,
) =>
    lightdashApi<AppExternalConnectionLinked[]>({
        url: `/ee/projects/${projectUuid}/apps/${appUuid}/external-connections`,
        method: 'GET',
        body: undefined,
    });

export const useAppExternalConnections = (
    projectUuid: string | undefined,
    appUuid: string | undefined,
) => {
    const lightdashApi = useLightdashApi();
    return useQuery<AppExternalConnectionLinked[], ApiError>({
        queryKey: ['app-external-connections', projectUuid, appUuid],
        queryFn: () =>
            getAppExternalConnections(lightdashApi, projectUuid!, appUuid!),
        enabled: !!projectUuid && !!appUuid,
    });
};
