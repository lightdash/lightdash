import {
    type ApiError,
    type ExternalConnectionLinkedApps,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';

const getExternalConnectionLinkedApps = async (
    projectUuid: string,
    connectionUuid: string,
) =>
    lightdashApi<ExternalConnectionLinkedApps>({
        url: `/ee/projects/${projectUuid}/external-connections/${connectionUuid}/linked-apps`,
        method: 'GET',
        body: undefined,
    });

export const useExternalConnectionLinkedApps = (
    projectUuid: string | undefined,
    connectionUuid: string | undefined,
) =>
    useQuery<ExternalConnectionLinkedApps, ApiError>({
        queryKey: [
            'external-connection-linked-apps',
            projectUuid,
            connectionUuid,
        ],
        queryFn: () =>
            getExternalConnectionLinkedApps(projectUuid!, connectionUuid!),
        enabled: !!projectUuid && !!connectionUuid,
    });
