import {
    ActionIcon,
    Box,
    Divider,
    Group,
    LoadingOverlay,
    Modal,
    Title,
    Tooltip,
} from '@mantine-8/core';
import { IconExternalLink } from '@tabler/icons-react';
import { type FC } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { useAiAgentThread } from '../../hooks/useProjectAiAgents';
import { clearArtifact } from '../../store/aiArtifactSlice';
import {
    useAiAgentStoreDispatch,
    useAiAgentStoreSelector,
} from '../../store/hooks';
import { AgentChatDisplay } from '../ChatElements/AgentChatDisplay';
import { AiArtifactPanel } from '../ChatElements/AiArtifactPanel';

type EvalThreadProps = {
    projectUuid: string;
    agentUuid: string;
    threadUuid: string;
    isOpened: boolean;
    onClose: () => void;
};

export const EvalThread: FC<EvalThreadProps> = ({
    projectUuid,
    agentUuid,
    threadUuid,
    isOpened,
    onClose,
}) => {
    const dispatch = useAiAgentStoreDispatch();
    const aiArtifact = useAiAgentStoreSelector(
        (state) => state.aiArtifact.artifact,
    );

    const { data: thread, isLoading } = useAiAgentThread(
        projectUuid,
        agentUuid,
        threadUuid,
        {
            enabled: isOpened && !!threadUuid,
        },
    );

    if (!isOpened) {
        return null;
    }

    const handleClose = () => {
        dispatch(clearArtifact());
        onClose();
    };

    return (
        <Modal
            opened={isOpened}
            onClose={handleClose}
            size="xxl"
            title={
                <Group gap="sm" align="center">
                    <Title order={4}>
                        {thread?.title || 'Evaluation Thread'}
                    </Title>
                    {thread && (
                        <Tooltip label="Open in new tab">
                            <ActionIcon
                                variant="subtle"
                                component={Link}
                                to={`/projects/${projectUuid}/ai-agents/${agentUuid}/threads/${threadUuid}`}
                                target="_blank"
                            >
                                <MantineIcon icon={IconExternalLink} />
                            </ActionIcon>
                        </Tooltip>
                    )}
                </Group>
            }
        >
            <Box pos="relative" w="100%" h="100%">
                <LoadingOverlay visible={isLoading} />

                {thread && !isLoading ? (
                    <Box h="100%" display="flex">
                        <Box flex={aiArtifact ? '1 1 60%' : '1 1 100%'}>
                            <AgentChatDisplay
                                thread={thread}
                                projectUuid={projectUuid}
                                agentUuid={agentUuid}
                            />
                        </Box>

                        {aiArtifact && (
                            <>
                                <Divider orientation="vertical" />
                                <Box style={{ flex: '1 1 40%' }}>
                                    <AiArtifactPanel />
                                </Box>
                            </>
                        )}
                    </Box>
                ) : !isLoading ? (
                    <Box
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            height: '100%',
                        }}
                    >
                        <Title order={5} c="dimmed">
                            Thread not available
                        </Title>
                    </Box>
                ) : null}
            </Box>
        </Modal>
    );
};
