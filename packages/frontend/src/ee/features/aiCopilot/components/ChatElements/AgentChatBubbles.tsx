import {
    type AiAgentMessageAssistant,
    type AiAgentMessageUser,
    type AiAgentUser,
} from '@lightdash/common';
import {
    ActionIcon,
    Button,
    Card,
    Center,
    CopyButton,
    Group,
    Loader,
    Paper,
    Stack,
    Text,
    Tooltip,
} from '@mantine-8/core';
import {
    IconCheck,
    IconCopy,
    IconExclamationCircle,
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
import useApp from '../../../../../providers/App/useApp';
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
    const app = useApp();
    const showUserName = app.user?.data?.userUuid !== message.user.uuid;

    return (
        <Stack gap="sm" style={{ alignSelf: 'flex-end' }}>
            <Stack gap={0} align="flex-end">
                {showUserName ? (
                    <Text size="sm" c="gray.7" fw={600}>
                        {name}
                    </Text>
                ) : null}
                <Tooltip label={dayjs(message.createdAt).format()} withinPortal>
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
                <Loader
                    type="dots"
                    color="gray"
                    delayedMessage="Processing your request, this may take a moment"
                />
            ) : (
                <MDEditor.Markdown
                    source={message.message}
                    style={{ backgroundColor: 'transparent' }}
                />
            )}

            {message.vizConfigOutput && message.metricQuery && (
                <Paper
                    withBorder
                    radius="md"
                    p="md"
                    shadow="none"
                    {...((vizQuery.isError || vizQuery.isLoading) && {
                        bg: 'gray.0',
                        style: {
                            borderStyle: 'dashed',
                        },
                    })}
                >
                    {vizQuery.isLoading ? (
                        <Center>
                            <Loader type="dots" color="gray" />
                        </Center>
                    ) : vizQuery.isError ? (
                        <Stack gap="xs" align="center">
                            <MantineIcon
                                icon={IconExclamationCircle}
                                color="gray"
                            />
                            <Text size="xs" c="dimmed" ta="center">
                                Something went wrong generating the
                                visualization, please try again
                            </Text>
                        </Stack>
                    ) : (
                        <AiChartVisualization vizData={vizQuery.data} />
                    )}
                </Paper>
            )}
            <Group gap={0}>
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

                {(!hasRating || upVoted) && (
                    <ActionIcon
                        variant="subtle"
                        color="gray"
                        aria-label="upvote"
                        onClick={handleUpvote}
                        display={isLoading ? 'none' : 'block'}
                    >
                        <Tooltip
                            label="Feedback sent"
                            position="top"
                            withinPortal
                            withArrow
                            // Hack to only render tooltip (on hover) when `hasRating` is false
                            opened={hasRating ? undefined : false}
                        >
                            <MantineIcon
                                icon={upVoted ? IconThumbUpFilled : IconThumbUp}
                            />
                        </Tooltip>
                    </ActionIcon>
                )}

                {(!hasRating || downVoted) && (
                    <ActionIcon
                        variant="subtle"
                        color="gray"
                        aria-label="downvote"
                        onClick={handleDownvote}
                        display={isLoading ? 'none' : 'block'}
                    >
                        <MantineIcon
                            icon={
                                downVoted ? IconThumbDownFilled : IconThumbDown
                            }
                        />
                    </ActionIcon>
                )}
                {!!vizQuery.data?.openInExploreUrl && (
                    <Button
                        variant="subtle"
                        color="gray"
                        size="xs"
                        aria-label="open in explore"
                        leftSection={<MantineIcon icon={IconExternalLink} />}
                        component={Link}
                        to={vizQuery.data.openInExploreUrl}
                        target="_blank"
                        style={{
                            color: '#868e96',
                        }}
                    >
                        Continue exploring
                    </Button>
                )}
            </Group>
        </Stack>
    );
});
