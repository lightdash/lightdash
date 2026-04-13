import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router';
import { lightdashApi } from '../../../../api';

type ManagedAgentSettings = {
    projectUuid: string;
    enabled: boolean;
    scheduleCron: string;
    enabledByUserUuid: string | null;
    createdAt: string;
    updatedAt: string;
};

const getSettings = async (
    projectUuid: string,
): Promise<ManagedAgentSettings | null> =>
    lightdashApi<ManagedAgentSettings | null>({
        url: `/projects/${projectUuid}/managed-agent/settings`,
        method: 'GET',
        body: undefined,
    });

export const useManagedAgentSettings = () => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    return useQuery<ManagedAgentSettings | null>({
        queryKey: ['managed-agent-settings', projectUuid],
        queryFn: () => getSettings(projectUuid!),
        enabled: !!projectUuid,
    });
};
