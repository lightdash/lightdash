import { subject } from '@casl/ability';
import {
    ApiConnectorType,
    FeatureFlags,
    type ExternalConnectionListItem,
} from '@lightdash/common';
import {
    Box,
    Button,
    Divider,
    Group,
    Loader,
    Paper,
    Stack,
    Text,
    Title,
    Tooltip,
} from '@mantine/core';
import {
    IconBrandGithub,
    IconArrowUpRight,
    IconCircleCheck,
    IconInfoCircle,
} from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FC, type ReactNode } from 'react';
import { Link, Navigate, useParams, useSearchParams } from 'react-router';
import { DocumentTitle } from '../components/common/DocumentTitle';
import { useGithubConfig } from '../components/common/GithubIntegration/hooks/useGithubIntegration';
import MantineIcon from '../components/common/MantineIcon';
import OnboardingLayout from '../components/common/OnboardingLayout';
import { ONBOARDING_DATA_STEPS } from '../components/common/onboardingSteps';
import {
    useOnboardingVariant,
    useStepCopy,
} from '../components/common/onboardingVariant';
import {
    StepVisual,
    ToolsVisual,
} from '../components/common/OnboardingVisuals';
import { useOnboardingNavigate } from '../components/common/viewTransition';
import { ConnectionFormSkeleton } from '../components/ProjectConnection/ConnectionFormSkeleton';
import {
    getApiSourceTarget,
    getGoogleSignInUrl,
    getGoogleSource,
    type GoogleConnector,
} from '../components/Settings/LiveDataSourcesPanel/googleConnection';
import { GoogleSourcePickerModal } from '../components/Settings/LiveDataSourcesPanel/GoogleSourcePickerModal';
import {
    getPostHogSignInUrl,
    toPostHogCreatePayload,
    usePostHogConnectionForm,
} from '../components/Settings/LiveDataSourcesPanel/postHogConnection';
import { PostHogConnectionStep } from '../components/Settings/LiveDataSourcesPanel/PostHogConnectionStep';
import { useLiveSourceSignInResult } from '../components/Settings/LiveDataSourcesPanel/useLiveSourceSignInResult';
import { useWatchActiveAgentOnboardingRun } from '../ee/features/agentOnboarding/hooks/useWatchActiveAgentOnboardingRun';
import { OnboardingDoneStep } from '../ee/features/agentOnboarding/OnboardingDoneStep';
import { OnboardingRunActivity } from '../ee/features/agentOnboarding/OnboardingRunActivity';
import { useCreateExternalConnection } from '../features/externalConnections/hooks/useCreateExternalConnection';
import { useExternalConnections } from '../features/externalConnections/hooks/useExternalConnections';
import { useLiveSourceExplores } from '../features/externalConnections/hooks/useLiveSourceExplores';
import { getLiveSource } from '../features/externalConnections/liveSources/liveSourceCatalog';
import { LiveSourceIcon } from '../features/externalConnections/liveSources/LiveSourceIcon';
import { useGetSlack } from '../hooks/slack/useSlack';
import { useOnboardingPageGuard } from '../hooks/useOnboardingPageGuard';
import { useProject } from '../hooks/useProject';
import { type UserWithAbility } from '../hooks/user/useUser';
import { useServerFeatureFlag } from '../hooks/useServerOrClientFeatureFlag';
import useApp from '../providers/App/useApp';
import useTracking from '../providers/Tracking/useTracking';
import MsTeamsSvg from '../svgs/msteams.svg?react';
import SlackSvg from '../svgs/slack.svg?react';
import { EventName } from '../types/Events';
import classes from './OnboardingTools.module.css';

const GOOGLE_CONNECTORS: GoogleConnector[] = [
    ApiConnectorType.GA4,
    ApiConnectorType.SEARCH_CONSOLE,
];

const ConnectedStatus: FC<{ detail: string }> = ({ detail }) => (
    <Group gap={4} wrap="nowrap" miw={0}>
        <MantineIcon icon={IconCircleCheck} size={14} color="green" />
        <Text fz="xs" c="dimmed" truncate>
            Connected: {detail}
        </Text>
    </Group>
);

