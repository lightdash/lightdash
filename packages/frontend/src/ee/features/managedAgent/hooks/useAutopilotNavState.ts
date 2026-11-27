import { subject } from '@casl/ability';
import useApp from '../../../../providers/App/useApp';
import { useIsCopilotEnabled } from '../../aiCopilot/hooks/useIsCopilotEnabled';
import { useManagedAgentLatestRun } from './useManagedAgentLatestRun';
import { useManagedAgentSettings } from './useManagedAgentSettings';

export const formatAutopilotActionCount = (count: number): string =>
    `${count} action${count === 1 ? '' : 's'}`;

/** Whether Autopilot is offered in navigation, and what it last did. */
export const useAutopilotNavState = (projectUuid: string | undefined) => {
    const { user } = useApp();
    const canManage =
        projectUuid !== undefined &&
        (user.data?.ability?.can(
            'manage',
            subject('AiAgent', {
                organizationUuid: user.data?.organizationUuid,
                projectUuid,
            }),
        ) ??
            false);
    const { isCopilotEnabled } = useIsCopilotEnabled();
    const isAvailable = isCopilotEnabled && canManage;

    const { data: settings } = useManagedAgentSettings({
        enabled: isAvailable,
    });
    const isEnabled = settings?.enabled ?? false;
    const { data: latestRun } = useManagedAgentLatestRun({
        enabled: isAvailable && isEnabled,
    });

    return { isAvailable, isEnabled, settings, latestRun };
};
