import { isCreateProjectJob, type Job } from '@lightdash/common';
import { useQueryClient } from '@tanstack/react-query';
import confetti from 'canvas-confetti';
import { useEffect, useRef, type RefObject } from 'react';
import { useNavigate } from 'react-router';
import { getProject } from '../../hooks/useProject';
import { refetchFeatureFlags } from '../../hooks/useServerOrClientFeatureFlag';

export const useCreateProjectSuccessRedirect = ({
    activeJob,
    createProjectJobId,
    successRedirect,
    celebrateOnSuccess,
    submitButtonRef,
}: {
    activeJob: Job | undefined;
    createProjectJobId: string | undefined;
    successRedirect: ((projectUuid: string) => string) | undefined;
    celebrateOnSuccess: boolean;
    submitButtonRef: RefObject<HTMLButtonElement | null>;
}) => {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const hasFiredConfettiRef = useRef(false);

    useEffect(() => {
        if (
            !createProjectJobId ||
            createProjectJobId !== activeJob?.jobUuid ||
            !isCreateProjectJob(activeJob) ||
            !activeJob.jobResults?.projectUuid
        ) {
            return;
        }
        const { projectUuid } = activeJob.jobResults;
        const redirectTo = successRedirect
            ? successRedirect(projectUuid)
            : `/createProjectSettings/${projectUuid}`;

        if (!celebrateOnSuccess) {
            void navigate({ pathname: redirectTo });
            return;
        }

        // Celebrate path fires exactly once — the effect re-runs on every
        // job-status poll, and the async closure below owns the navigation.
        if (hasFiredConfettiRef.current) {
            return;
        }
        hasFiredConfettiRef.current = true;

        const rect = submitButtonRef.current?.getBoundingClientRect();
        const origin = rect
            ? {
                  x: (rect.left + rect.width / 2) / window.innerWidth,
                  y: (rect.top + rect.height / 2) / window.innerHeight,
              }
            : { x: 0.5, y: 0.7 };
        // The canvas outlives the client-side navigation, so the burst carries
        // over onto the page we land on.
        void confetti({
            disableForReducedMotion: true,
            startVelocity: 35,
            particleCount: 120,
            spread: 100,
            gravity: 0.7,
            origin,
        });

        // Warm the caches the home reads before we land there, so it doesn't
        // flash the stale "connect your warehouse" checklist (the projects/org
        // lists still show no warehouse), the pre-homepage-builder home (the
        // org's onboarding flags are only enabled once this first project
        // exists) or a cold project spinner. The button stays busy meanwhile,
        // so it reads as one smooth step. Navigate even if priming fails.
        void (async () => {
            try {
                await Promise.all([
                    queryClient.refetchQueries({
                        queryKey: ['projects'],
                        type: 'all',
                    }),
                    queryClient.refetchQueries({
                        queryKey: ['organization'],
                        type: 'all',
                    }),
                    refetchFeatureFlags(queryClient),
                    queryClient.prefetchQuery({
                        queryKey: ['project', projectUuid],
                        queryFn: () => getProject(projectUuid),
                    }),
                ]);
            } catch {
                // Ignore — the destination will load normally on its own.
            }
            void navigate({ pathname: redirectTo });
        })();
    }, [
        activeJob,
        celebrateOnSuccess,
        createProjectJobId,
        navigate,
        queryClient,
        submitButtonRef,
        successRedirect,
    ]);
};
