import {
    ActionIcon,
    Badge,
    Box,
    Button,
    Collapse,
    Divider,
    Group,
    LoadingOverlay,
    Stack,
    Text,
    Title,
    Tooltip,
    useMantineTheme,
} from '@mantine-8/core';
import {
    IconArrowRight,
    IconChevronDown,
    IconChevronRight,
    IconExternalLink,
    IconGitPullRequest,
    IconSettings,
    IconX,
} from '@tabler/icons-react';
import { type FC, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { CategoryBadge } from '../../../../../components/common/CategoryBadge';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { useProjects } from '../../../../../hooks/useProjects';
import {
    useAiAgentAdminAgents,
    useAiAgentAdminReviewItems,
} from '../../hooks/useAiAgentAdmin';
import { useAiAgentThread } from '../../hooks/useProjectAiAgents';
import { AgentNamePill } from '../AgentNamePill';
import { AgentChatDisplay } from '../ChatElements/AgentChatDisplay';
import { EvalAssessmentDisplay } from '../Evals/EvalAssessmentDisplay';
import { ReviewItemActions } from './ReviewItemActions';
import {
    formatReviewDate,
    getCompactIssueTitle,
    getReviewReasoningText,
    getReviewSecondaryDetail,
} from './reviewItemDetails';
import styles from './ThreadPreviewSidebar.module.css';
import {
    getThreadReviewHeadline,
    summarizeThreadReviewItems,
    THREAD_REVIEW_ITEM_STATUSES,
    threadReviewRootCauseColors,
    threadReviewRootCauseLabels,
    threadReviewStatusColors,
} from './threadReviewContext';

type ThreadPreviewSidebarProps = {
    projectUuid: string;
    agentUuid: string;
    threadUuid: string;
    selectedReviewItemUuid?: string;
    isOpen: boolean;
    onClose: () => void;
    showAddToEvalsButton?: boolean;
    evalUuid?: string;
    runUuid?: string;
};

const ReviewMetadataField = ({
    label,
    value,
    tooltip,
}: {
    label: string;
    value: string;
    tooltip?: string;
}) => (
    <Stack gap={2} className={styles.metaField}>
        <Text fz={10} fw={700} c="dimmed" tt="uppercase" lts={0.4}>
            {label}
        </Text>
        <Tooltip
            label={tooltip ?? value}
            withArrow
            openDelay={250}
            disabled={!tooltip && value.length < 28}
        >
            <Text fz="sm" fw={500} c="ldGray.9" lineClamp={1}>
                {value}
            </Text>
        </Tooltip>
    </Stack>
);

const ExpandableReviewText = ({
    text,
    collapsedLines,
    size = 'sm',
}: {
    text: string;
    collapsedLines: number;
    size?: 'xs' | 'sm';
}) => {
    const [expanded, setExpanded] = useState(false);
    const canExpand = text.length > 180;

    return (
        <Stack gap={4} align="flex-start">
            <Text
                fz={size}
                c="ldGray.7"
                lh={1.55}
                lineClamp={expanded || !canExpand ? undefined : collapsedLines}
                className={styles.summaryText}
            >
                {text}
            </Text>
            {canExpand && (
                <Button
                    variant="subtle"
                    color="gray"
                    size="compact-xs"
                    px={0}
                    onClick={() => setExpanded((open) => !open)}
                >
                    {expanded ? 'Show less' : 'Show more'}
                </Button>
            )}
        </Stack>
    );
};

export const ThreadPreviewSidebar: FC<ThreadPreviewSidebarProps> = ({
    projectUuid,
    agentUuid,
    threadUuid,
    selectedReviewItemUuid,
    isOpen,
    onClose,
    showAddToEvalsButton = false,
    evalUuid,
    runUuid,
}) => {
    const theme = useMantineTheme();
    const navigate = useNavigate();
    const { data: threadData, isLoading: isLoadingThread } = useAiAgentThread(
        projectUuid,
        agentUuid,
        threadUuid,
    );
    const { data: reviewItems = [] } = useAiAgentAdminReviewItems(
        { statuses: THREAD_REVIEW_ITEM_STATUSES },
        { enabled: isOpen },
    );
    const { data: agents = [] } = useAiAgentAdminAgents({ enabled: isOpen });
    const { data: projects = [] } = useProjects();
    const reviewSummary = useMemo(
        () => summarizeThreadReviewItems(reviewItems, threadUuid),
        [reviewItems, threadUuid],
    );
    const selectedReviewItem = useMemo(
        () =>
            selectedReviewItemUuid
                ? (reviewSummary.items.find(
                      (reviewItem) =>
                          reviewItem.uuid === selectedReviewItemUuid,
                  ) ?? null)
                : null,
        [reviewSummary.items, selectedReviewItemUuid],
    );
    const selectedAgent = useMemo(() => {
        const reviewAgentUuid =
            selectedReviewItem?.latestFinding?.agentUuid ??
            selectedReviewItem?.agentUuid ??
            agentUuid;
        return agents.find((agent) => agent.uuid === reviewAgentUuid) ?? null;
    }, [agentUuid, agents, selectedReviewItem]);
    const selectedProject = useMemo(() => {
        const reviewProjectUuid =
            selectedReviewItem?.latestFinding?.projectUuid ??
            selectedReviewItem?.projectUuid ??
            projectUuid;
        return (
            projects.find(
                (project) => project.projectUuid === reviewProjectUuid,
            ) ?? null
        );
    }, [projectUuid, projects, selectedReviewItem]);
    const selectedDetail = selectedReviewItem
        ? getReviewSecondaryDetail(selectedReviewItem)
        : null;
    const seenValue = selectedReviewItem
        ? formatReviewDate(selectedReviewItem.firstSeenAt) ===
          formatReviewDate(selectedReviewItem.lastSeenAt)
            ? formatReviewDate(selectedReviewItem.lastSeenAt)
            : `${formatReviewDate(selectedReviewItem.firstSeenAt)} - ${formatReviewDate(selectedReviewItem.lastSeenAt)}`
        : null;
    const seenTooltip = selectedReviewItem
        ? `First seen ${formatReviewDate(selectedReviewItem.firstSeenAt)}. Last seen ${formatReviewDate(selectedReviewItem.lastSeenAt)}.`
        : null;
    const [showDetails, setShowDetails] = useState(false);
    const [showWhy, setShowWhy] = useState(false);
    const reasoningText = selectedReviewItem
        ? getReviewReasoningText(selectedReviewItem)
        : null;

    if (!isOpen || !threadUuid) {
        return null;
    }

    return (
        <Box h="100%" pos="relative" bg="background">
            <LoadingOverlay
                pos="absolute"
                visible={isLoadingThread}
                loaderProps={{ color: 'dark' }}
            />

            <Group justify="space-between" align="flex-start" p="sm">
                <Group gap="xs">
                    <Title order={5} fw={600}>
                        {selectedReviewItem
                            ? 'Review details'
                            : 'Thread preview'}
                    </Title>
                    <Tooltip label="Open Thread" variant="xs" position="right">
                        <ActionIcon
                            variant="subtle"
                            color="gray"
                            aria-label="Open full thread"
                            component={Link}
                            target="_blank"
                            to={`/projects/${projectUuid}/ai-agents/${agentUuid}/threads/${threadUuid}`}
                        >
                            <MantineIcon icon={IconExternalLink} />
                        </ActionIcon>
                    </Tooltip>
                </Group>
                <Group gap="xs">
                    {selectedAgent && (
                        <AgentNamePill
                            name={selectedAgent.name}
                            imageUrl={selectedAgent.imageUrl}
                            variant="pill"
                        />
                    )}
                    <Tooltip
                        label="Open Agent Settings"
                        variant="xs"
                        position="right"
                    >
                        <ActionIcon
                            variant="subtle"
                            color="gray"
                            aria-label="Open agent settings"
                            component={Link}
                            target="_blank"
                            to={`/projects/${projectUuid}/ai-agents/${agentUuid}/edit`}
                        >
                            <MantineIcon icon={IconSettings} />
                        </ActionIcon>
                    </Tooltip>
                    <Button
                        variant="subtle"
                        size="xs"
                        p={4}
                        onClick={onClose}
                        color="gray"
                        aria-label="Close thread preview"
                    >
                        <MantineIcon icon={IconX} size="sm" />
                    </Button>
                </Group>
            </Group>

            <Divider />

            {threadData && (
                <Box mah="calc(100vh - 150px)" style={{ overflowY: 'auto' }}>
                    {selectedReviewItem ? (
                        <>
                            <Stack p="md" gap="md">
                                <Stack gap="md" className={styles.summaryCard}>
                                    <Group
                                        justify="space-between"
                                        align="flex-start"
                                        gap="md"
                                        wrap="nowrap"
                                        className={styles.summaryTopRow}
                                    >
                                        <Stack
                                            gap="xs"
                                            miw={0}
                                            className={styles.summaryMain}
                                        >
                                            <Group gap={8} wrap="wrap">
                                                <CategoryBadge
                                                    variant="dot"
                                                    label={
                                                        threadReviewRootCauseLabels[
                                                            selectedReviewItem
                                                                .primaryRootCause
                                                        ]
                                                    }
                                                    color={
                                                        threadReviewRootCauseColors[
                                                            selectedReviewItem
                                                                .primaryRootCause
                                                        ]
                                                    }
                                                />
                                            </Group>

                                            <Title order={5} fw={600}>
                                                {getCompactIssueTitle(
                                                    selectedReviewItem,
                                                )}
                                            </Title>

                                            {reasoningText && (
                                                <ExpandableReviewText
                                                    text={reasoningText}
                                                    collapsedLines={3}
                                                    size="sm"
                                                />
                                            )}
                                        </Stack>

                                        <Box className={styles.summaryActions}>
                                            <ReviewItemActions
                                                reviewItem={selectedReviewItem}
                                                mode="drawer"
                                            />
                                        </Box>
                                    </Group>

                                    <Group gap="xs" wrap="wrap">
                                        <Button
                                            variant={
                                                showDetails ? 'light' : 'subtle'
                                            }
                                            color="gray"
                                            size="compact-xs"
                                            radius="xl"
                                            rightSection={
                                                <MantineIcon
                                                    icon={
                                                        showDetails
                                                            ? IconChevronDown
                                                            : IconChevronRight
                                                    }
                                                    size="xs"
                                                />
                                            }
                                            onClick={() =>
                                                setShowDetails((open) => !open)
                                            }
                                        >
                                            Details
                                        </Button>
                                        <Button
                                            variant={
                                                showWhy ? 'light' : 'subtle'
                                            }
                                            color="gray"
                                            size="compact-xs"
                                            radius="xl"
                                            rightSection={
                                                <MantineIcon
                                                    icon={
                                                        showWhy
                                                            ? IconChevronDown
                                                            : IconChevronRight
                                                    }
                                                    size="xs"
                                                />
                                            }
                                            onClick={() =>
                                                setShowWhy((open) => !open)
                                            }
                                        >
                                            Why flagged
                                        </Button>
                                    </Group>

                                    <Collapse in={showDetails}>
                                        <Stack gap="sm" pt="xs">
                                            <Group
                                                gap="lg"
                                                wrap="wrap"
                                                className={styles.metaGrid}
                                            >
                                                <ReviewMetadataField
                                                    label="Project"
                                                    value={
                                                        selectedProject?.name ??
                                                        'Unknown project'
                                                    }
                                                />
                                                {seenValue && (
                                                    <ReviewMetadataField
                                                        label="Seen"
                                                        value={seenValue}
                                                        tooltip={
                                                            seenTooltip ??
                                                            undefined
                                                        }
                                                    />
                                                )}
                                                {selectedDetail && (
                                                    <ReviewMetadataField
                                                        label="Detail"
                                                        value={selectedDetail}
                                                    />
                                                )}
                                            </Group>
                                        </Stack>
                                    </Collapse>

                                    <Collapse in={showWhy}>
                                        <Stack gap="xs" pt="xs">
                                            <Text
                                                fz="xs"
                                                fw={700}
                                                tt="uppercase"
                                                lts={0.4}
                                                c="ldGray.7"
                                            >
                                                Why flagged
                                            </Text>
                                            {reasoningText && (
                                                <ExpandableReviewText
                                                    text={reasoningText}
                                                    collapsedLines={6}
                                                    size="xs"
                                                />
                                            )}
                                        </Stack>
                                    </Collapse>
                                </Stack>
                            </Stack>

                            <Divider />
                        </>
                    ) : (
                        reviewSummary.findingCount > 0 && (
                            <>
                                <Stack p="sm" gap="sm">
                                    <Group
                                        justify="space-between"
                                        align="center"
                                    >
                                        <Title order={6} fw={600}>
                                            Review findings
                                        </Title>
                                        <Badge variant="light" color="violet">
                                            {reviewSummary.findingCount}
                                        </Badge>
                                    </Group>

                                    {reviewSummary.items.map((reviewItem) => {
                                        const isSelected =
                                            selectedReviewItemUuid ===
                                            reviewItem.uuid;
                                        const headline =
                                            getThreadReviewHeadline(
                                                reviewItem,
                                            ) ?? reviewItem.title;

                                        return (
                                            <Stack
                                                key={reviewItem.uuid}
                                                gap={8}
                                                p="sm"
                                                bg={
                                                    isSelected
                                                        ? theme.colors.ldGray[0]
                                                        : 'white'
                                                }
                                                style={{
                                                    border: `1px solid ${
                                                        isSelected
                                                            ? theme.colors
                                                                  .violet[3]
                                                            : theme.colors
                                                                  .ldGray[2]
                                                    }`,
                                                    borderRadius:
                                                        theme.radius.md,
                                                }}
                                            >
                                                <Group
                                                    justify="space-between"
                                                    align="flex-start"
                                                >
                                                    <CategoryBadge
                                                        variant="dot"
                                                        label={
                                                            threadReviewRootCauseLabels[
                                                                reviewItem
                                                                    .primaryRootCause
                                                            ]
                                                        }
                                                        color={
                                                            threadReviewRootCauseColors[
                                                                reviewItem
                                                                    .primaryRootCause
                                                            ]
                                                        }
                                                    />
                                                    <Badge
                                                        variant="light"
                                                        color={
                                                            threadReviewStatusColors[
                                                                reviewItem
                                                                    .status
                                                            ]
                                                        }
                                                    >
                                                        {reviewItem.status.replaceAll(
                                                            '_',
                                                            ' ',
                                                        )}
                                                    </Badge>
                                                </Group>

                                                <Stack gap={4}>
                                                    <Text fw={600} fz="sm">
                                                        {headline}
                                                    </Text>
                                                    <Text
                                                        fz="xs"
                                                        c="ldGray.6"
                                                        lineClamp={2}
                                                    >
                                                        {reviewItem.description}
                                                    </Text>
                                                </Stack>

                                                <Group gap="xs">
                                                    <Button
                                                        size="compact-xs"
                                                        variant={
                                                            isSelected
                                                                ? 'default'
                                                                : 'subtle'
                                                        }
                                                        color="gray"
                                                        rightSection={
                                                            <MantineIcon
                                                                icon={
                                                                    IconArrowRight
                                                                }
                                                                size="xs"
                                                            />
                                                        }
                                                        onClick={() => {
                                                            const params =
                                                                new URLSearchParams();
                                                            params.set(
                                                                'reviewProjectUuid',
                                                                reviewItem
                                                                    .latestFinding
                                                                    ?.projectUuid ??
                                                                    projectUuid,
                                                            );
                                                            params.set(
                                                                'reviewAgentUuid',
                                                                reviewItem
                                                                    .latestFinding
                                                                    ?.agentUuid ??
                                                                    agentUuid,
                                                            );
                                                            params.set(
                                                                'reviewThreadUuid',
                                                                reviewItem
                                                                    .latestFinding
                                                                    ?.threadUuid ??
                                                                    threadUuid,
                                                            );
                                                            params.set(
                                                                'reviewItemUuid',
                                                                reviewItem.uuid,
                                                            );
                                                            void navigate(
                                                                `/generalSettings/ai/reviews?${params.toString()}`,
                                                            );
                                                        }}
                                                    >
                                                        View review
                                                    </Button>

                                                    {reviewItem.linkedPrUrl && (
                                                        <Button
                                                            component="a"
                                                            href={
                                                                reviewItem.linkedPrUrl
                                                            }
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            size="compact-xs"
                                                            variant="subtle"
                                                            color="gray"
                                                            leftSection={
                                                                <MantineIcon
                                                                    icon={
                                                                        IconGitPullRequest
                                                                    }
                                                                    size="xs"
                                                                />
                                                            }
                                                            onClick={(event) =>
                                                                event.stopPropagation()
                                                            }
                                                        >
                                                            View PR
                                                        </Button>
                                                    )}
                                                </Group>
                                            </Stack>
                                        );
                                    })}
                                </Stack>
                                <Divider />
                            </>
                        )
                    )}

                    {evalUuid && runUuid && (
                        <EvalAssessmentDisplay
                            projectUuid={projectUuid}
                            agentUuid={agentUuid}
                            evalUuid={evalUuid}
                            runUuid={runUuid}
                            threadUuid={threadUuid}
                        />
                    )}
                    <AgentChatDisplay
                        thread={threadData}
                        projectUuid={projectUuid}
                        agentUuid={agentUuid}
                        showAddToEvalsButton={showAddToEvalsButton}
                        renderArtifactsInline
                    />
                </Box>
            )}
        </Box>
    );
};
