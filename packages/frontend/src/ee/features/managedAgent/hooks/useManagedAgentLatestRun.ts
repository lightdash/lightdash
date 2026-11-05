import { ManagedAgentRunStatus, type ManagedAgentRun } from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { type LightdashApi } from '../../../../api';
import { useProjectUuid } from '../../../../hooks/useProjectUuid';
import { useLightdashApi } from '../../../../providers/LightdashApi/useLightdashApi';

const POLL_INTERVAL_RUNNING_MS = 3000;
const POLL_INTERVAL_IDLE_MS = 30000;

const getLatestRun = async (
    lightdashApi: LightdashApi,
    projectUuid: string,
): Promise<ManagedAgentRun | null> =>
    lightdashApi<ManagedAgentRun | null>({
        url: `/projects/${projectUuid}/managed-agent/runs/latest`,
        method: 'GET',
        body: undefined,
    });

export const useManagedAgentLatestRun = (opts: { enabled?: boolean } = {}) => {
    const lightdashApi = useLightdashApi();
    const projectUuid = useProjectUuid();
    const isEnabled = opts.enabled ?? true;
    return useQuery<ManagedAgentRun | null>({
        queryKey: ['managed-agent-latest-run', projectUuid],
        queryFn: () => getLatestRun(lightdashApi, projectUuid!),
        enabled: !!projectUuid && isEnabled,
        refetchInterval: (data) =>
            data?.status === ManagedAgentRunStatus.STARTED
                ? POLL_INTERVAL_RUNNING_MS
                : POLL_INTERVAL_IDLE_MS,
    });
};
