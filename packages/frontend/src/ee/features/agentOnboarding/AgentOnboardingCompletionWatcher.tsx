import { isAgentOnboardingRunTerminal } from '@lightdash/common';
import { notifications } from '@mantine/notifications';
import { useEffect, type FC } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { AI_NAME } from '../../../components/common/aiName';
import { useOrganization } from '../../../hooks/organization/useOrganization';
import useToaster from '../../../hooks/toaster/useToaster';
import useTracking from '../../../providers/Tracking/useTracking';
import { EventName } from '../../../types/Events';
import { useAgentOnboardingRun } from './hooks/useAgentOnboarding';
import { getAgentOnboardingRunUrl } from './utils';
import {
    clearWatchedAgentOnboardingRun,
    useWatchedAgentOnboardingRun,
} from './watchedRunStore';

const toastedRunUuids = new Set<string>();

const runToastKey = (runUuid: string) => `agent-onboarding-run-${runUuid}`;

export const AgentOnboardingCompletionWatcher: FC = () => {
    const watched = useWatchedAgentOnboardingRun();
    const navigate = useNavigate();
    const location = useLocation();
    const { showToastSuccess, showToastWarning } = useToaster();
    const { track } = useTracking();
    const { data: organization } = useOrganization({
        queryKey: ['organization'],
        enabled: watched !== null,
    });

    const runQuery = useAgentOnboardingRun(
        watched?.projectUuid,
        watched?.agentOnboardingRunUuid,
    );

    const { data: run, isError } = runQuery;
    const organizationUuid = organization?.organizationUuid;
    const { pathname } = location;
    // The run page and the setup steps show the run inline, so no toast there
    const isShownInline =
        pathname.startsWith('/onboarding/') ||
        (!!run &&
            pathname ===
                getAgentOnboardingRunUrl(
                    run.agentOnboardingRunUuid,
                    run.projectUuid,
                ));

    useEffect(() => {
        if (isError) {
            clearWatchedAgentOnboardingRun();
            return;
        }
        if (!run || !isAgentOnboardingRunTerminal(run.status)) return;

        const { agentOnboardingRunUuid, projectUuid, status } = run;
        clearWatchedAgentOnboardingRun();

        if (status !== 'completed') {
            if (status === 'failed' && !isShownInline) {
                showToastWarning({
                    key: runToastKey(agentOnboardingRunUuid),
                    autoClose: false,
                    title: `${AI_NAME} couldn't finish drafting`,
                    subtitle: 'You can try again from home.',
                    action: {
                        children: 'See what happened',
                        onClick: () =>
                            void navigate(
                                getAgentOnboardingRunUrl(
                                    agentOnboardingRunUuid,
                                    projectUuid,
                                ),
                            ),
                    },
                });
            } else {
                notifications.hide(runToastKey(agentOnboardingRunUuid));
            }
            return;
        }
        if (isShownInline) {
            notifications.hide(runToastKey(agentOnboardingRunUuid));
            return;
        }
        if (toastedRunUuids.has(agentOnboardingRunUuid)) return;
        toastedRunUuids.add(agentOnboardingRunUuid);

        const properties = {
            organizationId: organizationUuid ?? '',
            projectUuid,
            agentOnboardingRunUuid,
        };

        showToastSuccess({
            key: runToastKey(agentOnboardingRunUuid),
            autoClose: false,
            title: 'Your workspace is ready',
            subtitle: 'Your models, metrics and starter dashboard are in.',
            action: {
                children: 'Open home',
                onClick: () => {
                    track({
                        name: EventName.AGENT_ONBOARDING_COMPLETION_TOAST_CLICKED,
                        properties,
                    });
                    void navigate(`/projects/${projectUuid}/home`);
                },
            },
        });
        track({
            name: EventName.AGENT_ONBOARDING_COMPLETION_TOAST_SHOWN,
            properties,
        });
    }, [
        run,
        isError,
        isShownInline,
        organizationUuid,
        showToastSuccess,
        showToastWarning,
        track,
        navigate,
    ]);

    return null;
};
