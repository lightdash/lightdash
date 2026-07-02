import { capitalize } from '@lightdash/common';
import {
    Anchor,
    Box,
    Button,
    Group,
    Loader,
    Stack,
    Text,
    Tooltip,
} from '@mantine-8/core';
import { useDisclosure } from '@mantine/hooks';
import {
    IconArrowRight,
    IconExternalLink,
    IconGitPullRequest,
    IconMessages,
} from '@tabler/icons-react';
import { type FC, useMemo } from 'react';
import { LightdashUserAvatar } from '../../../../../components/Avatar';
import { AiMarkdown } from '../../../../../components/common/AiMarkdown';
import { CategoryBadge } from '../../../../../components/common/CategoryBadge';
import MantineIcon from '../../../../../components/common/MantineIcon';
import MantineModal from '../../../../../components/common/MantineModal';
import { useProjects } from '../../../../../hooks/useProjects';
import { useAiAgentAdminReviewItems } from '../../hooks/useAiAgentAdmin';
import {
    useAiAgentThread,
    useProjectAiAgent,
} from '../../hooks/useProjectAiAgents';
import { AgentChatDisplay } from '../ChatElements/AgentChatDisplay';
import { getRenderableExcerpts } from './evidenceExcerptHelpers';
import { EvidenceExcerpts } from './EvidenceExcerpts';
import styles from './IssueDetailModal.module.css';
import { RemediationActivityTimeline } from './RemediationActivityTimeline';
import { ReviewAssigneeMenu } from './ReviewAssigneeMenu';
import { ReviewItemActions } from './ReviewItemActions';
import {
    formatReviewDate,
    getIssueTitle,
    getReviewReasoningText,
    getTargetAnchor,
    shouldShowWritebackBlockedReason,
    writebackBlockedReasonDescriptions,
    writebackBlockedReasonLabels,
} from './reviewItemDetails';
import { ReviewPriorityMenu } from './ReviewPriorityMenu';
import { ReviewWorkspaceSummary } from './ReviewWorkspaceSummary';
import {
    THREAD_REVIEW_ITEM_STATUSES,
    threadReviewRootCauseColors,
    threadReviewRootCauseLabels,
    threadReviewStatusColors,
} from './threadReviewContext';

type Props = {
    // Thread coordinates are null for manual issues, which have no source
    // thread — the modal then renders from the review item alone.
    projectUuid: string | null;
    agentUuid: string | null;
    threadUuid: string | null;
    selectedReviewItemUuid: string;
    isOpen: boolean;
    onClose: () => void;
};

const RailRow: FC<{ label: string; children: React.ReactNode }> = ({
    label,
    children,
}) => (
    <Group className={styles.railRow} wrap="nowrap" gap="sm">
        <Text className={styles.railLabel}>{label}</Text>
        <Box className={styles.railValue}>{children}</Box>
    </Group>
);

