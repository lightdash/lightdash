import { subject } from '@casl/ability';
import {
    ProjectType,
    type AgentOnboardingRun,
    type OrganizationProject,
} from '@lightdash/common';
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
import { usePlaygroundAvailability } from '../../../hooks/usePlaygroundAvailability';
import { useProjects } from '../../../hooks/useProjects';
import useApp from '../../../providers/App/useApp';
import useTracking from '../../../providers/Tracking/useTracking';
import { EventName } from '../../../types/Events';
import { isPlaygroundProvisioningSource } from '../../../utils/playgroundProject';

type DemoOfferType = 'provision_demo' | 'open_existing_demo';

const DEMO_OFFER_FAILURE_MESSAGES: Record<PlaygroundSetupFailure, string> = {
    unavailable: "Demo projects aren't available on this instance.",
    'turned-off': 'Sample data is turned off on this instance.',
    forbidden: "You don't have permission to create a demo project.",
    unknown: 'Something went wrong while preparing your demo project.',
};

const getDemoOfferType = (
    playground: OrganizationProject | null,
    runProjectUuid: string,
    canProvision: boolean,
): DemoOfferType | null => {
    if (playground) {
        return playground.projectUuid === runProjectUuid
            ? null
            : 'open_existing_demo';
    }
    return canProvision ? 'provision_demo' : null;
};

export const AgentOnboardingDemoOffer: FC<{ run: AgentOnboardingRun }> = ({
    run,
}) => {
    const navigate = useNavigate();
    const { user } = useApp();
    const playgroundAvailability = usePlaygroundAvailability();
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
    const canCreateProject =
        user.data?.ability?.can(
            'create',
            subject('Project', {
                organizationUuid,
                type: ProjectType.DEFAULT,
            }),
        ) === true;
    const offerType = getDemoOfferType(
        playground,
        run.projectUuid,
        playgroundAvailability.isAvailable && canCreateProject,
    );

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
