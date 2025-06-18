import {
    Badge,
    Box,
    Button,
    Group,
    LoadingOverlay,
    Modal,
    Paper,
    Stack,
    Text,
    Title,
    Tooltip,
} from '@mantine-8/core';
import { useDisclosure } from '@mantine/hooks';
import { IconExternalLink, IconHelpCircle, IconTrash } from '@tabler/icons-react';
import { type FC } from 'react';
import { Link, useParams } from 'react-router';
import MantineIcon from '../../../../components/common/MantineIcon';
import MantineModal from '../../../../components/common/MantineModal';
import useApp from '../../../../providers/App/useApp';
import { useAiAgentThread, useDeleteAgentThreadMutation } from '../hooks/useOrganizationAiAgents';
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
    const deleteThreadMutation = useDeleteAgentThreadMutation(agentUuid);
    const [deleteModalOpened, { open: openDeleteModal, close: closeDeleteModal }] = useDisclosure(false);

    // Format date function since date-fns is not available
    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleString();
    };

    const isThreadFromCurrentUser = thread?.user.uuid === user?.data?.userUuid;

    // Check if user has permission to delete (either owner or admin)
    const canDeleteThread = isThreadFromCurrentUser || 
        user?.data?.ability?.can('manage', 'AiAgentThread', { 
            organizationUuid: user?.data?.organizationUuid,
            projectUuid 
        });

    const chatUrl =
        projectUuid && agentUuid && threadUuid
            ? `/projects/${projectUuid}/ai-agents/${agentUuid}/threads/${threadUuid}`
            : null;

    const handleDeleteConfirm = async () => {
        if (!threadUuid) return;
        
        try {
            await deleteThreadMutation.mutateAsync(threadUuid);
            closeDeleteModal();
            onClose(); // Close the main modal after successful deletion
        } catch (error) {
            // Error is handled by the mutation hook
            closeDeleteModal();
        }
    };

    return (
        <>
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
                                showScrollbar={true}
                                enableAutoScroll={false}
                                padding="md"
                                isPreview
                            />
                        </Paper>
                        <Group justify="space-between">
                            <Group>
                                {canDeleteThread && (
                                    <Button
                                        variant="light"
                                        color="red"
                                        size="xs"
                                        leftSection={<MantineIcon icon={IconTrash} />}
                                        onClick={openDeleteModal}
                                        loading={deleteThreadMutation.isPending}
                                    >
                                        Delete Thread
                                    </Button>
                                )}
                            </Group>
                            {chatUrl && isThreadFromCurrentUser && (
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
                            )}
                        </Group>
                    </Stack>
                )}
            </Modal>

            <MantineModal
                opened={deleteModalOpened}
                onClose={closeDeleteModal}
                title="Delete Thread"
                icon={IconTrash}
                actions={
                    <Group>
                        <Button
                            variant="subtle"
                            onClick={closeDeleteModal}
                        >
                            Cancel
                        </Button>
                        <Button 
                            color="red" 
                            onClick={handleDeleteConfirm}
                            loading={deleteThreadMutation.isPending}
                        >
                            Delete
                        </Button>
                    </Group>
                }
            >
                <Stack gap="md">
                    <Text>
                        Are you sure you want to delete this conversation thread? This action cannot be undone.
                    </Text>
                </Stack>
            </MantineModal>
        </>
    );
};
