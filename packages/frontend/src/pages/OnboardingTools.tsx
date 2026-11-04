import { subject } from '@casl/ability';
import {
    ApiConnectorType,
    FeatureFlags,
    type ExternalConnectionListItem,
    type WarehouseTypes,
} from '@lightdash/common';
import {
    Box,
    Button,
    Divider,
    Group,
    Paper,
    Stack,
    Text,
    Title,
    Tooltip,
    Image,
} from '@mantine/core';
import {
    IconBrandGithub,
    IconCircleCheck,
    IconInfoCircle,
} from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FC, type ReactNode } from 'react';
import { Link, Navigate, useParams, useSearchParams } from 'react-router';
import { DocumentTitle } from '../components/common/DocumentTitle';
import { useGithubConfig } from '../components/common/GithubIntegration/hooks/useGithubIntegration';
import { useGitlabRepositories } from '../components/common/GitlabIntegration/hooks/useGitlabIntegration';
import MantineIcon from '../components/common/MantineIcon';
import OnboardingLayout from '../components/common/OnboardingLayout';
import {
    ONBOARDING_DATA_STEPS,
    ONBOARDING_STEP_COPY,
} from '../components/common/onboardingSteps';
import {
    LiveSourceFieldsVisual,
    StepVisual,
    ToolsVisual,
    type PreviewField,
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
import { useLiveSourceFields } from '../features/externalConnections/hooks/useLiveSourceFields';
import { getLiveSource } from '../features/externalConnections/liveSources/liveSourceCatalog';
import { LiveSourceIcon } from '../features/externalConnections/liveSources/LiveSourceIcon';
import { useGetSlack } from '../hooks/slack/useSlack';
import { useOnboardingPageGuard } from '../hooks/useOnboardingPageGuard';
import { useProject } from '../hooks/useProject';
import { type UserWithAbility } from '../hooks/user/useUser';
import { useServerFeatureFlag } from '../hooks/useServerOrClientFeatureFlag';
import useApp from '../providers/App/useApp';
import useTracking from '../providers/Tracking/useTracking';
import gitlabIcon from '../svgs/gitlab-icon.svg';
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
                        <Text fz="xs" c="dimmed" lineClamp={2}>
                            {description}
                        </Text>
                        {info && (
                            <Tooltip
                                label={info}
                                multiline
                                w={280}
                                withinPortal
                                events={{
                                    hover: true,
                                    focus: false,
                                    touch: true,
                                }}
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
        <Box className={classes.action}>{action}</Box>
    </Group>
);

const LiveSourceAside: FC<{
    projectUuid: string;
    connection: ExternalConnectionListItem;
    connector: ApiConnectorType;
    warehouse: WarehouseTypes | null;
}> = ({ projectUuid, connection, connector, warehouse }) => {
    const { data } = useLiveSourceFields({
        projectUuid,
        connectionUuid: connection.externalConnectionUuid,
    });
    const fields: PreviewField[] = (data?.fields ?? [])
        .filter(({ inUse, isInternal }) => inUse && !isInternal)
        .map(({ name, label, kind }) => ({
            id: name,
            label,
            isMetric: kind === 'metric',
        }));

    if (fields.length === 0) {
        return <ToolsVisual warehouse={warehouse} />;
    }
    return (
        <LiveSourceFieldsVisual
            connector={connector}
            source={getLiveSource(connector).label}
            connectionDetail={
                describeConnections([connection]) ?? connection.name
            }
            fields={fields}
        />
    );
};

const ToolsAside: FC<{
    projectUuid: string;
    connection: ExternalConnectionListItem | null;
    warehouse: WarehouseTypes | null;
}> = ({ projectUuid, connection, warehouse }) => {
    const connector = connection?.apiSource?.connector;
    if (!connection || !connector) {
        return <ToolsVisual warehouse={warehouse} />;
    }
    return (
        <LiveSourceAside
            projectUuid={projectUuid}
            connection={connection}
            connector={connector}
            warehouse={warehouse}
        />
    );
};

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
    const copy = ONBOARDING_STEP_COPY.team;
    const { health } = useApp();
    const hasSlack = health.data?.hasSlack === true;
    const hasTeams = health.data?.hasMicrosoftTeams === true;
    const hasGithub = health.data?.hasGithub === true;
    const hasGitlab = health.data?.hasGitlab === true;
    const { track } = useTracking();
    const queryClient = useQueryClient();
    const slackQuery = useGetSlack();
    const githubQuery = useGithubConfig();
    const isGithubInstalled = hasGithub && githubQuery.data?.enabled === true;
    const gitlabQuery = useGitlabRepositories({ enabled: hasGitlab });
    const isGitlabInstalled = hasGitlab && gitlabQuery.isSuccess;
    const hasConnected =
        (hasSlack && !!slackQuery.data) ||
        isGithubInstalled ||
        isGitlabInstalled;

    // Connect opens a new tab, so pick up the install when the user comes back
    useEffect(() => {
        const refresh = () => {
            void queryClient.invalidateQueries(['slack']);
            void queryClient.invalidateQueries(['github_installation']);
            void queryClient.invalidateQueries(['gitlab_repositories']);
        };
        window.addEventListener('focus', refresh);
        return () => window.removeEventListener('focus', refresh);
    }, [queryClient]);

    if (!hasSlack && !hasTeams && !hasGithub && !hasGitlab) {
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
            journey={{
                currentStep: 4,
                steps: ONBOARDING_DATA_STEPS,
            }}
            stackDepth={3}
            aside={<StepVisual step="team" />}
            activity={<OnboardingRunActivity projectUuid={projectUuid} />}
        >
            <DocumentTitle title={copy.title} />
            <Stack className={classes.column} gap="xl">
                <Stack gap={4}>
                    <Title order={1}>{copy.title}</Title>
                    {copy.subtitle && <Text c="dimmed">{copy.subtitle}</Text>}
                </Stack>

                {(hasSlack || hasTeams) && (
                    <ToolGroup title="Share answers">
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
                    </ToolGroup>
                )}

                {(hasGithub || hasGitlab) && (
                    <ToolGroup title="Review changes">
                        {hasGithub && (
                            <ToolRow
                                icon={
                                    <MantineIcon
                                        icon={IconBrandGithub}
                                        size={24}
                                    />
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
                        {hasGithub && hasGitlab && <Divider />}
                        {hasGitlab && (
                            <ToolRow
                                icon={
                                    <Image
                                        src={gitlabIcon}
                                        alt=""
                                        w={24}
                                        h={24}
                                    />
                                }
                                label="GitLab"
                                description="Save new metrics, charts and dashboards as merge requests"
                                info={null}
                                connectedDetail={
                                    isGitlabInstalled
                                        ? 'GitLab connected'
                                        : null
                                }
                                action={
                                    !isGitlabInstalled &&
                                    connectButton(
                                        '/api/v1/gitlab/install',
                                        false,
                                    )
                                }
                            />
                        )}
                    </ToolGroup>
                )}

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
                                    properties: { screen: 'team' },
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
    const copy = ONBOARDING_STEP_COPY.tools;
    const { track } = useTracking();
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
                    currentStep: isTeamStep ? 4 : 3,
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
    const liveSources = connections.filter(
        (connection) => connection.kind === 'live_source',
    );
    const hasConnected = liveSources.length > 0;
    const latestLiveSource = liveSources[liveSources.length - 1] ?? null;
    const connectLabel = (isConnected: boolean) =>
        isConnected ? 'Add another' : 'Connect';

    return (
        <OnboardingLayout
            screen="tools"
            journey={{
                currentStep: 3,
                steps: ONBOARDING_DATA_STEPS,
            }}
            stackDepth={2}
            activity={<OnboardingRunActivity projectUuid={projectUuid} />}
            aside={
                <ToolsAside
                    projectUuid={projectUuid}
                    connection={latestLiveSource}
                    warehouse={project?.warehouseConnection?.type ?? null}
                />
            }
        >
            <DocumentTitle title="Connect other tools" />
            <Stack className={classes.column} gap="xl">
                <Stack gap={4}>
                    <Title order={1}>{copy.title}</Title>
                    {copy.subtitle && <Text c="dimmed">{copy.subtitle}</Text>}
                </Stack>

                <ToolGroup title="Product analytics">
                    <ToolRow
                        icon={
                            <LiveSourceIcon
                                connector={ApiConnectorType.POSTHOG}
                                size={24}
                            />
                        }
                        label={getLiveSource(ApiConnectorType.POSTHOG).label}
                        description={
                            getLiveSource(ApiConnectorType.POSTHOG).description
                        }
                        info="AI agents query this PostHog project live with HogQL. Sign in, or use a personal API key with the Query Read scope."
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
                    {isPostHogOpen && (
                        <PostHogInlineConnect
                            projectUuid={projectUuid}
                            canSignIn={health.data?.hasPostHogOAuth ?? false}
                            onDone={() => setIsPostHogOpen(false)}
                        />
                    )}
                </ToolGroup>

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
                                    properties: { screen: 'tools' },
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
                    onConnected={closeGoogleSourcePicker}
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
