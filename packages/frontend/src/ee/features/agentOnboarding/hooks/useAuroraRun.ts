import { FeatureFlags, isAgentOnboardingRunTerminal } from '@lightdash/common';
import { useSessionStorage } from '@mantine/hooks';
import { useEffect } from 'react';
import { useServerFeatureFlag } from '../../../../hooks/useServerOrClientFeatureFlag';
import {
    isRunGoneError,
    useActiveAgentOnboardingRun,
    useAgentOnboardingRun,
} from './useAgentOnboarding';

/** The project's latest Aurora run, kept after it finishes so the outcome stays visible */
export const useAuroraRun = (projectUuid: string) => {
    const isCodingAgentOnboardingOn =
        useServerFeatureFlag(FeatureFlags.CodingAgentOnboarding).data
            ?.enabled === true;
    const isNewOnboardingOn =
        useServerFeatureFlag(FeatureFlags.NewOnboarding).data?.enabled === true;
    const isAgentOnboardingOn = isCodingAgentOnboardingOn && isNewOnboardingOn;
    const enabled = { enabled: isAgentOnboardingOn };
    const activeRun = useActiveAgentOnboardingRun(projectUuid, enabled);
    const [lastRunUuid, setLastRunUuid] = useSessionStorage<string | null>({
        key: `ld.aurora.lastRun.${projectUuid}`,
        defaultValue: null,
        getInitialValueInEffect: false,
    });
    const activeRunUuid = activeRun.data?.agentOnboardingRunUuid ?? null;
    useEffect(() => {
        if (activeRunUuid) setLastRunUuid(activeRunUuid);
    }, [activeRunUuid, setLastRunUuid]);
    // The active-run lookup does not poll, so the run itself is watched
    const watchedRun = useAgentOnboardingRun(
        projectUuid,
        activeRunUuid ?? lastRunUuid ?? undefined,
        enabled,
    );
    const isWatchedRunGone = isRunGoneError(watchedRun.error);
    useEffect(() => {
        if (isWatchedRunGone) setLastRunUuid(null);
    }, [isWatchedRunGone, setLastRunUuid]);
    // A deleted run keeps its last data in the cache, so a 403 or 404 drops it
    const run =
        (isWatchedRunGone ? null : watchedRun.data) ?? activeRun.data ?? null;
    return {
        run,
        isLive: !!run && !isAgentOnboardingRunTerminal(run.status),
        isFailed: run?.status === 'failed',
        isLoading: activeRun.isInitialLoading,
    };
};
