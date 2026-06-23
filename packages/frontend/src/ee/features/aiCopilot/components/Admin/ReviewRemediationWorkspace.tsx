import { ProjectType } from '@lightdash/common';
import {
    Box,
    Button,
    CloseButton,
    Collapse,
    Divider,
    Drawer,
    Flex,
    Group,
    Loader,
    Paper,
    Stack,
    Text,
    ThemeIcon,
    UnstyledButton,
} from '@mantine-8/core';
import { useDisclosure } from '@mantine-8/hooks';
import {
    IconAlertTriangle,
    IconChevronDown,
    IconChevronRight,
    IconCircleCheck,
    IconExternalLink,
    IconFlask,
    IconGitPullRequest,
    IconRefresh,
} from '@tabler/icons-react';
import { useMemo } from 'react';
import { useParams } from 'react-router';
import { CategoryBadge } from '../../../../../components/common/CategoryBadge';
import MantineIcon from '../../../../../components/common/MantineIcon';
import {
    BANNER_HEIGHT,
    NAVBAR_HEIGHT,
} from '../../../../../components/common/Page/constants';
import PageBreadcrumbs from '../../../../../components/common/PageBreadcrumbs';
import { useActiveProjectUuid } from '../../../../../hooks/useActiveProject';
import { useProject } from '../../../../../hooks/useProject';
import { useProjects } from '../../../../../hooks/useProjects';
import { useImpersonation } from '../../../../../hooks/user/useImpersonation';
import {
    useAiAgentAdminAgents,
    useAiAgentAdminReviewItem,
    useAiAgentReviewItemActivity,
    useAiAgentReviewItemPrDiff,
    useRetestAiAgentReviewRemediation,
} from '../../hooks/useAiAgentAdmin';
import { AgentNamePill } from '../AgentNamePill';
import { MarkResolvedModal } from './MarkResolvedModal';
import {
    reviewRootCauseColors,
    reviewRootCauseLabels,
} from './reviewItemDetails';
import { ReviewPrDiffContent } from './ReviewPrDiffContent';
import classes from './ReviewRemediationWorkspace.module.css';
import { WorkspaceThreadPane } from './WorkspaceThreadPane';

type PaneBadge = { label: string; color: string; loading: boolean };

const WORKSPACE_HEIGHT = 'calc(100vh - 170px)';

