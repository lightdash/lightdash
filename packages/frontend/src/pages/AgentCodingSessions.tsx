import { type AgentCodingSession } from '@lightdash/common';
import {
    ActionIcon,
    Badge,
    Box,
    Button,
    Code,
    Group,
    Loader,
    Menu,
    NavLink,
    Paper,
    ScrollArea,
    Stack,
    Text,
    TextInput,
} from '@mantine-8/core';
import {
    IconBrandGithub,
    IconGitBranch,
    IconPlus,
    IconTrash,
} from '@tabler/icons-react';
import { useLocalStorage } from '@mantine-8/hooks';
import { useCallback, useEffect, useState, type FC } from 'react';
import { useParams, useSearchParams } from 'react-router';
import MantineIcon from '../components/common/MantineIcon';
import Page from '../components/common/Page/Page';
import {
    AgentCodingChatDisplay,
    AgentCodingChatInput,
    useAgentCodingStream,
} from '../ee/features/agentCodingSessions';
import {
    useAgentCodingSessionMessages,
    useAgentCodingSessions,
    useCreateAgentCodingSession,
    useDeleteAgentCodingSession,
    useSendAgentCodingSessionMessage,
} from '../ee/hooks/useAgentCodingSessions';
import classes from './AgentCodingSessions.module.css';

const statusColors: Record<string, string> = {
    pending: 'yellow',
    running: 'blue',
    finished: 'green',
    errored: 'red',
};

// Session chat view - the main content when a session is selected
const SessionChatView: FC<{
    projectUuid: string;
    session: AgentCodingSession;
    onDelete: () => void;
    onSessionUpdate: () => void;
}> = ({ projectUuid, session, onDelete, onSessionUpdate }) => {
    const { data: messages = [], refetch: refetchMessages } =
        useAgentCodingSessionMessages(projectUuid, session.sessionUuid);

    const sendMessageMutation = useSendAgentCodingSessionMessage(
        projectUuid,
        session.sessionUuid,
    );

    // Memoize to prevent callback from being recreated on every render
    const handleStreamEnd = useCallback(() => {
        void refetchMessages();
        onSessionUpdate(); // Refetch session to get updated status
    }, [refetchMessages, onSessionUpdate]);

    // Auto-connect streaming when session is pending or running
    const shouldStream =
        session.status === 'pending' || session.status === 'running';

    const { streamSegments, isStreaming, error } = useAgentCodingStream({
        projectUuid,
        sessionUuid: session.sessionUuid,
        enabled: shouldStream,
        onStreamEnd: handleStreamEnd,
    });

    // Debug logging
    // eslint-disable-next-line no-console
    console.log('[SessionChatView] render', {
        sessionUuid: session.sessionUuid,
        status: session.status,
        shouldStream,
        isStreaming,
        segmentsCount: streamSegments.length,
        messagesCount: messages.length,
    });

    const handleSendMessage = useCallback(
        (message: string) => {
            sendMessageMutation.mutate(
                { prompt: message },
                {
                    onSuccess: () => {
                        void refetchMessages();
                        // Refetch session to get updated status (pending/running)
                        // which will trigger streaming hook to auto-connect
                        onSessionUpdate();
                    },
                },
            );
        },
        [sendMessageMutation, refetchMessages, onSessionUpdate],
    );

    const isInputDisabled =
        isStreaming ||
        sendMessageMutation.isLoading ||
        session.status === 'pending' ||
        session.status === 'running';

    const githubBranchUrl = `https://github.com/${session.githubRepo}/tree/${session.githubBranch}`;

    return (
        <Stack h="100%" gap={0}>
            {/* Header */}
            <Paper p="md" withBorder>
                <Group justify="space-between">
                    <Group gap="md">
                        <Badge color={statusColors[session.status]} size="lg">
                            {session.status}
                        </Badge>
                        <Stack gap={2}>
                            <Group gap="xs">
                                <Text size="sm" fw={500}>
                                    Branch:
                                </Text>
                                <Code>{session.githubBranch}</Code>
                            </Group>
                            <Text size="xs" c="dimmed">
                                {new Date(session.createdAt).toLocaleString()}
                            </Text>
                        </Stack>
                    </Group>
                    <Group gap="sm">
                        <ActionIcon
                            component="a"
                            href={githubBranchUrl}
                            target="_blank"
                            variant="light"
                            title="View branch on GitHub"
                        >
                            <IconBrandGithub size={16} />
                        </ActionIcon>
                        <ActionIcon
                            color="red"
                            variant="light"
                            onClick={onDelete}
                            title="Delete session"
                        >
                            <IconTrash size={16} />
                        </ActionIcon>
                    </Group>
                </Group>
                {session.errorMessage && (
                    <Paper p="xs" className={classes.errorBox} mt="sm">
                        <Text size="sm" c="red">
                            Error: {session.errorMessage}
                        </Text>
                    </Paper>
                )}
                {error && (
                    <Paper p="xs" className={classes.errorBox} mt="sm">
                        <Text size="sm" c="red">
                            Stream error: {error}
                        </Text>
                    </Paper>
                )}
            </Paper>

            {/* Chat area */}
            <AgentCodingChatDisplay
                messages={messages}
                streamSegments={streamSegments}
                isStreaming={isStreaming}
            >
                <Box
                    p="md"
                    className={classes.headerBorder}
                    opacity={isInputDisabled ? 0.6 : 1}
                >
                    <AgentCodingChatInput
                        onSubmit={handleSendMessage}
                        loading={sendMessageMutation.isLoading}
                        disabled={isInputDisabled}
                        placeholder={
                            isStreaming
                                ? 'Waiting for response...'
                                : 'Send a message...'
                        }
                    />
                </Box>
            </AgentCodingChatDisplay>
        </Stack>
    );
};

