import {
    Avatar,
    Badge,
    Group,
    Modal,
    Paper,
    ScrollArea,
    Stack,
    Text,
    Title,
} from '@mantine-8/core';
import { type FC } from 'react';
import { useAiAgentThread } from '../hooks/useAiAgents';

type ThreadDetailsModalProps = {
    agentUuid: string;
    threadUuid: string | null;
    onClose: () => void;
};

export const ThreadDetailsModal: FC<ThreadDetailsModalProps> = ({
    agentUuid,
    threadUuid,
    onClose,
}) => {
    const { data: threadDetails, isLoading } = useAiAgentThread(
        agentUuid,
        threadUuid || '',
        {
            enabled: !!threadUuid,
        },
    );

    const thread = threadDetails?.results;

    // Format date function since date-fns is not available
    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleString();
    };

    return (
        <Modal
            opened={!!threadUuid}
            onClose={onClose}
            title={<Title order={4}>Conversation Details</Title>}
            size="xl"
        >
            {isLoading ? (
                <Text>Loading conversation...</Text>
            ) : thread ? (
                <Stack gap="md">
                    <Group gap="xs">
                        <Badge
                            color={
                                thread.createdFrom === 'slack'
                                    ? 'indigo'
                                    : 'blue'
                            }
                            variant="light"
                        >
                            {thread.createdFrom === 'slack' ? 'Slack' : 'Web'}
                        </Badge>
                        <Text size="sm" c="dimmed">
                            Started by {thread.user.name} on{' '}
                            {formatDate(thread.createdAt)}
                        </Text>
                    </Group>

                    <ScrollArea h={400}>
                        <Stack gap="md">
                            {thread.messages.map((message) => (
                                <Paper
                                    key={message.uuid}
                                    withBorder
                                    p="md"
                                    radius="md"
                                    style={{
                                        backgroundColor:
                                            message.role === 'assistant'
                                                ? '#E6F7FF'
                                                : 'transparent',
                                        alignSelf:
                                            message.role === 'assistant'
                                                ? 'flex-start'
                                                : 'flex-end',
                                        maxWidth: '80%',
                                    }}
                                >
                                    <Stack gap="xs">
                                        <Group gap="xs">
                                            <Avatar
                                                size="sm"
                                                radius="xl"
                                                color={
                                                    message.role === 'assistant'
                                                        ? 'blue'
                                                        : 'gray'
                                                }
                                            >
                                                {message.role === 'assistant'
                                                    ? 'AI'
                                                    : thread.user.name.charAt(
                                                          0,
                                                      )}
                                            </Avatar>
                                            <Text fw={500} size="sm">
                                                {message.role === 'assistant'
                                                    ? 'AI Assistant'
                                                    : thread.user.name}
                                            </Text>
                                            <Text size="xs" c="dimmed">
                                                {formatDate(message.createdAt)}
                                            </Text>
                                        </Group>
                                        <Text
                                            style={{
                                                whiteSpace: 'pre-wrap',
                                            }}
                                        >
                                            {message.message}
                                        </Text>
                                    </Stack>
                                </Paper>
                            ))}
                        </Stack>
                    </ScrollArea>
                </Stack>
            ) : (
                <Text>Thread not found</Text>
            )}
        </Modal>
    );
};
