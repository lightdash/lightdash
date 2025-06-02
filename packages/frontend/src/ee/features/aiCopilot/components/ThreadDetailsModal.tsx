import {
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
import { LightdashUserAvatar } from '../../../../components/Avatar';
import { useAiAgentThread } from '../hooks/useAiAgents';

type ThreadDetailsModalProps = {
    agentName: string;
    agentUuid: string;
    threadUuid: string | null;
    onClose: () => void;
};

export const ThreadDetailsModal: FC<ThreadDetailsModalProps> = ({
    agentName,
    agentUuid,
    threadUuid,
    onClose,
}) => {
    const { data: thread, isLoading } = useAiAgentThread(
        agentUuid,
        threadUuid || '',
        {
            enabled: !!threadUuid,
        },
    );

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
                            {thread.messages.map((message) => {
                                const name =
                                    message.role === 'assistant'
                                        ? agentName || 'AI Assistant'
                                        : message.user.name;

                                return (
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
                                                <LightdashUserAvatar
                                                    name={name}
                                                    variant="filled"
                                                />

                                                <Text fw={500} size="sm">
                                                    {name}
                                                </Text>
                                                <Text size="xs" c="dimmed">
                                                    {formatDate(
                                                        message.createdAt,
                                                    )}
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
                                );
                            })}
                        </Stack>
                    </ScrollArea>
                </Stack>
            ) : (
                <Text>Thread not found</Text>
            )}
        </Modal>
    );
};