// New session view - empty chat with input pinned to bottom
const NewSessionChatView: FC<{
    projectUuid: string;
    onCreated: (sessionUuid: string) => void;
}> = ({ projectUuid, onCreated }) => {
    const [branch, setBranch] = useState('main');
    const [isEditingBranch, setIsEditingBranch] = useState(false);

    const createMutation = useCreateAgentCodingSession(projectUuid);

    const handleSendMessage = useCallback(
        (message: string) => {
            createMutation.mutate(
                { prompt: message, githubBranch: branch },
                {
                    onSuccess: (session) => {
                        onCreated(session.sessionUuid);
                    },
                },
            );
        },
        [createMutation, branch, onCreated],
    );

    return (
        <Box h="100%" pos="relative">
            {/* Input pinned at bottom */}
            <Box p="md" className={classes.inputFooter}>
                <Stack gap="xs">
                    {/* Branch selector */}
                    <Group gap="xs">
                        {isEditingBranch ? (
                            <TextInput
                                size="xs"
                                value={branch}
                                onChange={(e) => setBranch(e.target.value)}
                                onBlur={() => setIsEditingBranch(false)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        setIsEditingBranch(false);
                                    }
                                }}
                                autoFocus
                                w={200}
                                leftSection={
                                    <MantineIcon icon={IconGitBranch} />
                                }
                            />
                        ) : (
                            <Menu position="top-start">
                                <Menu.Target>
                                    <Button
                                        variant="subtle"
                                        size="compact-xs"
                                        leftSection={
                                            <MantineIcon icon={IconGitBranch} />
                                        }
                                        c="dimmed"
                                    >
                                        {branch}
                                    </Button>
                                </Menu.Target>
                                <Menu.Dropdown>
                                    <Menu.Item
                                        onClick={() => setIsEditingBranch(true)}
                                    >
                                        Change branch name
                                    </Menu.Item>
                                </Menu.Dropdown>
                            </Menu>
                        )}
                    </Group>
                    <AgentCodingChatInput
                        onSubmit={handleSendMessage}
                        loading={createMutation.isLoading}
                        placeholder="Send a message to start a new session..."
                    />
                </Stack>
                {createMutation.isError && (
                    <Text c="red" size="sm" mt="xs">
                        Error: {createMutation.error?.error?.message}
                    </Text>
                )}
            </Box>
        </Box>
    );
};

// Sidebar session list item
const SessionListItem: FC<{
    session: AgentCodingSession;
    isSelected: boolean;
    onClick: () => void;
}> = ({ session, isSelected, onClick }) => {
    const branchName = session.githubBranch.split('/').pop() || session.githubBranch;

    return (
        <NavLink
            active={isSelected}
            onClick={onClick}
            label={
                <Text size="sm" truncate>
                    {branchName}
                </Text>
            }
            description={
                <Text size="xs" c="dimmed">
                    {new Date(session.createdAt).toLocaleDateString()}
                </Text>
            }
            rightSection={
                <Badge
                    color={statusColors[session.status]}
                    size="xs"
                    variant="light"
                >
                    {session.status}
                </Badge>
            }
        />
    );
};

