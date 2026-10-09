import {
    type ManagedAgentPolicy,
    type ManagedAgentScheduleOption,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { type LightdashApi } from '../../../../api';
import { useProjectUuid } from '../../../../hooks/useProjectUuid';
import { useLightdashApi } from '../../../../providers/LightdashApi/useLightdashApi';

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
    lightdashApi: LightdashApi,
    projectUuid: string,
): Promise<ManagedAgentSettings | null> =>
    lightdashApi<ManagedAgentSettings | null>({
        url: `/projects/${projectUuid}/managed-agent/settings`,
        method: 'GET',
        body: undefined,
    });

export const useManagedAgentSettings = (opts: { enabled?: boolean } = {}) => {
    const lightdashApi = useLightdashApi();
    const projectUuid = useProjectUuid();
    const isEnabled = opts.enabled ?? true;
    return useQuery<ManagedAgentSettings | null>({
        queryKey: ['managed-agent-settings', projectUuid],
        queryFn: () => getSettings(lightdashApi, projectUuid!),
        enabled: !!projectUuid && isEnabled,
    });
};
