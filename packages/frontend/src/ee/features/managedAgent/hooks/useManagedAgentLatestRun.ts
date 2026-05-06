import { type ManagedAgentRun } from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router';
import { lightdashApi } from '../../../../api';

const POLL_INTERVAL_MS = 3000;

const getLatestRun = async (
    projectUuid: string,
): Promise<ManagedAgentRun | null> =>
    lightdashApi<ManagedAgentRun | null>({
        url: `/projects/${projectUuid}/managed-agent/runs/latest`,
        method: 'GET',
        body: undefined,
    });

export const useManagedAgentLatestRun = (opts: { enabled?: boolean } = {}) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const isEnabled = opts.enabled ?? true;
    return useQuery<ManagedAgentRun | null>({
        queryKey: ['managed-agent-latest-run', projectUuid],
        queryFn: () => getLatestRun(projectUuid!),
        enabled: !!projectUuid && isEnabled,
        refetchInterval: POLL_INTERVAL_MS,
    });
};
