import {
    Badge,
    Box,
    Button,
    Group,
    LoadingOverlay,
    Modal,
    Paper,
    Stack,
    Title,
    Tooltip,
} from '@mantine-8/core';
import { IconExternalLink, IconHelpCircle } from '@tabler/icons-react';
import { type FC } from 'react';
import { Link, useParams } from 'react-router';
import MantineIcon from '../../../../components/common/MantineIcon';
import useApp from '../../../../providers/App/useApp';
import { useAiAgentThread } from '../hooks/useOrganizationAiAgents';
import { AgentChatDisplay } from './ChatElements/AgentChatDisplay';

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
    const { user } = useApp();
    const { projectUuid } = useParams();
    const { data: thread, isLoading } = useAiAgentThread(agentUuid, threadUuid);

    // Format date function since date-fns is not available
    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleString();
    };

    const isThreadFromCurrentUser = thread?.user.uuid === user?.data?.userUuid;

    const chatUrl =
        projectUuid && agentUuid && threadUuid
            ? `/projects/${projectUuid}/ai-agents/${agentUuid}/threads/${threadUuid}`
            : null;

    return (
        <Modal
            opened={!!threadUuid}
            onClose={onClose}
            title={
                <Group justify="space-between">
                    <Title order={4}>Conversation Preview</Title>
                    {thread && (
                        <Group justify="space-between">
                            <Group gap="xs">
                                <Badge
                                    color={
                                        thread.createdFrom === 'slack'
                                            ? 'indigo'
                                            : 'blue'
                                    }
                                    variant="light"
                                >
                                    {thread.createdFrom === 'slack'
                                        ? 'Slack'
                                        : 'Web'}
                                </Badge>
                                <Tooltip
                                    position="right"
                                    label={`Started by ${
                                        thread.user.name
                                    } on ${formatDate(thread.createdAt)}`}
                                >
                                    <MantineIcon icon={IconHelpCircle} />
                                </Tooltip>
                            </Group>
                        </Group>
                    )}
                </Group>
            }
            size="xl"
        >
            {isLoading && (
                <Box h={300}>
                    <LoadingOverlay visible={isLoading} />
                </Box>
            )}
            {!!thread && !isLoading && (
                <Stack gap="md">
                    <Paper py="md" shadow="subtle">
                        <AgentChatDisplay
                            thread={thread}
                            agentName={agentName}
                            height={400}
                            enableAutoScroll={false}
                            mode="preview"
                        />
                    </Paper>
                    {chatUrl && isThreadFromCurrentUser && (
                        <Group justify="flex-end">
                            <Button
                                variant="light"
                                size="xs"
                                component={Link}
                                target="_blank"
                                to={chatUrl}
                                leftSection={
                                    <MantineIcon icon={IconExternalLink} />
                                }
                                onClick={onClose}
                            >
                                Open chat in new tab
                            </Button>
                        </Group>
                    )}
                </Stack>
            )}
        </Modal>
    );
};
