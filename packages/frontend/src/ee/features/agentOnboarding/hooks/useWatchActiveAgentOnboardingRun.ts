import { FeatureFlags, isAgentOnboardingRunTerminal } from '@lightdash/common';
import { useEffect } from 'react';
import { useServerFeatureFlag } from '../../../../hooks/useServerOrClientFeatureFlag';
import { setWatchedAgentOnboardingRun } from '../watchedRunStore';
import { useActiveAgentOnboardingRun } from './useAgentOnboarding';

/** Hands the project's active run to the app-wide watcher */
export const useWatchActiveAgentOnboardingRun = (
    projectUuid: string | undefined,
) => {
    const isAgentOnboardingOn =
        useServerFeatureFlag(FeatureFlags.CodingAgentOnboarding).data
            ?.enabled === true;
    const { data: activeRun } = useActiveAgentOnboardingRun(projectUuid, {
        enabled: isAgentOnboardingOn,
    });
    useEffect(() => {
        if (!activeRun || isAgentOnboardingRunTerminal(activeRun.status)) {
            return;
        }
        setWatchedAgentOnboardingRun({
            agentOnboardingRunUuid: activeRun.agentOnboardingRunUuid,
            projectUuid: activeRun.projectUuid,
        });
    }, [activeRun]);
};
