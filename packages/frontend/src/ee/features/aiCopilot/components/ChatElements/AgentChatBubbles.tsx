import {
    type AiAgentMessageAssistant,
    type AiAgentMessageUser,
    type AiAgentUser,
} from '@lightdash/common';
import {
    ActionIcon,
    Button,
    Card,
    CopyButton,
    Group,
    Loader,
    Paper,
    Skeleton,
    Stack,
    Text,
    Tooltip,
} from '@mantine-8/core';
import {
    IconCheck,
    IconCopy,
    IconExternalLink,
    IconThumbDown,
    IconThumbDownFilled,
    IconThumbUp,
    IconThumbUpFilled,
} from '@tabler/icons-react';
import MDEditor from '@uiw/react-md-editor';
import dayjs from 'dayjs';
import { memo, useCallback, useMemo, type FC } from 'react';
import { Link, useParams } from 'react-router';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { useActiveProjectUuid } from '../../../../../hooks/useActiveProject';
import { useTimeAgo } from '../../../../../hooks/useTimeAgo';
import {
    useAiAgentThreadMessageViz,
    useUpdatePromptFeedbackMutation,
} from '../../hooks/useAiAgents';
import { AiChartVisualization } from './AiChartVisualization';

export const UserBubble: FC<{ message: AiAgentMessageUser<AiAgentUser> }> = ({
    message,
}) => {
    const timeAgo = useTimeAgo(new Date(message.createdAt));
    const name = message.user.name;
    return (
        <Stack gap="sm" style={{ alignSelf: 'flex-end' }}>
            <Stack gap={0} align="flex-end">
                <Text size="sm" c="gray.7" fw={600}>
                    {name}
                </Text>
                <Tooltip
                    label={dayjs(message.createdAt).toString()}
                    withinPortal
                >
                    <Text size="xs" c="dimmed">
                        {timeAgo}
                    </Text>
                </Tooltip>
            </Stack>
            <Card
                pos="relative"
                radius="md"
                py="xs"
                px="sm"
                withBorder={true}
                bg="white"
                color="white"
                style={{
                    overflow: 'unset',
                    borderStartEndRadius: '0px',
                }}
            >
                <MDEditor.Markdown
                    source={message.message}
                    style={{ backgroundColor: 'transparent' }}
                />
            </Card>
        </Stack>
    );
};

export const AssistantBubble: FC<{
    message: AiAgentMessageAssistant;
}> = memo(({ message }) => {
    const { agentUuid } = useParams();
    const { activeProjectUuid } = useActiveProjectUuid();

    const vizQuery = useAiAgentThreadMessageViz({
        agentUuid: agentUuid!,
        message,
        activeProjectUuid,
    });

    const updateFeedbackMutation = useUpdatePromptFeedbackMutation(
        agentUuid,
        message.threadUuid,
    );

    const upVoted = useMemo(
        () =>
            typeof message.humanScore === 'number' && message.humanScore === 1,
        [message.humanScore],
    );
    const downVoted = useMemo(
        () =>
            typeof message.humanScore === 'number' && message.humanScore === -1,
        [message.humanScore],
    );

    const handleUpvote = useCallback(() => {
        if (!activeProjectUuid || message.humanScore !== null) return; // Prevent changes if already rated
        updateFeedbackMutation.mutate({
            messageUuid: message.uuid,
            humanScore: 1,
        });
    }, [
        activeProjectUuid,
        message.uuid,
        message.humanScore,
        updateFeedbackMutation,
    ]);

    const handleDownvote = useCallback(() => {
        if (!activeProjectUuid || message.humanScore !== null) return; // Prevent changes if already rated
        updateFeedbackMutation.mutate({
            messageUuid: message.uuid,
            humanScore: -1,
        });
    }, [
        activeProjectUuid,
        message.uuid,
        message.humanScore,
        updateFeedbackMutation,
    ]);

    // TODO: Do not use hardcoded string for loading state
    const isLoading = message.message === 'Thinking...';
    const hasRating =
        message.humanScore !== undefined && message.humanScore !== null;

    return (
        <Stack
            pos="relative"
            w="100%"
            gap="xs"
            style={{
                overflow: 'unset',
                borderStartStartRadius: '0px',
            }}
        >
            {isLoading ? (
                <Skeleton h={20} w={100} />
            ) : (
                <MDEditor.Markdown
                    source={message.message}
                    style={{ backgroundColor: 'transparent' }}
                />
            )}

            {message.vizConfigOutput && message.metricQuery && (
                <Paper withBorder radius="md" p="md" shadow="none">
                    {vizQuery.isLoading ? (
                        <Loader />
                    ) : vizQuery.isError ? (
                        <Text>Error fetching viz</Text>
                    ) : (
                        <AiChartVisualization vizData={vizQuery.data} />
                    )}
                </Paper>
            )}
            <Group gap={0} justify="space-between">
                <CopyButton value={message.message}>
                    {({ copied, copy }) => (
                        <ActionIcon
                            variant="subtle"
                            color="gray"
                            aria-label="copy"
                            onClick={copy}
                            style={{ display: isLoading ? 'none' : 'block' }}
                        >
                            <MantineIcon icon={copied ? IconCheck : IconCopy} />
                        </ActionIcon>
                    )}
                </CopyButton>

                <Group gap={2}>
                    {!!vizQuery.data?.openInExploreUrl && (
                        <Button
                            variant="subtle"
                            color="gray"
                            aria-label="open in explore"
                            leftSection={
                                <MantineIcon icon={IconExternalLink} />
                            }
                            component={Link}
                            to={vizQuery.data.openInExploreUrl}
                            target="_blank"
                        >
                            Continue exploring
                        </Button>
                    )}
                    {(!hasRating || upVoted) && (
                        <ActionIcon
                            variant={'transparent'}
                            color="gray"
                            aria-label="upvote"
                            onClick={handleUpvote}
                            display={isLoading ? 'none' : 'block'}
                        >
                            <MantineIcon
                                icon={upVoted ? IconThumbUpFilled : IconThumbUp}
                            />
                        </ActionIcon>
                    )}

                    {(!hasRating || downVoted) && (
                        <ActionIcon
                            variant={'transparent'}
                            color="gray"
                            aria-label="downvote"
                            onClick={handleDownvote}
                            display={isLoading ? 'none' : 'block'}
                        >
                            <MantineIcon
                                icon={
                                    downVoted
                                        ? IconThumbDownFilled
                                        : IconThumbDown
                                }
                            />
                        </ActionIcon>
                    )}
                </Group>
            </Group>
        </Stack>
    );
});
