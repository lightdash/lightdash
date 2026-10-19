import { type ApiError, type ManagedAgentRuntimeInfo } from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { useLightdashApi } from '../../../../providers/LightdashApi/useLightdashApi';

export const useManagedAgentRuntime = (
    projectUuid: string,
    enabled: boolean,
) => {
    const lightdashApi = useLightdashApi();
    return useQuery<ManagedAgentRuntimeInfo, ApiError>({
        queryKey: ['managed-agent-runtime', projectUuid],
        queryFn: () =>
            lightdashApi<ManagedAgentRuntimeInfo>({
                url: `/projects/${projectUuid}/managed-agent/runtime`,
                method: 'GET',
                body: undefined,
            }),
        enabled: enabled && !!projectUuid,
    });
};

// True when the runtime has a configuration error or a cleanup downgrade
// notice worth showing outside the setup modal.
export const hasManagedAgentRuntimeAlert = (
    runtime: ReturnType<typeof useManagedAgentRuntime>,
): boolean =>
    runtime.isError || !!runtime.data?.error || !!runtime.data?.notice;