const ToolRow: FC<{
    icon: ReactNode;
    label: string;
    description: string;
    info: string | null;
    connectedDetail: string | null;
    action: ReactNode;
}> = ({ icon, label, description, info, connectedDetail, action }) => (
    <Group justify="space-between" wrap="nowrap" gap="md" p="md">
        <Group gap="sm" wrap="nowrap" miw={0}>
            {icon}
            <Stack gap={2} miw={0}>
                <Text fz="sm" fw={500}>
                    {label}
                </Text>
                {connectedDetail ? (
                    <ConnectedStatus detail={connectedDetail} />
                ) : (
                    <Group gap={4} wrap="nowrap" miw={0}>
                        <Text fz="xs" c="dimmed" truncate>
                            {description}
                        </Text>
                        {info && (
                            <Tooltip
                                label={info}
                                multiline
                                w={280}
                                withinPortal
                            >
                                <MantineIcon
                                    icon={IconInfoCircle}
                                    size={12}
                                    color="ldGray.5"
                                />
                            </Tooltip>
                        )}
                    </Group>
                )}
            </Stack>
        </Group>
        {action}
    </Group>
);

const LiveSourceReadyRow: FC<{
    projectUuid: string;
    connection: ExternalConnectionListItem;
    showName: boolean;
}> = ({ projectUuid, connection, showName }) => {
    const { data: explores, isError } = useLiveSourceExplores({
        projectUuid,
        connectionUuid: connection.externalConnectionUuid,
    });
    const explore = explores?.[0];
    const fieldCount = (explores ?? [])
        .flatMap((e) => Object.values(e.tables))
        .flatMap((table) => [
            ...Object.values(table.dimensions),
            ...Object.values(table.metrics),
        ])
        .filter((field) => !field.hidden).length;

    const status = isError
        ? 'Fields are still being prepared'
        : explore
          ? `${fieldCount} fields ready to explore`
          : 'Preparing fields…';

    return (
        <Group
            justify="space-between"
            wrap="nowrap"
            gap="md"
            className={classes.readyPanel}
        >
            <Text fz="xs" c="dimmed" truncate>
                {showName ? `${connection.name}: ${status}` : status}
            </Text>
            {explore ? (
                <Button
                    component={Link}
                    to={`/projects/${projectUuid}/tables/${explore.name}`}
                    target="_blank"
                    size="compact-xs"
                    variant="subtle"
                    rightSection={<MantineIcon icon={IconArrowUpRight} />}
                >
                    Explore
                </Button>
            ) : (
                !isError && <Loader size="xs" />
            )}
        </Group>
    );
};

const ReadyPanels: FC<{
    projectUuid: string;
    connections: ExternalConnectionListItem[];
}> = ({ projectUuid, connections }) =>
    connections.map((connection) => (
        <LiveSourceReadyRow
            key={connection.externalConnectionUuid}
            projectUuid={projectUuid}
            connection={connection}
            showName={connections.length > 1}
        />
    ));

const ToolGroup: FC<{ title: string | null; children: ReactNode }> = ({
    title,
    children,
}) => (
    <Stack gap="xs">
        {title && (
            <Text fz="sm" fw={500} c="dimmed">
                {title}
            </Text>
        )}
        <Paper p={0} className={classes.toolGroup}>
            <Stack gap={0}>{children}</Stack>
        </Paper>
    </Stack>
);

const connectionsFor = (
    connections: ExternalConnectionListItem[],
    connector: ApiConnectorType,
) =>
    connections.filter(
        (connection) =>
            connection.kind === 'live_source' &&
            connection.apiSource?.connector === connector,
    );

const describeConnections = (connections: ExternalConnectionListItem[]) =>
    connections.length === 0
        ? null
        : connections
              .map((connection) =>
                  connection.apiSource
                      ? getApiSourceTarget(connection.apiSource)
                      : connection.name,
              )
              .join(', ');

