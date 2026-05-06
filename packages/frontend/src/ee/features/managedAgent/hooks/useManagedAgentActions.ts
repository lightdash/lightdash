import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router';
import { lightdashApi } from '../../../../api';
import type { ManagedAgentAction } from '../types';

const getActions = async (projectUuid: string): Promise<ManagedAgentAction[]> =>
    lightdashApi<ManagedAgentAction[]>({
        url: `/projects/${projectUuid}/managed-agent/actions`,
        method: 'GET',
        body: undefined,
    });

export const useManagedAgentActions = (
    opts: { enabled?: boolean; fastPoll?: boolean } = {},
) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const isEnabled = opts.enabled ?? true;
    return useQuery<ManagedAgentAction[]>({
        queryKey: ['managed-agent-actions', projectUuid],
        queryFn: () => getActions(projectUuid!),
        enabled: !!projectUuid && isEnabled,
        refetchInterval: isEnabled ? (opts.fastPoll ? 3000 : 30000) : false,
    });
};
