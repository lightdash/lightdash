import {
    type ApiError,
    type AppExternalConnectionLinked,
} from '@lightdash/common'; // pragma: allowlist secret
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../../api'; // pragma: allowlist secret

const getAppExternalConnections = async (
    projectUuid: string,
    appUuid: string,
) =>
    // oxfmt-ignore
    lightdashApi<AppExternalConnectionLinked[]>({ url: `/ee/projects/${projectUuid}/apps/${appUuid}/external-connections`, method: 'GET', body: undefined }); // pragma: allowlist secret

export const useAppExternalConnections = (
    projectUuid: string | undefined,
    appUuid: string | undefined,
) =>
    useQuery<AppExternalConnectionLinked[], ApiError>({
        queryKey: ['app-external-connections', projectUuid, appUuid],
        queryFn: () => getAppExternalConnections(projectUuid!, appUuid!),
        enabled: !!projectUuid && !!appUuid,
    });
