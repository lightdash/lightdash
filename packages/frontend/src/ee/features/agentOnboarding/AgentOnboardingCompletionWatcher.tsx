import { isAgentOnboardingRunTerminal } from '@lightdash/common';
import { useEffect, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router';
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

export const AgentOnboardingCompletionWatcher: FC = () => {
    const { t } = useTranslation('agentOnboarding');
    const watched = useWatchedAgentOnboardingRun();
    const navigate = useNavigate();
    const location = useLocation();
    const { showToastSuccess } = useToaster();
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

    useEffect(() => {
        if (isError) {
            clearWatchedAgentOnboardingRun();
            return;
        }
        if (!run || !isAgentOnboardingRunTerminal(run.status)) return;

        const { agentOnboardingRunUuid, projectUuid, status } = run;
        clearWatchedAgentOnboardingRun();

        if (status !== 'completed') return;
        if (
            pathname ===
            getAgentOnboardingRunUrl(agentOnboardingRunUuid, projectUuid)
        ) {
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
            key: `agent-onboarding-complete-${agentOnboardingRunUuid}`,
            autoClose: false,
            title: t('completion.title'),
            subtitle: t('completion.subtitle'),
            action: {
                children: t('run.openProject'),
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
        pathname,
        organizationUuid,
        showToastSuccess,
        track,
        navigate,
        t,
    ]);

    return null;
};
