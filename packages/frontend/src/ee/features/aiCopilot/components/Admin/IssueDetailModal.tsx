import {
    Anchor,
    Box,
    Group,
    Loader,
    Stack,
    Text,
    Title,
} from '@mantine-8/core';
import { IconGitPullRequest } from '@tabler/icons-react';
import { type FC, useMemo } from 'react';
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
    getCompactIssueTitle,
    getReviewReasoningText,
} from './reviewItemDetails';
import {
    summarizeThreadReviewItems,
    THREAD_REVIEW_ITEM_STATUSES,
    threadReviewRootCauseColors,
    threadReviewRootCauseLabels,
} from './threadReviewContext';

type Props = {
    projectUuid: string;
    agentUuid: string;
    threadUuid: string;
    selectedReviewItemUuid: string;
    isOpen: boolean;
    onClose: () => void;
};

const RailField: FC<{ label: string; children: React.ReactNode }> = ({
    label,
    children,
}) => (
    <Stack gap={4}>
        <Text fz={10} fw={700} c="dimmed" tt="uppercase" lts={0.4}>
            {label}
        </Text>
        {children}
    </Stack>
);

export const IssueDetailModal: FC<Props> = ({
    projectUuid,
    agentUuid,
    threadUuid,
    selectedReviewItemUuid,
    isOpen,
    onClose,
}) => {
    const { data: threadData, isLoading: isLoadingThread } = useAiAgentThread(
        projectUuid,
        agentUuid,
        threadUuid,
    );
    const { data: reviewItems = [], isLoading: isLoadingItems } =
        useAiAgentAdminReviewItems(
            { statuses: THREAD_REVIEW_ITEM_STATUSES },
            { enabled: isOpen },
        );
    const { data: projects = [] } = useProjects();

    const reviewSummary = useMemo(
        () => summarizeThreadReviewItems(reviewItems, threadUuid),
        [reviewItems, threadUuid],
    );
    const item = useMemo(
        () =>
            reviewSummary.items.find(
                (reviewItem) => reviewItem.uuid === selectedReviewItemUuid,
            ) ?? null,
        [reviewSummary.items, selectedReviewItemUuid],
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
    const isLoading = isLoadingThread || isLoadingItems;

    return (
        <MantineModal
            opened={isOpen}
            onClose={onClose}
            size="80%"
            title="Issue"
            cancelLabel="Close"
            bodyScrollAreaMaxHeight="calc(85vh - 140px)"
        >
            {isLoading || !item || !threadData ? (
                <Group justify="center" p="xl">
                    <Loader color="gray" />
                </Group>
            ) : (
                <Box className={styles.layout}>
                    <Stack className={styles.main} gap="lg">
                        <Stack gap="xs">
                            <Group gap={8} wrap="wrap">
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
                                />
                            </Group>
                            <Title order={4} fw={600}>
                                {getCompactIssueTitle(item)}
                            </Title>
                            {reasoningText && (
                                <Text fz="sm" c="ldGray.7" lh={1.55}>
                                    {reasoningText}
                                </Text>
                            )}
                        </Stack>

                        <Stack gap="xs">
                            <Text
                                fz={10}
                                fw={700}
                                tt="uppercase"
                                lts={0.4}
                                c="ldGray.7"
                            >
                                Evidence
                            </Text>
                            <AgentChatDisplay
                                thread={threadData}
                                projectUuid={projectUuid}
                                agentUuid={agentUuid}
                                renderArtifactsInline
                                showAddToEvalsButton
                            />
                        </Stack>

                        <Stack gap="xs">
                            <Text
                                fz={10}
                                fw={700}
                                tt="uppercase"
                                lts={0.4}
                                c="ldGray.7"
                            >
                                Activity
                            </Text>
                            <RemediationActivityTimeline reviewItem={item} />
                        </Stack>
                    </Stack>

                    <Stack className={styles.rail} gap="lg">
                        <RailField label="Status">
                            <ReviewItemActions
                                reviewItem={item}
                                mode="drawer"
                            />
                        </RailField>
                        <RailField label="Assignee">
                            <ReviewAssigneeMenu
                                projectUuid={item.projectUuid}
                                fingerprint={item.fingerprint}
                                assignedToUserUuid={item.assignedToUserUuid}
                            />
                        </RailField>
                        {projectName && (
                            <RailField label="Project">
                                <Text fz="sm" fw={500} c="ldGray.9">
                                    {projectName}
                                </Text>
                            </RailField>
                        )}
                        {seenValue && (
                            <RailField label="Seen">
                                <Text fz="sm" fw={500} c="ldGray.9">
                                    {seenValue}
                                </Text>
                            </RailField>
                        )}
                        {item.linkedPrUrl && (
                            <RailField label="Pull request">
                                <Anchor
                                    href={item.linkedPrUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    fz="sm"
                                    fw={500}
                                >
                                    <Group gap={4} wrap="nowrap">
                                        <MantineIcon
                                            icon={IconGitPullRequest}
                                            size={14}
                                        />
                                        View PR
                                    </Group>
                                </Anchor>
                            </RailField>
                        )}
                    </Stack>
                </Box>
            )}
        </MantineModal>
    );
};
