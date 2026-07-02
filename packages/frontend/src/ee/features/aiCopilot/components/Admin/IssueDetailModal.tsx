import { capitalize } from '@lightdash/common';
import {
    Anchor,
    Box,
    Button,
    Group,
    Loader,
    Paper,
    Stack,
    Text,
    UnstyledButton,
} from '@mantine-8/core';
import {
    IconArrowLeft,
    IconExternalLink,
    IconFileHorizontal,
    IconGitPullRequest,
    IconLayoutColumns,
    IconMessageCircle2,
} from '@tabler/icons-react';
import { type FC, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { CategoryBadge } from '../../../../../components/common/CategoryBadge';
import MantineIcon from '../../../../../components/common/MantineIcon';
import MantineModal from '../../../../../components/common/MantineModal';
import { useProjects } from '../../../../../hooks/useProjects';
import { useAiAgentAdminReviewItems } from '../../hooks/useAiAgentAdmin';
import { useAiAgentThread } from '../../hooks/useProjectAiAgents';
import { AgentChatDisplay } from '../ChatElements/AgentChatDisplay';
import styles from './IssueDetailModal.module.css';
import { RemediationActivityTimeline } from './RemediationActivityTimeline';
import { ReviewAssigneeMenu } from './ReviewAssigneeMenu';
import { ReviewItemActions } from './ReviewItemActions';
import {
    formatReviewDate,
    getIssueTitle,
    getReviewReasoningText,
} from './reviewItemDetails';
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
    <Group className={styles.railRow} justify="space-between" wrap="nowrap">
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
    const [showEvidence, setShowEvidence] = useState(false);
    const hasThread = Boolean(projectUuid && agentUuid && threadUuid);
    const { data: threadData, isLoading: isLoadingThread } = useAiAgentThread(
        projectUuid ?? '',
        agentUuid ?? undefined,
        threadUuid,
    );
    const { data: reviewItems = [], isLoading: isLoadingItems } =
        useAiAgentAdminReviewItems(
            { statuses: THREAD_REVIEW_ITEM_STATUSES },
            { enabled: isOpen },
        );
    const { data: projects = [] } = useProjects();

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
    const isLoading = isLoadingItems || (hasThread && isLoadingThread);

    const workspaceUrl = item
        ? `/generalSettings/ai/reviews/${encodeURIComponent(item.fingerprint)}`
        : null;

    return (
        <MantineModal
            opened={isOpen}
            onClose={onClose}
            size="60rem"
            title="Issue"
            icon={IconFileHorizontal}
            cancelLabel={false}
            modalBodyProps={{ py: 'lg' }}
            bodyScrollAreaMaxHeight="calc(85vh - 120px)"
            headerActions={
                item?.remediation && workspaceUrl ? (
                    <Button
                        component={Link}
                        to={workspaceUrl}
                        onClick={onClose}
                        size="xs"
                        variant="default"
                        radius="md"
                        leftSection={
                            <MantineIcon icon={IconLayoutColumns} size={14} />
                        }
                    >
                        Open workspace
                    </Button>
                ) : null
            }
        >
            {isLoading || !item || (hasThread && !threadData) ? (
                <Group justify="center" p="5rem">
                    <Loader color="gray" size="sm" />
                </Group>
            ) : (
                <Box className={styles.layout}>
                    <Stack className={styles.main} gap={0}>
                        <CategoryBadge
                            variant="dot"
                            label={
                                threadReviewRootCauseLabels[
                                    item.primaryRootCause
                                ]
                            }
                            color={
                                threadReviewRootCauseColors[
                                    item.primaryRootCause
                                ]
                            }
                            className={styles.causeBadge}
                        />
                        <Text className={styles.title}>
                            {getIssueTitle(item)}
                        </Text>

                        {reasoningText && (
                            <Text className={styles.description}>
                                {reasoningText}
                            </Text>
                        )}

                        <Stack gap="sm" mt="xl">
                            <Group justify="space-between" align="center">
                                <Text className={styles.sectionLabel}>
                                    {showEvidence ? 'Evidence' : 'Activity'}
                                </Text>
                                {hasThread && (
                                    <Group gap="md" wrap="nowrap">
                                        {showEvidence && (
                                            <Anchor
                                                href={`/projects/${projectUuid}/ai-agents/${agentUuid}/threads/${threadUuid}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className={styles.toggle}
                                            >
                                                Open full thread
                                                <MantineIcon
                                                    icon={IconExternalLink}
                                                    size={13}
                                                    stroke={1.5}
                                                />
                                            </Anchor>
                                        )}
                                        <UnstyledButton
                                            className={styles.toggle}
                                            onClick={() =>
                                                setShowEvidence((open) => !open)
                                            }
                                        >
                                            <MantineIcon
                                                icon={
                                                    showEvidence
                                                        ? IconArrowLeft
                                                        : IconMessageCircle2
                                                }
                                                size={13}
                                                stroke={1.5}
                                            />
                                            {showEvidence
                                                ? 'Back to activity'
                                                : 'Show evidence'}
                                        </UnstyledButton>
                                    </Group>
                                )}
                            </Group>

                            {showEvidence &&
                            threadData &&
                            projectUuid &&
                            agentUuid ? (
                                <Box
                                    className={`${styles.panel} ${styles.evidenceScroll}`}
                                >
                                    <AgentChatDisplay
                                        thread={threadData}
                                        projectUuid={projectUuid}
                                        agentUuid={agentUuid}
                                        renderArtifactsInline
                                        showAddToEvalsButton
                                    />
                                </Box>
                            ) : (
                                <Box className={styles.panel}>
                                    <RemediationActivityTimeline
                                        reviewItem={item}
                                    />
                                </Box>
                            )}
                        </Stack>
                    </Stack>

                    <Paper
                        component="aside"
                        withBorder
                        radius="md"
                        p="md"
                        className={styles.rail}
                        aria-label="Issue properties"
                    >
                        <Stack gap={2}>
                            <RailRow label="Status">
                                <Group gap={6} wrap="nowrap">
                                    <Box
                                        className={styles.statusDot}
                                        bg={`${threadReviewStatusColors[item.status]}.6`}
                                    />
                                    <Text className={styles.railText}>
                                        {capitalize(
                                            item.status.replaceAll('_', ' '),
                                        )}
                                    </Text>
                                </Group>
                            </RailRow>
                            <RailRow label="Assignee">
                                <ReviewAssigneeMenu
                                    projectUuid={item.projectUuid}
                                    fingerprint={item.fingerprint}
                                    assignedToUserUuid={item.assignedToUserUuid}
                                />
                            </RailRow>
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

                        <Box className={styles.railActions}>
                            <ReviewItemActions
                                reviewItem={item}
                                mode="drawer"
                                hideWorkspaceLink
                            />
                        </Box>
                    </Paper>
                </Box>
            )}
        </MantineModal>
    );
};
