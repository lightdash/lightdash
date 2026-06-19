import {
    Badge,
    Button,
    Divider,
    Flex,
    Group,
    Loader,
    Paper,
    Stack,
    Text,
    ThemeIcon,
} from '@mantine-8/core';
import { useDisclosure } from '@mantine-8/hooks';
import {
    IconArrowRight,
    IconExternalLink,
    IconFileDiff,
    IconGitPullRequest,
    IconRefresh,
} from '@tabler/icons-react';
import { useMemo } from 'react';
import { useParams } from 'react-router';
import { CategoryBadge } from '../../../../../components/common/CategoryBadge';
import MantineIcon from '../../../../../components/common/MantineIcon';
import PageBreadcrumbs from '../../../../../components/common/PageBreadcrumbs';
import { useProjects } from '../../../../../hooks/useProjects';
import {
    useAiAgentAdminAgents,
    useAiAgentAdminReviewItem,
    useAiAgentReviewItemActivity,
    useAiAgentReviewItemPrDiff,
    useRetestAiAgentReviewRemediation,
} from '../../hooks/useAiAgentAdmin';
import { AgentNamePill } from '../AgentNamePill';
import {
    reviewRootCauseColors,
    reviewRootCauseLabels,
} from './reviewItemDetails';
import { ReviewPrDiffModal } from './ReviewPrDiffModal';
import classes from './ReviewRemediationWorkspace.module.css';
import { WorkspaceThreadPane } from './WorkspaceThreadPane';

type PaneBadge = { label: string; color: string; loading: boolean };

const WORKSPACE_HEIGHT = 'calc(100vh - 170px)';

