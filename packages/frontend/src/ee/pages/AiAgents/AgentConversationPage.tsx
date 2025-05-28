import {
    Avatar,
    Badge,
    Card,
    Group,
    Stack,
    Text,
    Tooltip,
} from '@mantine-8/core';
import MDEditor from '@uiw/react-md-editor';
import dayjs from 'dayjs';
import { type FC } from 'react';
import { useParams } from 'react-router';
import PageSpinner from '../../../components/PageSpinner';
import { getNameInitials } from '../../../features/comments/utils';
import { useTimeAgo } from '../../../hooks/useTimeAgo';
import { useAiAgentThread } from '../../features/aiCopilot/hooks/useAiAgents';

type AiThreadMessageProps = {
    actor: 'user' | 'assistant';
    initials: string;
    message: string;
    messagedAt: Date;
    humanScore?: number;
};

const AiThreadMessage: FC<AiThreadMessageProps> = ({
    actor,
    initials,
    message,
    messagedAt,
    humanScore,
}) => {
    const timeAgo = useTimeAgo(messagedAt);

    return (
        <Group
            maw="70%"
            align="flex-start"
            gap="sm"
            style={{
                marginLeft: actor === 'user' ? 'auto' : undefined,
                flexDirection: actor === 'user' ? 'row-reverse' : 'row',
            }}
        >
            <Avatar
                color={actor === 'user' ? 'violet' : 'gray.3'}
                radius="xl"
                variant="filled"
            >
                {initials}
            </Avatar>

            <Stack
                gap="xs"
                align={actor === 'user' ? 'flex-end' : 'flex-start'}
            >
                <Tooltip label={dayjs(messagedAt).toString()} withinPortal>
                    <Text size="xs" c="dimmed">
                        {timeAgo}
                    </Text>
                </Tooltip>

                <Card
                    pos="relative"
                    shadow="md"
                    radius="xl"
                    py="sm"
                    px="lg"
                    bg={actor === 'assistant' ? 'white' : 'blue.1'}
                    color={actor === 'assistant' ? 'black' : 'white'}
                    style={{
                        overflow: 'unset',
                        ...(actor === 'assistant'
                            ? { borderStartStartRadius: '0px' }
                            : actor === 'user'
                            ? { borderStartEndRadius: '0px' }
                            : {}),
                    }}
                >
                    {message ? (
                        <MDEditor.Markdown
                            source={message}
                            style={{ backgroundColor: 'transparent' }}
                        />
                    ) : (
                        <Text c="dimmed">No response yet</Text>
                    )}

                    {actor === 'assistant' && humanScore !== undefined && (
                        <Badge
                            pos="absolute"
                            right={10}
                            bottom={-14}
                            variant="filled"
                            size="lg"
                            fz="lg"
                            bg={
                                humanScore === 1
                                    ? 'green.7'
                                    : humanScore === -1
                                    ? 'red.7'
                                    : undefined
                            }
                        >
                            {humanScore === 1
                                ? '👍'
                                : humanScore === -1
                                ? '👎'
                                : undefined}
                        </Badge>
                    )}
                </Card>
            </Stack>
        </Group>
    );
};

const AgentConversationPage = () => {
    const { agentUuid, threadUuid } = useParams();
    const { data: thread, isLoading: isLoadingThread } = useAiAgentThread(
        agentUuid ?? '',
        threadUuid ?? '',
    );

    if (isLoadingThread || !thread) {
        return <PageSpinner />;
    }

    console.log(thread);
    return (
        <Stack>
            {thread.messages.map((message) => (
                <AiThreadMessage
                    key={message.uuid}
                    actor={message.role}
                    initials={
                        message.role === 'user'
                            ? getNameInitials(message.user.name)
                            : 'A'
                    }
                    message={message.message}
                    messagedAt={new Date(message.createdAt)}
                />
            ))}
        </Stack>
    );
};

export default AgentConversationPage;