// Main page component
const AgentCodingSessions: FC = () => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const [searchParams] = useSearchParams();
    // Persist last active session UUID across page reloads (shared with drawer)
    const [selectedSessionUuid, setSelectedSessionUuid] = useLocalStorage<
        string | null
    >({
        key: 'lightdash-build-last-session',
        defaultValue: null,
    });
    const [showCreateForm, setShowCreateForm] = useState(false);

    const {
        data: sessions,
        isLoading,
        error,
        refetch: refetchSessions,
    } = useAgentCodingSessions(projectUuid);
    const deleteMutation = useDeleteAgentCodingSession(projectUuid || '');

    // All hooks must be called before any early returns
    const handleSessionUpdate = useCallback(() => {
        void refetchSessions();
    }, [refetchSessions]);

    // Select session from URL query param (e.g., from drawer fullscreen link)
    useEffect(() => {
        const sessionFromUrl = searchParams.get('session');
        if (sessionFromUrl) {
            setSelectedSessionUuid(sessionFromUrl);
        }
    }, [searchParams, setSelectedSessionUuid]);

    if (!projectUuid) {
        return <Text>No project selected</Text>;
    }

    // Sort sessions by creation time (most recent first)
    const sortedSessions = sessions
        ? [...sessions].sort(
              (a, b) =>
                  new Date(b.createdAt).getTime() -
                  new Date(a.createdAt).getTime(),
          )
        : [];

    const selectedSession = sortedSessions.find(
        (s) => s.sessionUuid === selectedSessionUuid,
    );

    const handleDeleteSession = (sessionUuid: string) => {
        deleteMutation.mutate(sessionUuid, {
            onSuccess: () => {
                if (selectedSessionUuid === sessionUuid) {
                    setSelectedSessionUuid(null);
                }
            },
        });
    };

    const handleSessionCreated = (sessionUuid: string) => {
        setShowCreateForm(false);
        setSelectedSessionUuid(sessionUuid);
    };

    const handleNewSession = () => {
        setShowCreateForm(true);
        setSelectedSessionUuid(null);
    };

    const handleSelectSession = (sessionUuid: string) => {
        setShowCreateForm(false);
        setSelectedSessionUuid(sessionUuid);
    };

    return (
        <Page title="Agent Coding Sessions" withFullHeight noContentPadding>
            <Group h="100%" gap={0} align="stretch" wrap="nowrap">
                {/* Sidebar */}
                <Stack w={280} h="100%" gap={0} className={classes.sidebar}>
                    <Box p="md">
                        <Button
                            fullWidth
                            color={showCreateForm ? 'dark' : undefined}
                            leftSection={<MantineIcon icon={IconPlus} />}
                            onClick={handleNewSession}
                            variant={showCreateForm ? 'filled' : 'default'}
                        >
                            New Session
                        </Button>
                    </Box>

                    <ScrollArea flex={1}>
                        {isLoading && (
                            <Stack align="center" p="md">
                                <Loader size="sm" />
                            </Stack>
                        )}

                        {error && (
                            <Text c="red" size="sm" p="md">
                                Error: {error.error?.message}
                            </Text>
                        )}

                        {sortedSessions.length === 0 && !isLoading && (
                            <Text c="dimmed" size="sm" p="md" ta="center">
                                No sessions yet
                            </Text>
                        )}

                        {sortedSessions.map((session) => (
                            <SessionListItem
                                key={session.sessionUuid}
                                session={session}
                                isSelected={
                                    selectedSessionUuid === session.sessionUuid
                                }
                                onClick={() =>
                                    handleSelectSession(session.sessionUuid)
                                }
                            />
                        ))}
                    </ScrollArea>
                </Stack>

                {/* Main content */}
                <Box flex={1} h="100%">
                    {showCreateForm ? (
                        <NewSessionChatView
                            projectUuid={projectUuid}
                            onCreated={handleSessionCreated}
                        />
                    ) : selectedSession ? (
                        <SessionChatView
                            key={selectedSession.sessionUuid}
                            projectUuid={projectUuid}
                            session={selectedSession}
                            onDelete={() =>
                                handleDeleteSession(selectedSession.sessionUuid)
                            }
                            onSessionUpdate={handleSessionUpdate}
                        />
                    ) : (
                        <Stack
                            h="100%"
                            align="center"
                            justify="center"
                            gap="md"
                        >
                            <Text c="dimmed" size="lg">
                                Select a session or create a new one
                            </Text>
                            <Button
                                color="dark"
                                leftSection={<MantineIcon icon={IconPlus} />}
                                onClick={handleNewSession}
                            >
                                New Session
                            </Button>
                        </Stack>
                    )}
                </Box>
            </Group>
        </Page>
    );
};

export default AgentCodingSessions;
