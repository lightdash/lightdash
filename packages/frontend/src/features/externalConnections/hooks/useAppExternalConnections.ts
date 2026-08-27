import {
    type ApiError,
    type AppExternalConnectionLink,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';

const getAppExternalConnections = async (
    projectUuid: string,
    appUuid: string,
) =>
    lightdashApi<AppExternalConnectionLink[]>({
        url: `/ee/projects/${projectUuid}/apps/${appUuid}/external-connections`,
        method: 'GET',
        body: undefined,
    });

export const useAppExternalConnections = (
    projectUuid: string | undefined,
    appUuid: string | undefined,
) =>
    useQuery<AppExternalConnectionLink[], ApiError>({
        queryKey: ['app-external-connections', projectUuid, appUuid],
        queryFn: () => getAppExternalConnections(projectUuid!, appUuid!),
        enabled: !!projectUuid && !!appUuid,
    });