const PostHogInlineConnect: FC<{
    projectUuid: string;
    canSignIn: boolean;
    onDone: () => void;
}> = ({ projectUuid, canSignIn, onDone }) => {
    const form = usePostHogConnectionForm(null, canSignIn);
    const createMutation = useCreateExternalConnection();

    const handleSubmit = form.onSubmit(async (values) => {
        if (values.authMethod === 'signIn') {
            window.location.assign(
                getPostHogSignInUrl(projectUuid, values, null, 'onboarding'),
            );
            return;
        }
        await createMutation.mutateAsync({
            projectUuid,
            data: toPostHogCreatePayload(values),
        });
        onDone();
    });

    return (
        <form onSubmit={handleSubmit}>
            <Stack gap="md" px="md" pb="md">
                <PostHogConnectionStep
                    projectUuid={projectUuid}
                    form={form}
                    isEditing={false}
                    canSignIn={canSignIn}
                    onReconnect={null}
                    showIntro={false}
                />
                <Group justify="flex-end" gap="xs">
                    <Button
                        variant="default"
                        onClick={onDone}
                        disabled={createMutation.isLoading}
                    >
                        Cancel
                    </Button>
                    <Button type="submit" loading={createMutation.isLoading}>
                        {form.values.authMethod === 'signIn'
                            ? 'Continue to PostHog'
                            : 'Connect'}
                    </Button>
                </Group>
            </Stack>
        </form>
    );
};

const TeamStep: FC<{
    projectUuid: string;
    nextPath: string;
    backPath: string | null;
}> = ({ projectUuid, nextPath, backPath }) => {
    const onboardingNavigate = useOnboardingNavigate();
    const copy = useStepCopy('team');
    const { health } = useApp();
    const hasSlack = health.data?.hasSlack === true;
    const hasTeams = health.data?.hasMicrosoftTeams === true;
    const hasGithub = health.data?.hasGithub === true;
    const { track } = useTracking();
    const [variant] = useOnboardingVariant();
    const queryClient = useQueryClient();
    const slackQuery = useGetSlack();
    const githubQuery = useGithubConfig();
    const isGithubInstalled = hasGithub && githubQuery.data?.enabled === true;
    const hasConnected = (hasSlack && !!slackQuery.data) || isGithubInstalled;

    // Connect opens a new tab, so pick up the install when the user comes back
    useEffect(() => {
        const refresh = () => {
            void queryClient.invalidateQueries(['slack']);
            void queryClient.invalidateQueries(['github_installation']);
        };
        window.addEventListener('focus', refresh);
        return () => window.removeEventListener('focus', refresh);
    }, [queryClient]);

    if (!hasSlack && !hasTeams && !hasGithub) {
        return <Navigate to={nextPath} replace />;
    }

    const connectButton = (href: string, isInternal: boolean) =>
        isInternal ? (
            <Button
                size="xs"
                variant="default"
                component={Link}
                to={href}
                target="_blank"
            >
                Connect
            </Button>
        ) : (
            <Button
                size="xs"
                variant="default"
                component="a"
                href={href}
                target="_blank"
                rel="noreferrer"
            >
                Connect
            </Button>
        );

    return (
        <OnboardingLayout
            screen="team"
            journey={{ currentStep: 2, steps: ONBOARDING_DATA_STEPS }}
            stackDepth={3}
            aside={<StepVisual step="team" />}
            activity={<OnboardingRunActivity projectUuid={projectUuid} />}
        >
            <DocumentTitle title="Connect Slack and GitHub" />
            <Stack className={classes.column} gap="xl">
                <Stack gap={4}>
                    <Title order={1}>{copy.title}</Title>
                    {copy.subtitle && <Text c="dimmed">{copy.subtitle}</Text>}
                </Stack>

                <ToolGroup title={null}>
                    {hasSlack && (
                        <ToolRow
                            icon={<SlackSvg width={24} height={24} />}
                            label="Slack"
                            description="Schedule dashboards, get alerts and ask questions in any channel"
                            info={null}
                            connectedDetail={null}
                            action={connectButton(
                                '/api/v1/slack/install/',
                                false,
                            )}
                        />
                    )}
                    {hasSlack && hasTeams && <Divider />}
                    {hasTeams && (
                        <ToolRow
                            icon={<MsTeamsSvg width={24} height={24} />}
                            label="Microsoft Teams"
                            description="Send dashboards and alerts to your team's channels"
                            info={null}
                            connectedDetail={null}
                            action={connectButton(
                                '/generalSettings/integrations',
                                true,
                            )}
                        />
                    )}
                    {(hasSlack || hasTeams) && hasGithub && <Divider />}
                    {hasGithub && (
                        <ToolRow
                            icon={
                                <MantineIcon icon={IconBrandGithub} size={24} />
                            }
                            label="GitHub"
                            description="Save new metrics, charts and dashboards as pull requests"
                            info={null}
                            connectedDetail={
                                isGithubInstalled
                                    ? 'GitHub app installed'
                                    : null
                            }
                            action={
                                !isGithubInstalled && (
                                    // Same tab, so GitHub brings the user back to this step
                                    <Button
                                        size="xs"
                                        variant="default"
                                        component="a"
                                        href={`/api/v1/github/install?redirect=${encodeURIComponent(
                                            `/onboarding/tools/${projectUuid}?step=team`,
                                        )}`}
                                    >
                                        Connect
                                    </Button>
                                )
                            }
                        />
                    )}
                </ToolGroup>

                <Group justify="flex-end">
                    {backPath && (
                        <Button
                            variant="subtle"
                            color="gray"
                            onClick={() => onboardingNavigate(backPath)}
                        >
                            Back
                        </Button>
                    )}
                    <Button
                        variant={hasConnected ? 'filled' : 'default'}
                        onClick={() => {
                            if (!hasConnected) {
                                track({
                                    name: EventName.ONBOARDING_STEP_SKIPPED,
                                    properties: { screen: 'team', variant },
                                });
                            }
                            onboardingNavigate(nextPath);
                        }}
                    >
                        {hasConnected ? 'Continue' : 'Skip for now'}
                    </Button>
                </Group>
            </Stack>
        </OnboardingLayout>
    );
};