export const ReviewRemediationWorkspace = () => {
    const { fingerprint } = useParams<{ fingerprint: string }>();

    // The drawer is anchored below the fixed navbar (and the preview/impersonation
    // banner when one is showing), so its header isn't hidden under them.
    const { activeProjectUuid } = useActiveProjectUuid();
    const { data: activeProject } = useProject(activeProjectUuid);
    const { isImpersonating } = useImpersonation();
    const hasBanner =
        activeProject?.type === ProjectType.PREVIEW || isImpersonating;
    const drawerTopOffset = NAVBAR_HEIGHT + (hasBanner ? BANNER_HEIGHT : 0);

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
    const [resolveOpen, resolveHandlers] = useDisclosure(false);
    const [testDrawerOpen, testDrawerHandlers] = useDisclosure(false);

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

    // A verdict is trustworthy enough to encourage resolving only once it's in
    // and not stale (the fix changed since it was last tested).
    const isVerified = hasVerification && !activity?.verdictStale;

    // A single header pill that opens the test drawer, in place of separate Test
    // and Retest buttons. It mirrors testBadge, with a "Test the fix" CTA when
    // nothing has run yet. It stays a loud (filled) CTA while there's something
    // to verify, and calms to a light status once a verdict is in — so the
    // emphasis hands off to the black Resolve button at the right moment.
    const verdictPill = useMemo(() => {
        const base = testBadge ?? {
            label: 'Test the fix',
            color: 'blue',
            loading: false,
        };
        const icon =
            base.color === 'green'
                ? IconCircleCheck
                : base.color === 'red'
                  ? IconAlertTriangle
                  : base.color === 'yellow'
                    ? IconRefresh
                    : IconFlask;
        const variant: 'light' | 'filled' =
            base.color === 'green' ? 'light' : 'filled';
        return { ...base, icon, variant };
    }, [testBadge]);

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

    const renderBadge = (badge: PaneBadge, onColor = false) => (
        <Group gap={6} wrap="nowrap" align="center">
            {badge.loading && (
                <Loader size={10} color={onColor ? 'white' : 'gray'} />
            )}
            <Text
                fz="xs"
                fw={500}
                c={onColor ? 'white' : badge.color === 'red' ? 'red' : 'dimmed'}
            >
                {badge.label}
            </Text>
        </Group>
    );

    const buildPane = (className: string) => (
        <Paper withBorder className={className}>
            <Group justify="space-between" p="sm" wrap="nowrap">
                <Group gap="xs" wrap="nowrap" miw={0}>
                    <ThemeIcon
                        size="sm"
                        radius="md"
                        variant="light"
                        color="gray"
                    >
                        <MantineIcon icon={IconGitPullRequest} size={14} />
                    </ThemeIcon>
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
    );

    const retestButton = (
        <Button
            size="compact-sm"
            variant={activity?.verdictStale ? 'filled' : 'light'}
            color="yellow"
            disabled={!canRetest}
            loading={retest.isLoading}
            leftSection={<MantineIcon icon={IconRefresh} size={16} />}
            onClick={() => fingerprint && retest.mutate({ fingerprint })}
        >
            Test again
        </Button>
    );

    // The verification conversation (or the live waiting state). Shared by the
    // inline deterministic-fix pane and the test drawer's scroll container.
    const testThreadBody = (
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
    );

    const testPane = (className: string) => (
        <Paper withBorder className={className}>
            <Group
                justify="space-between"
                p="sm"
                wrap="nowrap"
                className={classes.testHeader}
            >
                <Group gap="xs" wrap="nowrap" miw={0}>
                    <ThemeIcon
                        size="sm"
                        radius="md"
                        variant="light"
                        color="blue"
                    >
                        <MantineIcon icon={IconFlask} size={14} />
                    </ThemeIcon>
                    <Text fw={600} fz="sm">
                        Test the fix
                    </Text>
                    <Text fz="xs" c="dimmed" truncate maw={150}>
                        · {previewProjectName}
                    </Text>
                    {testBadge && renderBadge(testBadge)}
                </Group>
                {retestButton}
            </Group>
            <Divider />
            {testThreadBody}
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
                    {reviewItem.linkedPrUrl && !hasBuildThread && (
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
                    {hasBuildThread && (
                        <Button
                            size="xs"
                            color={verdictPill.color}
                            variant={verdictPill.variant}
                            onClick={testDrawerHandlers.open}
                            leftSection={
                                verdictPill.loading ? (
                                    <Loader
                                        size={14}
                                        color={
                                            verdictPill.variant === 'filled'
                                                ? 'white'
                                                : verdictPill.color
                                        }
                                    />
                                ) : (
                                    <MantineIcon
                                        icon={verdictPill.icon}
                                        size={16}
                                    />
                                )
                            }
                            rightSection={
                                <MantineIcon
                                    icon={IconChevronRight}
                                    size={14}
                                />
                            }
                        >
                            {verdictPill.label}
                        </Button>
                    )}
                    {reviewItem.status !== 'resolved' && (
                        <Button
                            color="dark"
                            size="xs"
                            variant={isVerified ? 'filled' : 'default'}
                            leftSection={
                                <MantineIcon icon={IconCircleCheck} size={18} />
                            }
                            onClick={resolveHandlers.open}
                        >
                            Resolve
                        </Button>
                    )}
                </Group>
            </Group>

            {hasBuildThread ? (
                <Flex className={classes.panes} h={WORKSPACE_HEIGHT}>
                    {buildPane(`${classes.pane}`)}
                </Flex>
            ) : (
                <Flex
                    direction="column"
                    gap="sm"
                    className={classes.panes}
                    h={WORKSPACE_HEIGHT}
                >
                    <Paper withBorder p="sm">
                        <Group gap="xs" wrap="nowrap" miw={0}>
                            <ThemeIcon
                                size="sm"
                                radius="md"
                                variant="light"
                                color="gray"
                            >
                                <MantineIcon
                                    icon={IconGitPullRequest}
                                    size={14}
                                />
                            </ThemeIcon>
                            <Text fw={600} fz="sm">
                                Deterministic fix
                            </Text>
                            <Text fz="xs" c="dimmed" truncate>
                                · Project context, written without a build
                                conversation
                            </Text>
                        </Group>
                    </Paper>
                    {testPane(`${classes.pane}`)}
                </Flex>
            )}

            {reviewItem.linkedPrUrl && (
                <Paper withBorder radius="md">
                    <UnstyledButton
                        className={classes.diffHeader}
                        onClick={diffHandlers.toggle}
                    >
                        <Group gap="xs" wrap="nowrap">
                            <MantineIcon
                                icon={
                                    diffOpen
                                        ? IconChevronDown
                                        : IconChevronRight
                                }
                                color="dimmed"
                            />
                            <Text fw={600} fz="sm">
                                Changes
                            </Text>
                            {prDiff.data && (
                                <Text fz="xs" c="dimmed">
                                    {prDiff.data.files.length}{' '}
                                    {prDiff.data.files.length === 1
                                        ? 'file'
                                        : 'files'}
                                </Text>
                            )}
                        </Group>
                    </UnstyledButton>
                    <Collapse in={diffOpen}>
                        <Divider />
                        <Box p="sm">
                            {diffOpen && (
                                <ReviewPrDiffContent
                                    diff={prDiff.data}
                                    isLoading={prDiff.isLoading}
                                    maxHeight="420px"
                                />
                            )}
                        </Box>
                    </Collapse>
                </Paper>
            )}

            <Drawer
                opened={testDrawerOpen}
                onClose={testDrawerHandlers.close}
                position="right"
                size="xl"
                padding={0}
                withCloseButton={false}
                classNames={{
                    inner: classes.drawerInner,
                    overlay: classes.drawerOverlay,
                    body: classes.drawerBody,
                }}
                __vars={{ '--drawer-top-offset': `${drawerTopOffset}px` }}
            >
                <Box p="md" className={classes.drawerHeader}>
                    <Group
                        justify="space-between"
                        align="flex-start"
                        wrap="nowrap"
                    >
                        <Group gap="sm" wrap="nowrap" miw={0}>
                            <ThemeIcon
                                size="lg"
                                radius="md"
                                variant="white"
                                color="blue"
                            >
                                <MantineIcon icon={IconFlask} size={20} />
                            </ThemeIcon>
                            <Box miw={0}>
                                <Group gap="xs" wrap="nowrap" miw={0}>
                                    <Text fw={700} fz="md">
                                        Test the fix
                                    </Text>
                                    {testBadge && renderBadge(testBadge)}
                                </Group>
                                <Text fz="xs" c="dimmed" truncate>
                                    Preview environment · {previewProjectName}
                                </Text>
                            </Box>
                        </Group>
                        <CloseButton onClick={testDrawerHandlers.close} />
                    </Group>
                    <Text fz="sm" c="dimmed" mt="sm">
                        We spun up a{' '}
                        <Text span fw={600} c="bright" fz="inherit">
                            throwaway copy
                        </Text>{' '}
                        of your project with this fix applied.{' '}
                        <Text span fw={600} c="bright" fz="inherit">
                            {testAgent?.name ?? 'Your agent'}
                        </Text>{' '}
                        re-runs the original question against it, so you can see
                        whether the answer is right{' '}
                        <Text span fw={600} c="bright" fz="inherit">
                            before you merge
                        </Text>
                        .{' '}
                        <Text span fw={600} c="bright" fz="inherit">
                            Nothing here touches production.
                        </Text>
                    </Text>
                    <Group justify="flex-end" mt="sm">
                        {retestButton}
                    </Group>
                </Box>
                {testThreadBody}
            </Drawer>

            <MarkResolvedModal
                opened={resolveOpen}
                onClose={resolveHandlers.close}
                fingerprint={reviewItem.fingerprint}
                projectUuid={remediation.sourceProjectUuid}
                prUrl={reviewItem.linkedPrUrl}
            />
        </Stack>
    );
};
