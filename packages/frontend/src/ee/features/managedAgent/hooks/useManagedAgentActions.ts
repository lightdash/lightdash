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

export const useManagedAgentActions = () => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    return useQuery<ManagedAgentAction[]>({
        queryKey: ['managed-agent-actions', projectUuid],
        queryFn: () => getActions(projectUuid!),
        enabled: !!projectUuid,
        refetchInterval: 30000, // Refresh every 30s to catch new heartbeats
    });
};
