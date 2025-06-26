import {
    type AiAgentMessageAssistant,
    type AiAgentMessageUser,
    type AiAgentUser,
} from '@lightdash/common';
import {
    ActionIcon,
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
    IconThumbDown,
    IconThumbDownFilled,
    IconThumbUp,
    IconThumbUpFilled,
} from '@tabler/icons-react';
import MDEditor from '@uiw/react-md-editor';
import { format, parseISO } from 'date-fns';
import { memo, useCallback, useMemo, type FC } from 'react';
import { useParams } from 'react-router';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { useInfiniteQueryResults } from '../../../../../hooks/useQueryResults';
import { useTimeAgo } from '../../../../../hooks/useTimeAgo';
import useApp from '../../../../../providers/App/useApp';
import {
    useAiAgentThreadMessageVizQuery,
    useUpdatePromptFeedbackMutation,
} from '../../hooks/useOrganizationAiAgents';
import {
    useAiAgentThreadStreaming,
    useAiAgentThreadStreamQuery,
} from '../../streaming/useAiAgentThreadStreamQuery';
import { isOptimisticMessageStub } from '../../utils/thinkingMessageStub';
import { AiChartVisualization } from './AiChartVisualization';
import AgentToolCalls from './ToolCalls/AgentToolCalls';

export const UserBubble: FC<{ message: AiAgentMessageUser<AiAgentUser> }> = ({
    message,
}) => {
    const timeAgo = useTimeAgo(message.createdAt);
    const name = message.user.name;
    const app = useApp();
    const showUserName = app.user?.data?.userUuid !== message.user.uuid;

    return (
        <Stack gap="xs" style={{ alignSelf: 'flex-end' }}>
            <Stack gap={0} align="flex-end">
                {showUserName ? (
                    <Text size="sm" c="gray.7" fw={600}>
                        {name}
                    </Text>
                ) : null}
                <Tooltip
                    label={format(parseISO(message.createdAt), 'PPpp')}
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

const AssistantBubbleContent: FC<{ message: AiAgentMessageAssistant }> = ({
    message,
}) => {
    const streamingState = useAiAgentThreadStreamQuery(message.threadUuid);
    const isStubbed = isOptimisticMessageStub(message.message);
    const isStreaming =
        useAiAgentThreadStreaming(message.threadUuid) && isStubbed;
    const messageContent =
        isStreaming && streamingState
            ? streamingState.content
            : isStubbed // avoid brief flash of `THINKING_STUB`
            ? ''
            : message.message ?? 'No response...';

    return (
        <>
            {isStreaming && <AgentToolCalls />}
            <MDEditor.Markdown
                source={messageContent}
                style={{ backgroundColor: 'transparent' }}
            />
            {isStreaming ? <Loader type="dots" color="gray" /> : null}
        </>
    );
};

export const AssistantBubble: FC<{
    message: AiAgentMessageAssistant;
    isPreview?: boolean;
}> = memo(({ message, isPreview = false }) => {
    const { agentUuid, projectUuid } = useParams();

    const queryExecutionHandle = useAiAgentThreadMessageVizQuery({
        agentUuid: agentUuid!,
        message,
        projectUuid,
    });

    const queryResults = useInfiniteQueryResults(
        projectUuid,
        queryExecutionHandle?.data?.query.queryUuid,
    );

    const isQueryLoading =
        queryExecutionHandle.isLoading || queryResults.isFetchingRows;
    const isQueryError = queryExecutionHandle.isError || queryResults.error;

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
        if (!projectUuid || message.humanScore !== null) return; // Prevent changes if already rated
        updateFeedbackMutation.mutate({
            messageUuid: message.uuid,
            humanScore: 1,
        });
    }, [projectUuid, message.uuid, message.humanScore, updateFeedbackMutation]);

    const handleDownvote = useCallback(() => {
        if (!projectUuid || message.humanScore !== null) return; // Prevent changes if already rated
        updateFeedbackMutation.mutate({
            messageUuid: message.uuid,
            humanScore: -1,
        });
    }, [projectUuid, message.uuid, message.humanScore, updateFeedbackMutation]);

    const hasRating =
        message.humanScore !== undefined && message.humanScore !== null;

    const isLoading =
        useAiAgentThreadStreaming(message.threadUuid) &&
        isOptimisticMessageStub(message.message);

    const metricQuery = queryExecutionHandle.data?.query.metricQuery;
    const vizConfig = message.vizConfigOutput;

    if (!projectUuid) throw new Error(`Project Uuid not found`);

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
            <AssistantBubbleContent message={message} />

            {vizConfig && metricQuery && (
                <Paper
                    withBorder
                    radius="md"
                    p="md"
                    shadow="none"
                    {...((queryExecutionHandle.isError ||
                        queryExecutionHandle.isLoading) && {
                        bg: 'gray.0',
                        style: {
                            borderStyle: 'dashed',
                        },
                    })}
                >
                    {isQueryLoading ? (
                        <Center>
                            <Loader type="dots" color="gray" />
                        </Center>
                    ) : isQueryError ? (
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
                        <AiChartVisualization
                            results={queryResults}
                            message={message}
                            queryExecutionHandle={queryExecutionHandle}
                            projectUuid={projectUuid}
                        />
                    )}
                </Paper>
            )}
            <Group gap={0} display={isPreview ? 'none' : 'flex'}>
                <CopyButton value={message.message ?? ''}>
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
            </Group>
        </Stack>
    );
});