export const ReviewRemediationWorkspace = () => {
    const { fingerprint } = useParams<{ fingerprint: string }>();

    const { data: reviewItem, isLoading: isItemLoading } =
        useAiAgentAdminReviewItem(fingerprint ?? '', {
            enabled: !!fingerprint,
        });
    const { data: projects = [] } = useProjects();
    const { data: agents = [] } = useAiAgentAdminAgents();

    const remediation = reviewItem?.remediation ?? null;

    const isLive =
        remediation?.status === 'queued' ||
        remediation?.status === 'running' ||
        remediation?.status === 'pr_open' ||
        remediation?.status === 'preview_ready';

    const { data: activity } = useAiAgentReviewItemActivity(fingerprint ?? '', {
        enabled: !!fingerprint,
        refetchInterval: isLive ? 2500 : false,
    });

    const prDiff = useAiAgentReviewItemPrDiff(fingerprint ?? '', {
        enabled: !!reviewItem?.linkedPrUrl,
    });
    const [diffOpen, diffHandlers] = useDisclosure(false);

    const retest = useRetestAiAgentReviewRemediation();

    const projectName = (uuid: string | null | undefined) =>
        projects.find((p) => p.projectUuid === uuid)?.name ?? null;
    const agentFor = (uuid: string | null | undefined) =>
        agents.find((a) => a.uuid === uuid) ?? null;

    const hasVerification =
        activity?.events.some(
            (event) => event.eventType === 'verification_completed',
        ) ?? false;

    const testBadge = useMemo<PaneBadge | null>(() => {
        if (!activity) return null;
        if (activity.liveState === 'writeback')
            return {
                label: 'Waiting for build',
                color: 'gray',
                loading: false,
            };
        if (activity.liveState === 'compiling')
            return { label: 'Building preview', color: 'blue', loading: true };
        if (activity.liveState === 'verifying')
            return { label: 'Testing', color: 'blue', loading: true };
        if (activity.verdictStale)
            return { label: 'Stale — retest', color: 'yellow', loading: false };
        if (hasVerification)
            return { label: 'Verdict ready', color: 'green', loading: false };
        if (remediation?.status === 'failed')
            return { label: 'Failed', color: 'red', loading: false };
        return null;
    }, [activity, hasVerification, remediation?.status]);

    const buildBadge: PaneBadge | null =
        activity?.liveState === 'writeback'
            ? { label: 'Opening PR', color: 'blue', loading: true }
            : null;

    if (isItemLoading) {
        return (
            <Group justify="center" mt="xl">
                <Loader />
            </Group>
        );
    }

    if (!reviewItem || !remediation) {
        return (
            <Stack gap="md">
                <PageBreadcrumbs
                    items={[
                        { title: 'Ask AI', to: '/generalSettings/ai/general' },
                        { title: 'Reviews', to: '/generalSettings/ai/reviews' },
                        { title: 'Workspace', active: true },
                    ]}
                />
                <Text c="dimmed">
                    No remediation workspace for this finding yet. Open a pull
                    request from the reviews board first.
                </Text>
            </Stack>
        );
    }

    const hasBuildThread = !!remediation.workThreadUuid;
    const canRetest =
        !!remediation.previewProjectUuid && !!remediation.previewThreadUuid;
    const hasTestThread =
        !!remediation.previewProjectUuid &&
        !!remediation.previewAgentUuid &&
        !!remediation.previewThreadUuid;

    const buildAgent = agentFor(remediation.sourceAgentUuid);
    const testAgent = agentFor(remediation.previewAgentUuid);
    const buildProjectName = projectName(remediation.sourceProjectUuid);
    const previewProjectName =
        projectName(remediation.previewProjectUuid) ?? 'Preview environment';

    const renderBadge = (badge: PaneBadge) => (
        <Badge
            size="sm"
            variant="light"
            color={badge.color}
            leftSection={
                badge.loading ? (
                    <Loader size={9} color={badge.color} />
                ) : undefined
            }
        >
            {badge.label}
        </Badge>
    );

    const stepIcon = (n: number, color: string) => (
        <ThemeIcon size="sm" radius="xl" variant="filled" color={color}>
            <Text fz="xs" fw={700}>
                {n}
            </Text>
        </ThemeIcon>
    );

    const testPane = (className: string) => (
        <Paper withBorder className={className}>
            <Group justify="space-between" p="sm" wrap="nowrap">
                <Group gap="xs" wrap="nowrap" miw={0}>
                    {stepIcon(2, 'blue')}
                    <Text fw={600} fz="sm">
                        Test the fix
                    </Text>
                    <Text fz="xs" c="dimmed" truncate maw={150}>
                        · {previewProjectName}
                    </Text>
                    {testBadge && renderBadge(testBadge)}
                </Group>
                <Group gap="xs" wrap="nowrap">
                    {hasTestThread && testAgent && (
                        <AgentNamePill
                            name={testAgent.name}
                            imageUrl={testAgent.imageUrl ?? null}
                            variant="inline"
                        />
                    )}
                    <Button
                        size="compact-xs"
                        variant={activity?.verdictStale ? 'filled' : 'light'}
                        color="yellow"
                        disabled={!canRetest}
                        loading={retest.isLoading}
                        leftSection={
                            <MantineIcon icon={IconRefresh} size={16} />
                        }
                        onClick={() =>
                            fingerprint && retest.mutate({ fingerprint })
                        }
                    >
                        Retest
                    </Button>
                </Group>
            </Group>
            <Divider />
            <div className={classes.paneBody}>
                {hasTestThread &&
                remediation.previewProjectUuid &&
                remediation.previewAgentUuid &&
                remediation.previewThreadUuid ? (
                    <WorkspaceThreadPane
                        projectUuid={remediation.previewProjectUuid}
                        agentUuid={remediation.previewAgentUuid}
                        agentName={testAgent?.name ?? 'Verification'}
                        threadUuid={remediation.previewThreadUuid}
                        interactive={false}
                    />
                ) : (
                    <Stack align="center" mt="xl" gap="xs">
                        {isLive && <Loader size="sm" />}
                        <Text c="dimmed" fz="sm" ta="center" maw={320}>
                            {activity?.liveState === 'writeback'
                                ? 'Waiting for the pull request to open…'
                                : activity?.liveState === 'compiling'
                                  ? 'Building the preview environment…'
                                  : activity?.liveState === 'verifying'
                                    ? 'Running verification in the preview…'
                                    : 'The verdict appears here once the preview is ready.'}
                        </Text>
                    </Stack>
                )}
            </div>
        </Paper>
    );

    return (
        <Stack gap="sm" h="100%">
            <Group justify="space-between" align="center" wrap="nowrap">
                <Group gap="sm" wrap="nowrap" miw={0}>
                    <PageBreadcrumbs
                        items={[
                            {
                                title: 'Ask AI',
                                to: '/generalSettings/ai/general',
                            },
                            {
                                title: 'Reviews',
                                to: '/generalSettings/ai/reviews',
                            },
                            { title: reviewItem.title, active: true },
                        ]}
                    />
                    <CategoryBadge
                        color={
                            reviewRootCauseColors[reviewItem.primaryRootCause]
                        }
                        label={
                            reviewRootCauseLabels[reviewItem.primaryRootCause]
                        }
                    />
                </Group>
                <Group gap="xs" wrap="nowrap">
                    {reviewItem.linkedPrUrl && (
                        <Button
                            variant="default"
                            size="xs"
                            leftSection={
                                <MantineIcon icon={IconFileDiff} size={18} />
                            }
                            onClick={diffHandlers.open}
                        >
                            View changes
                            {prDiff.data
                                ? ` (${prDiff.data.files.length})`
                                : ''}
                        </Button>
                    )}
                    {reviewItem.linkedPrUrl && (
                        <Button
                            component="a"
                            href={reviewItem.linkedPrUrl}
                            target="_blank"
                            rel="noreferrer"
                            variant="default"
                            size="xs"
                            leftSection={
                                <MantineIcon
                                    icon={IconGitPullRequest}
                                    size={18}
                                />
                            }
                            rightSection={
                                <MantineIcon
                                    icon={IconExternalLink}
                                    size={16}
                                />
                            }
                        >
                            View PR
                        </Button>
                    )}
                </Group>
            </Group>

            {hasBuildThread ? (
                <Flex gap="sm" className={classes.panes} h={WORKSPACE_HEIGHT}>
                    <Paper
                        withBorder
                        className={`${classes.pane} ${classes.paneBuild}`}
                    >
                        <Group justify="space-between" p="sm" wrap="nowrap">
                            <Group gap="xs" wrap="nowrap" miw={0}>
                                {stepIcon(1, 'indigo')}
                                <Text fw={600} fz="sm">
                                    Build the fix
                                </Text>
                                {buildProjectName && (
                                    <Text fz="xs" c="dimmed" truncate maw={150}>
                                        · {buildProjectName}
                                    </Text>
                                )}
                                {buildBadge && renderBadge(buildBadge)}
                            </Group>
                            {buildAgent && (
                                <AgentNamePill
                                    name={buildAgent.name}
                                    imageUrl={buildAgent.imageUrl ?? null}
                                    variant="inline"
                                />
                            )}
                        </Group>
                        <Divider />
                        {buildBadge && activity?.liveMessage && (
                            <Text fz="xs" c="dimmed" px="sm" py={4} truncate>
                                {activity.liveMessage}
                            </Text>
                        )}
                        <div className={classes.paneBody}>
                            <WorkspaceThreadPane
                                projectUuid={remediation.sourceProjectUuid}
                                agentUuid={remediation.sourceAgentUuid}
                                agentName={buildAgent?.name ?? 'Build fix'}
                                threadUuid={remediation.workThreadUuid!}
                                interactive
                            />
                        </div>
                    </Paper>

                    <Flex className={classes.connector}>
                        <MantineIcon icon={IconArrowRight} size={24} />
                    </Flex>

                    {testPane(
                        `${classes.pane} ${classes.paneTest} ${classes.panePreview}`,
                    )}
                </Flex>
            ) : (
                <Flex
                    direction="column"
                    gap="sm"
                    className={classes.panes}
                    h={WORKSPACE_HEIGHT}
                >
                    <Paper withBorder p="sm">
                        <Group justify="space-between" wrap="nowrap">
                            <Group gap="xs" wrap="nowrap" miw={0}>
                                {stepIcon(1, 'indigo')}
                                <Text fw={600} fz="sm">
                                    Deterministic fix
                                </Text>
                                <Text fz="xs" c="dimmed" truncate>
                                    · Project context — written without a build
                                    conversation
                                </Text>
                            </Group>
                            {reviewItem.linkedPrUrl && (
                                <Button
                                    variant="subtle"
                                    color="gray"
                                    size="compact-xs"
                                    leftSection={
                                        <MantineIcon
                                            icon={IconFileDiff}
                                            size={16}
                                        />
                                    }
                                    onClick={diffHandlers.open}
                                >
                                    View the change
                                </Button>
                            )}
                        </Group>
                    </Paper>
                    {testPane(`${classes.pane} ${classes.panePreview}`)}
                </Flex>
            )}

            <ReviewPrDiffModal
                opened={diffOpen}
                onClose={diffHandlers.close}
                diff={prDiff.data}
                isLoading={prDiff.isLoading}
            />
        </Stack>
    );
};
