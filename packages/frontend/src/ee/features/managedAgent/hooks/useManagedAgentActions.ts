import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router';
import { lightdashApi } from '../../../../api';
import type { ManagedAgentAction } from '../types';

const getActions = async (
    projectUuid: string,
    runUuid?: string,
): Promise<ManagedAgentAction[]> => {
    const params = new URLSearchParams();
    if (runUuid) params.set('runUuid', runUuid);
    const qs = params.toString();
    return lightdashApi<ManagedAgentAction[]>({
        url: `/projects/${projectUuid}/managed-agent/actions${qs ? `?${qs}` : ''}`,
        method: 'GET',
        body: undefined,
    });
};

export const useManagedAgentActions = (
    opts: { enabled?: boolean; fastPoll?: boolean; runUuid?: string } = {},
) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const isEnabled = opts.enabled ?? true;
    return useQuery<ManagedAgentAction[]>({
        queryKey: opts.runUuid
            ? ['managed-agent-actions', projectUuid, opts.runUuid]
            : ['managed-agent-actions', projectUuid],
        queryFn: () => getActions(projectUuid!, opts.runUuid),
        enabled: !!projectUuid && isEnabled,
        refetchInterval: isEnabled ? (opts.fastPoll ? 3000 : 30000) : false,
    });
};
