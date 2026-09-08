import { subject } from '@casl/ability';
import { type AgentOnboardingRun } from '@lightdash/common';
import { Anchor } from '@mantine/core';
import { captureException } from '@sentry/react';
import { useCallback, useEffect, useRef, useState, type FC } from 'react';
import { useNavigate } from 'react-router';
import {
    getPlaygroundSetupFailure,
    isRetryablePlaygroundSetupFailure,
    type PlaygroundSetupFailure,
} from '../../../components/ProjectConnection/ProjectConnectFlow/playgroundSetupFailure';
import { useOrganization } from '../../../hooks/organization/useOrganization';
import { useEnsurePlaygroundProject } from '../../../hooks/useEnsurePlaygroundProject';
import { useProjects } from '../../../hooks/useProjects';
import useApp from '../../../providers/App/useApp';
import useTracking from '../../../providers/Tracking/useTracking';
import { EventName } from '../../../types/Events';
import { isPlaygroundProvisioningSource } from '../../../utils/playgroundProject';

type DemoOfferType = 'provision_demo' | 'open_existing_demo';

const DEMO_OFFER_FAILURE_MESSAGES: Record<PlaygroundSetupFailure, string> = {
    unavailable: "Demo projects aren't available on this instance.",
    'previously-removed':
        "Your organization's demo project was removed and can't be set up again.",
    forbidden: "You don't have permission to create a demo project.",
    unknown: 'Something went wrong while preparing your demo project.',
};

export const AgentOnboardingDemoOffer: FC<{ run: AgentOnboardingRun }> = ({
    run,
}) => {
    const navigate = useNavigate();
    const { health, user } = useApp();
    const { track, data: trackingData } = useTracking();
    const isTrackingReady = !!trackingData.rudder;
    const { data: organization } = useOrganization();
    const { data: projects } = useProjects();
    const { mutateAsync: ensurePlaygroundAsync, isLoading: isProvisioning } =
        useEnsurePlaygroundProject();
    const [failure, setFailure] = useState<PlaygroundSetupFailure | null>(null);

    const organizationUuid = organization?.organizationUuid;
    const playground =
        projects?.find((project) =>
            isPlaygroundProvisioningSource(project.provisioningSource),
        ) ?? null;
    const canProvision =
        health.data?.hasPlaygroundProjects === true &&
        !!organizationUuid &&
        user.data?.ability?.can(
            'create',
            subject('InviteLink', { organizationUuid }),
        ) === true;

    const isRunProjectPlayground =
        playground !== null && playground.projectUuid === run.projectUuid;

    let offerType: DemoOfferType | null = null;
    if (isRunProjectPlayground) {
        offerType = null;
    } else if (playground) {
        offerType = 'open_existing_demo';
    } else if (canProvision) {
        offerType = 'provision_demo';
    }

    const { agentOnboardingRunUuid, projectUuid } = run;
    const shownRunUuidRef = useRef<string | null>(null);

    useEffect(() => {
        if (!isTrackingReady || offerType === null || !organizationUuid) return;
        if (shownRunUuidRef.current === agentOnboardingRunUuid) return;
        shownRunUuidRef.current = agentOnboardingRunUuid;
        track({
            name: EventName.AGENT_ONBOARDING_DEMO_OFFER_SHOWN,
            properties: {
                organizationId: organizationUuid,
                projectUuid,
                agentOnboardingRunUuid,
                offerType,
            },
        });
    }, [
        isTrackingReady,
        offerType,
        organizationUuid,
        agentOnboardingRunUuid,
        projectUuid,
        track,
    ]);

    const openDemo = useCallback(
        async (mode: DemoOfferType) => {
            track({
                name: EventName.AGENT_ONBOARDING_DEMO_OFFER_ACCEPTED,
                properties: {
                    organizationId: organizationUuid ?? '',
                    projectUuid,
                    agentOnboardingRunUuid,
                    offerType: mode,
                    demoProjectUuid:
                        mode === 'open_existing_demo'
                            ? (playground?.projectUuid ?? null)
                            : null,
                },
            });

            if (mode === 'open_existing_demo') {
                if (!playground) return;
                void navigate(`/projects/${playground.projectUuid}/home`);
                return;
            }

            setFailure(null);
            try {
                const result = await ensurePlaygroundAsync({
                    trigger: 'agent_onboarding_wait',
                });
                void navigate(`/projects/${result.projectUuid}/home`);
            } catch (error) {
                setFailure(getPlaygroundSetupFailure(error));
                captureException(error, {
                    tags: { feature: 'agent-onboarding-demo-offer' },
                });
            }
        },
        [
            track,
            organizationUuid,
            projectUuid,
            agentOnboardingRunUuid,
            playground,
            navigate,
            ensurePlaygroundAsync,
        ],
    );

    if (offerType === null) return null;

    const canRetry =
        failure === null || isRetryablePlaygroundSetupFailure(failure);
    const actionLabel = isProvisioning
        ? 'setting up your demo project…'
        : failure !== null
          ? 'try again'
          : offerType === 'open_existing_demo'
            ? 'open the demo project'
            : 'explore sample data';

    return (
        <>
            {failure ? DEMO_OFFER_FAILURE_MESSAGES[failure] : 'You can also'}{' '}
            {canRetry ? (
                <Anchor
                    component="button"
                    type="button"
                    fz="sm"
                    disabled={isProvisioning}
                    onClick={() => void openDemo(offerType)}
                >
                    {actionLabel}
                </Anchor>
            ) : null}
            {failure === null ? ' while you wait.' : null}
        </>
    );
};
