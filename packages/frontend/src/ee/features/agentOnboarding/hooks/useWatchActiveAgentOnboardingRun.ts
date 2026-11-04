import { FeatureFlags, isAgentOnboardingRunTerminal } from '@lightdash/common';
import { useEffect } from 'react';
import { useServerFeatureFlag } from '../../../../hooks/useServerOrClientFeatureFlag';
import { setWatchedAgentOnboardingRun } from '../watchedRunStore';
import { useActiveAgentOnboardingRun } from './useAgentOnboarding';

// The run starts on the backend a moment after the project is created
const ACTIVE_RUN_POLLS = 15;

/** Hands the project's auto-started run to the app-wide watcher */
export const useWatchActiveAgentOnboardingRun = (
    projectUuid: string | undefined,
) => {
    const isAgentOnboardingOn =
        useServerFeatureFlag(FeatureFlags.CodingAgentOnboarding).data
            ?.enabled === true;
    const { data: activeRun } = useActiveAgentOnboardingRun(projectUuid, {
        enabled: isAgentOnboardingOn,
        refetchInterval: (data, query) =>
            !data &&
            query.state.dataUpdateCount + query.state.errorUpdateCount <
                ACTIVE_RUN_POLLS
                ? 2000
                : false,
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
