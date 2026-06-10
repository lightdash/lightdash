import {
    ActionIcon,
    Badge,
    Box,
    Button,
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
    IconExternalLink,
    IconGitPullRequest,
    IconSettings,
    IconX,
} from '@tabler/icons-react';
import { type FC, useMemo } from 'react';
import { Link, useNavigate } from 'react-router';
import { CategoryBadge } from '../../../../../components/common/CategoryBadge';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { useAiAgentAdminReviewItems } from '../../hooks/useAiAgentAdmin';
import { useAiAgentThread } from '../../hooks/useProjectAiAgents';
import { AgentChatDisplay } from '../ChatElements/AgentChatDisplay';
import { EvalAssessmentDisplay } from '../Evals/EvalAssessmentDisplay';
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
    const reviewSummary = useMemo(
        () => summarizeThreadReviewItems(reviewItems, threadUuid),
        [reviewItems, threadUuid],
    );

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
                        Thread Preview
                    </Title>
                    <Tooltip label="Open Thread" variant="xs" position="right">
                        <ActionIcon
                            variant="subtle"
                            color="gray"
                            component={Link}
                            target="_blank"
                            to={`/projects/${projectUuid}/ai-agents/${agentUuid}/threads/${threadUuid}`}
                        >
                            <MantineIcon icon={IconExternalLink} />
                        </ActionIcon>
                    </Tooltip>
                </Group>
                <Group gap="xs">
                    <Tooltip
                        label="Open Agent Settings"
                        variant="xs"
                        position="right"
                    >
                        <ActionIcon
                            variant="subtle"
                            color="gray"
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
                    >
                        <MantineIcon icon={IconX} size="sm" />
                    </Button>
                </Group>
            </Group>

            <Divider />

            {threadData && (
                <Box mah="calc(100vh - 150px)" style={{ overflowY: 'auto' }}>
                    {reviewSummary.findingCount > 0 && (
                        <>
                            <Stack p="sm" gap="sm">
                                <Group justify="space-between" align="center">
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
                                        getThreadReviewHeadline(reviewItem) ??
                                        reviewItem.title;

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
                                                        ? theme.colors.violet[3]
                                                        : theme.colors.ldGray[2]
                                                }`,
                                                borderRadius: theme.radius.md,
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
                                                            reviewItem.status
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