const OnboardingToolsContent: FC<{
    user: UserWithAbility;
    projectUuid: string;
}> = ({ user, projectUuid }) => {
    const onboardingNavigate = useOnboardingNavigate();
    const copy = useStepCopy('tools');
    const { track } = useTracking();
    const [variant] = useOnboardingVariant();
    const [searchParams] = useSearchParams();
    const { health } = useApp();
    const liveSourcesFlag = useServerFeatureFlag(FeatureFlags.ApiQuerySources);
    const [isPostHogOpen, setIsPostHogOpen] = useState(
        () =>
            searchParams.get('connect')?.split(',').includes('posthog') ??
            false,
    );
    const { isPickingGoogleSource, closeGoogleSourcePicker } =
        useLiveSourceSignInResult();

    const projectSubject = () => ({
        organizationUuid: user.organizationUuid,
        projectUuid,
    });
    const showLiveSources =
        liveSourcesFlag.data?.enabled === true &&
        user.ability.can(
            'manage',
            subject('ExternalConnection', projectSubject()),
        );
    const showGoogle =
        showLiveSources && health.data?.hasGoogleLiveSources === true;

    const { data: project } = useProject(projectUuid);
    const { data: connections = [] } = useExternalConnections(
        showLiveSources ? projectUuid : undefined,
    );

    const donePath = `/onboarding/tools/${projectUuid}?step=done`;
    const teamStepPath = `/onboarding/tools/${projectUuid}?step=team`;

    const isTeamStep = searchParams.get('step') === 'team';

    if (searchParams.get('step') === 'done') {
        return <OnboardingDoneStep projectUuid={projectUuid} />;
    }

    if (liveSourcesFlag.isLoading) {
        return (
            <OnboardingLayout
                journey={{
                    currentStep: 2,
                    steps: ONBOARDING_DATA_STEPS,
                }}
                stackDepth={isTeamStep ? 3 : 2}
                aside={<StepVisual step={isTeamStep ? 'team' : 'tools'} />}
            >
                <ConnectionFormSkeleton />
            </OnboardingLayout>
        );
    }

    if (isTeamStep) {
        return (
            <TeamStep
                projectUuid={projectUuid}
                nextPath={donePath}
                backPath={
                    showLiveSources ? `/onboarding/tools/${projectUuid}` : null
                }
            />
        );
    }

    if (!showLiveSources) {
        return <Navigate to={teamStepPath} replace />;
    }

    const postHogConnections = connectionsFor(
        connections,
        ApiConnectorType.POSTHOG,
    );
    const hasConnected = connections.some(
        (connection) => connection.kind === 'live_source',
    );
    const connectLabel = (isConnected: boolean) =>
        isConnected ? 'Add another' : 'Connect';

    return (
        <OnboardingLayout
            screen="tools"
            journey={{ currentStep: 2, steps: ONBOARDING_DATA_STEPS }}
            stackDepth={2}
            activity={<OnboardingRunActivity projectUuid={projectUuid} />}
            aside={
                <ToolsVisual
                    warehouse={project?.warehouseConnection?.type ?? null}
                />
            }
        >
            <DocumentTitle title="Connect your tools" />
            <Stack className={classes.column} gap="xl">
                <Stack gap={4}>
                    <Title order={1}>{copy.title}</Title>
                    {copy.subtitle && <Text c="dimmed">{copy.subtitle}</Text>}
                </Stack>

                {showLiveSources && (
                    <ToolGroup title="Product analytics">
                        <ToolRow
                            icon={
                                <LiveSourceIcon
                                    connector={ApiConnectorType.POSTHOG}
                                    size={24}
                                />
                            }
                            label={
                                getLiveSource(ApiConnectorType.POSTHOG).label
                            }
                            description={
                                getLiveSource(ApiConnectorType.POSTHOG)
                                    .description
                            }
                            info="AI agents send HogQL queries to this PostHog project and read the results live. Sign in, or use a personal API key with the Query Read scope."
                            connectedDetail={describeConnections(
                                postHogConnections,
                            )}
                            action={
                                !isPostHogOpen && (
                                    <Button
                                        size="xs"
                                        variant="default"
                                        onClick={() => setIsPostHogOpen(true)}
                                    >
                                        {connectLabel(
                                            postHogConnections.length > 0,
                                        )}
                                    </Button>
                                )
                            }
                        />
                        <ReadyPanels
                            projectUuid={projectUuid}
                            connections={postHogConnections}
                        />
                        {isPostHogOpen && (
                            <PostHogInlineConnect
                                projectUuid={projectUuid}
                                canSignIn={
                                    health.data?.hasPostHogOAuth ?? false
                                }
                                onDone={() => setIsPostHogOpen(false)}
                            />
                        )}
                    </ToolGroup>
                )}

                {showGoogle && (
                    <ToolGroup title="Marketing and search">
                        {GOOGLE_CONNECTORS.map((connector, index) => {
                            const entry = getLiveSource(connector);
                            const connected = connectionsFor(
                                connections,
                                connector,
                            );
                            return (
                                <Box key={connector}>
                                    {index > 0 && <Divider />}
                                    <ToolRow
                                        icon={
                                            <LiveSourceIcon
                                                connector={connector}
                                                size={24}
                                            />
                                        }
                                        label={entry.label}
                                        description={entry.description}
                                        info={null}
                                        connectedDetail={describeConnections(
                                            connected,
                                        )}
                                        action={
                                            <Button
                                                size="xs"
                                                variant="default"
                                                onClick={() =>
                                                    window.location.assign(
                                                        getGoogleSignInUrl(
                                                            projectUuid,
                                                            connector,
                                                            getGoogleSource(
                                                                connector,
                                                            ).defaultName,
                                                            null,
                                                            'onboarding',
                                                        ),
                                                    )
                                                }
                                            >
                                                {connectLabel(
                                                    connected.length > 0,
                                                )}
                                            </Button>
                                        }
                                    />
                                    <ReadyPanels
                                        projectUuid={projectUuid}
                                        connections={connected}
                                    />
                                </Box>
                            );
                        })}
                    </ToolGroup>
                )}

                <Group justify="flex-end">
                    <Button
                        variant={hasConnected ? 'filled' : 'default'}
                        onClick={() => {
                            if (!hasConnected) {
                                track({
                                    name: EventName.ONBOARDING_STEP_SKIPPED,
                                    properties: { screen: 'tools', variant },
                                });
                            }
                            onboardingNavigate(teamStepPath);
                        }}
                    >
                        {hasConnected ? 'Continue' : 'Skip for now'}
                    </Button>
                </Group>
            </Stack>

            {isPickingGoogleSource && (
                <GoogleSourcePickerModal
                    projectUuid={projectUuid}
                    onClose={closeGoogleSourcePicker}
                />
            )}
        </OnboardingLayout>
    );
};

const OnboardingTools: FC = () => {
    const guard = useOnboardingPageGuard();
    const { projectUuid } = useParams<{ projectUuid: string }>();
    useWatchActiveAgentOnboardingRun(projectUuid);

    if (guard.status === 'blocked') {
        return guard.element;
    }

    if (!projectUuid) {
        return <Navigate to="/" replace />;
    }

    return (
        <OnboardingToolsContent user={guard.user} projectUuid={projectUuid} />
    );
};

export default OnboardingTools;
