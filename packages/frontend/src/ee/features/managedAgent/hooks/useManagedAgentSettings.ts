import {
    type ManagedAgentPolicy,
    type ManagedAgentScheduleOption,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../../../api';
import { useProjectUuid } from '../../../../hooks/useProjectUuid';

type ManagedAgentSettings = {
    projectUuid: string;
    enabled: boolean;
    schedule: ManagedAgentScheduleOption;
    enabledByUserUuid: string | null;
    slackChannelId: string | null;
    toolSettings: Record<string, boolean>;
    policy: ManagedAgentPolicy;
    scopedSpaceUuids: string[];
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

export const useManagedAgentSettings = (opts: { enabled?: boolean } = {}) => {
    const projectUuid = useProjectUuid();
    const isEnabled = opts.enabled ?? true;
    return useQuery<ManagedAgentSettings | null>({
        queryKey: ['managed-agent-settings', projectUuid],
        queryFn: () => getSettings(projectUuid!),
        enabled: !!projectUuid && isEnabled,
    });
};
