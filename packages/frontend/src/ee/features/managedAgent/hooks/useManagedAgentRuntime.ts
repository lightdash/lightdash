import { type ApiError, type ManagedAgentRuntimeInfo } from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../../../api';

export const useManagedAgentRuntime = (projectUuid: string, enabled: boolean) =>
    useQuery<ManagedAgentRuntimeInfo, ApiError>({
        queryKey: ['managed-agent-runtime', projectUuid],
        queryFn: () =>
            lightdashApi<ManagedAgentRuntimeInfo>({
                url: `/projects/${projectUuid}/managed-agent/runtime`,
                method: 'GET',
                body: undefined,
            }),
        enabled: enabled && !!projectUuid,
    });