export const IssueDetailModal: FC<Props> = ({
    projectUuid,
    agentUuid,
    threadUuid,
    selectedReviewItemUuid,
    isOpen,
    onClose,
}) => {
    const [threadOpened, { open: openThread, close: closeThread }] =
        useDisclosure(false);
    const hasThread = Boolean(projectUuid && agentUuid && threadUuid);
    const { data: threadData } = useAiAgentThread(
        projectUuid ?? '',
        agentUuid ?? undefined,
        threadUuid,
        { enabled: threadOpened && hasThread },
    );
    const { data: reviewItems = [], isLoading: isLoadingItems } =
        useAiAgentAdminReviewItems(
            { statuses: THREAD_REVIEW_ITEM_STATUSES },
            { enabled: isOpen },
        );
    const { data: projects = [] } = useProjects();
    const { data: agent } = useProjectAiAgent(
        projectUuid ?? undefined,
        agentUuid ?? undefined,
    );

    const item = useMemo(
        () =>
            reviewItems.find(
                (reviewItem) => reviewItem.uuid === selectedReviewItemUuid,
            ) ?? null,
        [reviewItems, selectedReviewItemUuid],
    );

    const projectName = useMemo(() => {
        if (!item) return null;
        const reviewProjectUuid =
            item.latestFinding?.projectUuid ?? item.projectUuid ?? projectUuid;
        return (
            projects.find((p) => p.projectUuid === reviewProjectUuid)?.name ??
            null
        );
    }, [item, projects, projectUuid]);

    const seenValue = item
        ? formatReviewDate(item.firstSeenAt) ===
          formatReviewDate(item.lastSeenAt)
            ? formatReviewDate(item.lastSeenAt)
            : `${formatReviewDate(item.firstSeenAt)} – ${formatReviewDate(item.lastSeenAt)}`
        : null;
    const reasoningText = item ? getReviewReasoningText(item) : null;
    const targetAnchor = item ? getTargetAnchor(item) : null;
    const excerpts = item?.latestFinding?.evidenceExcerpts ?? [];
    const hasExcerpts = getRenderableExcerpts(excerpts).length > 0;

    const blockedReason =
        item && !item.writebackEligibility.eligible
            ? item.writebackEligibility.reason
            : null;
    const blockedReasonLabel = shouldShowWritebackBlockedReason(blockedReason)
        ? writebackBlockedReasonLabels[blockedReason]
        : null;
    // Only the actionable reasons carry a description (e.g. "connect GitHub /
    // GitLab"). Gate the rail note on it so noisy states like "a PR is already
    // open" stay out — they're not something the user needs to act on here.
    const blockedReasonDescription = shouldShowWritebackBlockedReason(
        blockedReason,
    )
        ? (writebackBlockedReasonDescriptions[blockedReason] ?? null)
        : null;

    const headerTitle = item ? getIssueTitle(item) : 'Issue';

    return (
        <>
            <MantineModal
                opened={isOpen}
                onClose={onClose}
                size="72rem"
                title={
                    <Text
                        component="span"
                        className={styles.headerTitle}
                        lineClamp={2}
                    >
                        {headerTitle}
                    </Text>
                }
                cancelLabel={false}
                modalBodyProps={{ py: 'lg' }}
                bodyScrollAreaMaxHeight="calc(85vh - 120px)"
                headerActions={
                    item ? (
                        <ReviewItemActions
                            reviewItem={item}
                            mode="header"
                            hideWorkspaceLink
                            hideBlockedReason
                        />
                    ) : null
                }
            >
                {isLoadingItems || !item ? (
                    <Group justify="center" p="5rem">
                        <Loader color="gray" size="sm" />
                    </Group>
                ) : (
                    <Box className={styles.layout}>
                        <Stack className={styles.main} gap={0}>
                            <Group
                                gap="sm"
                                align="center"
                                wrap="wrap"
                                className={styles.metaRow}
                            >
                                <CategoryBadge
                                    color={
                                        threadReviewRootCauseColors[
                                            item.primaryRootCause
                                        ]
                                    }
                                    label={
                                        threadReviewRootCauseLabels[
                                            item.primaryRootCause
                                        ]
                                    }
                                />
                                {targetAnchor && (
                                    <Tooltip
                                        label={targetAnchor}
                                        withArrow
                                        openDelay={300}
                                        multiline
                                        maw={340}
                                    >
                                        <Text className={styles.targetChip}>
                                            {targetAnchor}
                                        </Text>
                                    </Tooltip>
                                )}
                                {item.findingCount > 1 && (
                                    <>
                                        <Box
                                            component="span"
                                            className={styles.metaSep}
                                        />
                                        <Text className={styles.recurrence}>
                                            Recurs {item.findingCount}×
                                        </Text>
                                    </>
                                )}
                            </Group>

                            <Stack gap="md">
                                <Text className={styles.sectionLabel}>
                                    Description
                                </Text>
                                {reasoningText && (
                                    <Box className={styles.description}>
                                        <AiMarkdown>{reasoningText}</AiMarkdown>
                                    </Box>
                                )}
                            </Stack>

                            <Stack gap={0} mt={28}>
                                {/* Activity — the issue lifecycle. Short and
                                high-signal, so it leads. */}
                                <Stack gap="md">
                                    <Text className={styles.sectionLabel}>
                                        Activity
                                    </Text>
                                    <Box className={styles.panel}>
                                        <RemediationActivityTimeline
                                            reviewItem={item}
                                        />
                                    </Box>
                                </Stack>

                                {/* Evidence — the curated turns the review cited.
                                The full conversation opens in a stacked modal so
                                a long thread keeps the room it needs to read.
                                Manual issues have neither, so the section is
                                omitted. */}
                                {(hasThread || hasExcerpts) && (
                                    <Stack
                                        gap="md"
                                        className={styles.evidenceSection}
                                    >
                                        <Group
                                            justify="space-between"
                                            align="center"
                                            wrap="nowrap"
                                        >
                                            <Text
                                                className={styles.sectionLabel}
                                            >
                                                Evidence
                                            </Text>
                                            {hasThread && (
                                                <Button
                                                    variant="subtle"
                                                    color="gray"
                                                    size="compact-xs"
                                                    className={
                                                        styles.conversationButton
                                                    }
                                                    onClick={openThread}
                                                    leftSection={
                                                        <MantineIcon
                                                            icon={IconMessages}
                                                            size={14}
                                                            stroke={1.6}
                                                        />
                                                    }
                                                    rightSection={
                                                        <MantineIcon
                                                            icon={
                                                                IconArrowRight
                                                            }
                                                            size={13}
                                                            stroke={1.6}
                                                        />
                                                    }
                                                >
                                                    Read full conversation
                                                </Button>
                                            )}
                                        </Group>
                                        {hasExcerpts ? (
                                            <EvidenceExcerpts
                                                excerpts={excerpts}
                                            />
                                        ) : (
                                            <Text
                                                className={styles.evidenceEmpty}
                                            >
                                                No excerpts were captured — open
                                                the full conversation to see
                                                what triggered this.
                                            </Text>
                                        )}
                                    </Stack>
                                )}
                            </Stack>
                        </Stack>

                        <Box className={styles.divider} />

                        <Stack gap="sm" className={styles.railColumn}>
                            <Box
                                component="aside"
                                className={styles.railCard}
                                aria-label="Issue properties"
                            >
                                <Stack gap={2}>
                                    <RailRow label="Status">
                                        <Box
                                            className={styles.statusPill}
                                            component="span"
                                        >
                                            <Box
                                                className={styles.statusDot}
                                                bg={`${threadReviewStatusColors[item.status]}.6`}
                                            />
                                            <Text className={styles.railText}>
                                                {capitalize(
                                                    item.status.replaceAll(
                                                        '_',
                                                        ' ',
                                                    ),
                                                )}
                                            </Text>
                                        </Box>
                                    </RailRow>
                                    <RailRow label="Priority">
                                        <ReviewPriorityMenu
                                            fingerprint={item.fingerprint}
                                            priority={item.priority}
                                            bordered={false}
                                            className={styles.railBadge}
                                        />
                                    </RailRow>
                                    <RailRow label="Assignee">
                                        <ReviewAssigneeMenu
                                            projectUuid={item.projectUuid}
                                            fingerprint={item.fingerprint}
                                            assignedToUserUuid={
                                                item.assignedToUserUuid
                                            }
                                            withName
                                        />
                                    </RailRow>
                                    {agent && (
                                        <RailRow label="Agent">
                                            <Group gap={6} wrap="nowrap">
                                                <LightdashUserAvatar
                                                    size={18}
                                                    name={agent.name}
                                                    src={agent.imageUrl}
                                                />
                                                <Text
                                                    className={styles.railText}
                                                >
                                                    {agent.name}
                                                </Text>
                                            </Group>
                                        </RailRow>
                                    )}
                                    {projectName && (
                                        <RailRow label="Project">
                                            <Text className={styles.railText}>
                                                {projectName}
                                            </Text>
                                        </RailRow>
                                    )}
                                    {seenValue && (
                                        <RailRow label="Seen">
                                            <Text className={styles.railText}>
                                                {seenValue}
                                            </Text>
                                        </RailRow>
                                    )}
                                    {item.linkedPrUrl && (
                                        <RailRow label="Pull request">
                                            <Anchor
                                                href={item.linkedPrUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className={styles.railLink}
                                            >
                                                <MantineIcon
                                                    icon={IconGitPullRequest}
                                                    size={14}
                                                    stroke={1.4}
                                                />
                                                View PR
                                            </Anchor>
                                        </RailRow>
                                    )}
                                </Stack>

                                <ReviewWorkspaceSummary
                                    reviewItem={item}
                                    onNavigate={onClose}
                                />

                                {blockedReasonDescription && (
                                    <Stack
                                        gap={3}
                                        className={styles.blockedNote}
                                    >
                                        <Text className={styles.blockedTitle}>
                                            {blockedReasonLabel}
                                        </Text>
                                        <Text className={styles.blockedText}>
                                            {blockedReasonDescription}
                                        </Text>
                                    </Stack>
                                )}
                            </Box>
                        </Stack>
                    </Box>
                )}
            </MantineModal>

            {projectUuid && agentUuid && threadUuid && (
                <MantineModal
                    opened={threadOpened}
                    onClose={closeThread}
                    size="46rem"
                    title="Conversation"
                    cancelLabel={false}
                    modalBodyProps={{ px: 0, py: 0 }}
                    bodyScrollAreaMaxHeight="calc(85vh - 130px)"
                    headerActions={
                        <Anchor
                            href={`/projects/${projectUuid}/ai-agents/${agentUuid}/threads/${threadUuid}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={styles.toggle}
                        >
                            Open in tab
                            <MantineIcon
                                icon={IconExternalLink}
                                size={13}
                                stroke={1.5}
                            />
                        </Anchor>
                    }
                >
                    {threadData ? (
                        <AgentChatDisplay
                            thread={threadData}
                            projectUuid={projectUuid}
                            agentUuid={agentUuid}
                            height="auto"
                            renderArtifactsInline
                            showAddToEvalsButton
                        />
                    ) : (
                        <Group justify="center" p="4rem">
                            <Loader color="gray" size="sm" />
                        </Group>
                    )}
                </MantineModal>
            )}
        </>
    );
};
