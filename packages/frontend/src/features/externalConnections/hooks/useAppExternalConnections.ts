import {
    type ApiError,
    type AppExternalConnectionLinked,
} from '@lightdash/common'; // pragma: allowlist secret (product-name false positive)
import { useQuery } from '@tanstack/react-query';
import { lightdashApi as api } from '../../../api'; // pragma: allowlist secret (product-name false positive)

const getAppExternalConnections = async (
    projectUuid: string,
    appUuid: string,
) =>
    api<AppExternalConnectionLinked[]>({
        url: `/ee/projects/${projectUuid}/apps/${appUuid}/external-connections`,
        method: 'GET',
        body: undefined,
    });

export const useAppExternalConnections = (
    projectUuid: string | undefined,
    appUuid: string | undefined,
) =>
    useQuery<AppExternalConnectionLinked[], ApiError>({
        queryKey: ['app-external-connections', projectUuid, appUuid],
        queryFn: () => getAppExternalConnections(projectUuid!, appUuid!),
        enabled: !!projectUuid && !!appUuid,
    });
