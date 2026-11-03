import { isAgentOnboardingRunTerminal } from '@lightdash/common';
import { useSessionStorage } from '@mantine/hooks';
import { useEffect } from 'react';
import {
    useActiveAgentOnboardingRun,
    useAgentOnboardingRun,
} from './useAgentOnboarding';

/** The project's latest Aurora run, kept after it finishes so the outcome stays visible */
export const useAuroraRun = (projectUuid: string) => {
    const activeRun = useActiveAgentOnboardingRun(projectUuid);
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
    );
    const run = watchedRun.data ?? activeRun.data ?? null;
    return {
        run,
        isLive: !!run && !isAgentOnboardingRunTerminal(run.status),
        isFailed: run?.status === 'failed',
        isLoading: activeRun.isInitialLoading,
    };
};
