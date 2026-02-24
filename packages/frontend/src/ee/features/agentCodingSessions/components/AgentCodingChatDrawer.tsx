import { type AgentCodingSession } from '@lightdash/common';
import {
    ActionIcon,
    Anchor,
    Badge,
    Box,
    Button,
    Drawer,
    Group,
    Loader,
    Menu,
    NavLink,
    Stack,
    Text,
    TextInput,
} from '@mantine-8/core';
import {
    IconArrowLeft,
    IconArrowsMaximize,
    IconGitBranch,
    IconPlus,
} from '@tabler/icons-react';
import { useLocalStorage } from '@mantine-8/hooks';
import { useCallback, useEffect, useState, type FC } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../../../components/common/MantineIcon';
import {
    useAgentCodingSessionMessages,
    useAgentCodingSessions,
    useCreateAgentCodingSession,
    useSendAgentCodingSessionMessage,
} from '../../../hooks/useAgentCodingSessions';
import { useAgentCodingStream } from '../hooks/useAgentCodingStream';
import { AgentCodingChatDisplay } from './AgentCodingChatDisplay';
import classes from './AgentCodingChatDrawer.module.css';
import { AgentCodingChatInput } from './AgentCodingChatInput';

const statusColors: Record<string, string> = {
    pending: 'yellow',
    running: 'blue',
    finished: 'green',
    errored: 'red',
};

interface SessionChatProps {
    projectUuid: string;
    session: AgentCodingSession;
    onBack: () => void;
    onSessionUpdate: () => void;
    onClose: () => void;
}

const SessionChat: FC<SessionChatProps> = ({
    projectUuid,
    session,
    onBack,
    onSessionUpdate,
    onClose,
}) => {
    const { data: messages = [], refetch: refetchMessages } =
        useAgentCodingSessionMessages(projectUuid, session.sessionUuid);

    const sendMessageMutation = useSendAgentCodingSessionMessage(
        projectUuid,
        session.sessionUuid,
    );

    const handleStreamEnd = useCallback(() => {
        void refetchMessages();
        onSessionUpdate();
    }, [refetchMessages, onSessionUpdate]);

    const shouldStream =
        session.status === 'pending' || session.status === 'running';

    const { streamSegments, isStreaming, error } = useAgentCodingStream({
        projectUuid,
        sessionUuid: session.sessionUuid,
        enabled: shouldStream,
        onStreamEnd: handleStreamEnd,
    });

    const handleSendMessage = useCallback(
        (message: string) => {
            sendMessageMutation.mutate(
                { prompt: message },
                {
                    onSuccess: () => {
                        void refetchMessages();
                    },
                },
            );
        },
        [sendMessageMutation, refetchMessages],
    );

    const isInputDisabled =
        isStreaming ||
        sendMessageMutation.isLoading ||
        session.status === 'pending' ||
        session.status === 'running';

    const branchName =
        session.githubBranch.split('/').pop() || session.githubBranch;

    return (
        <Stack flex={1} gap={0} mih={0}>
            {/* Header */}
            <Box p="sm" className={classes.headerBorder}>
                <Group gap="sm">
                    <ActionIcon variant="subtle" onClick={onBack}>
                        <MantineIcon icon={IconArrowLeft} />
                    </ActionIcon>
                    <Stack gap={2} flex={1}>
                        <Group gap="xs">
                            <Text size="sm" fw={500} truncate>
                                {branchName}
                            </Text>
                            <Badge
                                color={statusColors[session.status]}
                                size="xs"
                            >
                                {session.status}
                            </Badge>
                            {isStreaming && <Loader size="xs" />}
                        </Group>
                    </Stack>
                    <ActionIcon
                        component={Link}
                        to={`/projects/${projectUuid}/agent-coding-sessions?session=${session.sessionUuid}`}
                        variant="subtle"
                        onClick={onClose}
                        title="Open full page"
                    >
                        <MantineIcon icon={IconArrowsMaximize} />
                    </ActionIcon>
                </Group>
                {(session.errorMessage || error) && (
                    <Text size="xs" c="red" mt="xs">
                        {session.errorMessage || error}
                    </Text>
                )}
            </Box>

            {/* Chat area */}
            <AgentCodingChatDisplay
                messages={messages}
                streamSegments={streamSegments}
                isStreaming={isStreaming}
            >
                <Box
                    p="sm"
                    className={classes.footerBorder}
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

interface NewSessionChatProps {
    projectUuid: string;
    onBack: () => void;
    onSessionCreated: (session: AgentCodingSession) => void;
}

const NewSessionChat: FC<NewSessionChatProps> = ({
    projectUuid,
    onBack,
    onSessionCreated,
}) => {
    const [branch, setBranch] = useState('main');
    const [isEditingBranch, setIsEditingBranch] = useState(false);

    const createMutation = useCreateAgentCodingSession(projectUuid);

    const handleSendMessage = useCallback(
        (message: string) => {
            createMutation.mutate(
                { prompt: message, githubBranch: branch },
                {
                    onSuccess: (session) => {
                        onSessionCreated(session);
                    },
                },
            );
        },
        [createMutation, branch, onSessionCreated],
    );

    return (
        <Stack flex={1} gap={0} mih={0}>
            {/* Header */}
            <Box p="sm" className={classes.headerBorder}>
                <Group gap="sm">
                    <ActionIcon variant="subtle" onClick={onBack}>
                        <MantineIcon icon={IconArrowLeft} />
                    </ActionIcon>
                    <Text size="sm" fw={500}>
                        New Session
                    </Text>
                </Group>
            </Box>

            {/* Spacer to push input to bottom */}
            <Box flex={1} mih={0} />

            {/* Input at bottom */}
            <Box p="sm" className={classes.footerBorder}>
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
                    <Text c="red" size="xs" mt="xs">
                        Error: {createMutation.error?.error?.message}
                    </Text>
                )}
            </Box>
        </Stack>
    );
};

interface SessionListProps {
    sessions: AgentCodingSession[];
    onSelectSession: (session: AgentCodingSession) => void;
    onNewSession: () => void;
    projectUuid: string;
    onClose: () => void;
}

const SessionList: FC<SessionListProps> = ({
    sessions,
    onSelectSession,
    onNewSession,
    projectUuid,
    onClose,
}) => {
    return (
        <Stack gap={0} h="100%">
            <Box p="sm">
                <Button
                    fullWidth
                    variant="default"
                    leftSection={<MantineIcon icon={IconPlus} />}
                    onClick={onNewSession}
                >
                    New Session
                </Button>
            </Box>
            {sessions.length === 0 ? (
                <Stack align="center" justify="center" flex={1} p="xl">
                    <Text c="dimmed" ta="center">
                        No recent coding sessions
                    </Text>
                </Stack>
            ) : (
                sessions.map((session) => {
                    const branchName =
                        session.githubBranch.split('/').pop() ||
                        session.githubBranch;

                    return (
                        <NavLink
                            key={session.sessionUuid}
                            onClick={() => onSelectSession(session)}
                            label={
                                <Text size="sm" truncate>
                                    {branchName}
                                </Text>
                            }
                            description={
                                <Text size="xs" c="dimmed">
                                    {new Date(
                                        session.createdAt,
                                    ).toLocaleDateString()}
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
                })
            )}
            <Box p="md" ta="center">
                <Anchor
                    component={Link}
                    to={`/projects/${projectUuid}/agent-coding-sessions`}
                    size="sm"
                    onClick={onClose}
                >
                    View all chats
                </Anchor>
            </Box>
        </Stack>
    );
};

interface PendingPrompt {
    prompt: string;
    branch: string;
}

interface AgentCodingChatDrawerProps {
    opened: boolean;
    onClose: () => void;
    projectUuid: string | undefined;
    /** Session created externally (e.g., from "Fix with AI" button) */
    initialSession?: AgentCodingSession | null;
    /** Prompt being created externally - shows loading state */
    pendingPrompt?: PendingPrompt | null;
}

type DrawerView = 'list' | 'session' | 'new';

export const AgentCodingChatDrawer: FC<AgentCodingChatDrawerProps> = ({
    opened,
    onClose,
    projectUuid,
    initialSession,
    pendingPrompt,
}) => {
    const [view, setView] = useState<DrawerView>('list');
    const [selectedSession, setSelectedSession] =
        useState<AgentCodingSession | null>(null);

    // Persist last active session UUID across page reloads
    const [lastSessionUuid, setLastSessionUuid] = useLocalStorage<
        string | null
    >({
        key: 'lightdash-build-last-session',
        defaultValue: null,
    });

    const {
        data: sessions,
        isLoading,
        refetch: refetchSessions,
    } = useAgentCodingSessions(projectUuid);

    // Handle initialSession from external source (e.g., "Fix with AI" button)
    useEffect(() => {
        if (initialSession && opened) {
            setSelectedSession(initialSession);
            setView('session');
            setLastSessionUuid(initialSession.sessionUuid);
            void refetchSessions();
        }
    }, [initialSession, opened, setLastSessionUuid, refetchSessions]);

    // Restore last active session when drawer opens and sessions are loaded
    useEffect(() => {
        if (opened && sessions && lastSessionUuid && !selectedSession && !initialSession && !pendingPrompt) {
            const sessionToRestore = sessions.find(
                (s) => s.sessionUuid === lastSessionUuid,
            );
            if (sessionToRestore) {
                setSelectedSession(sessionToRestore);
                setView('session');
            }
        }
    }, [opened, sessions, lastSessionUuid, selectedSession, initialSession, pendingPrompt]);

    const handleSessionUpdate = useCallback(() => {
        void refetchSessions();
    }, [refetchSessions]);

    // Get last 3 sessions sorted by creation time
    const recentSessions = sessions
        ? [...sessions]
              .sort(
                  (a, b) =>
                      new Date(b.createdAt).getTime() -
                      new Date(a.createdAt).getTime(),
              )
              .slice(0, 3)
        : [];

    // Update selected session when sessions data changes
    // Look up from all sessions, not just recent ones, since the persisted session
    // might not be in the top 3 most recent
    const currentSelectedSession = selectedSession
        ? sessions?.find(
              (s) => s.sessionUuid === selectedSession.sessionUuid,
          ) || null
        : null;

    const handleClose = () => {
        setView('list');
        setSelectedSession(null);
        onClose();
    };

    const handleBack = () => {
        setView('list');
        setSelectedSession(null);
        setLastSessionUuid(null);
    };

    const handleSelectSession = (session: AgentCodingSession) => {
        setSelectedSession(session);
        setView('session');
        setLastSessionUuid(session.sessionUuid);
    };

    const handleNewSession = () => {
        setView('new');
    };

    const handleSessionCreated = (session: AgentCodingSession) => {
        void refetchSessions();
        setSelectedSession(session);
        setView('session');
        setLastSessionUuid(session.sessionUuid);
    };

    if (!projectUuid) {
        return null;
    }

    const showNoPadding = view === 'session' || view === 'new';

    return (
        <Drawer
            opened={opened}
            onClose={handleClose}
            position="right"
            size="md"
            classNames={{ content: classes.drawerContent, body: classes.drawerBody }}
            withCloseButton={false}
            padding={showNoPadding ? 0 : undefined}
            zIndex={10000}
        >
            {isLoading || pendingPrompt ? (
                <Stack align="center" justify="center" h={200} gap="sm">
                    <Loader size="sm" />
                    {pendingPrompt && (
                        <Text size="sm" c="dimmed">
                            Creating session...
                        </Text>
                    )}
                </Stack>
            ) : view === 'session' && currentSelectedSession ? (
                <SessionChat
                    projectUuid={projectUuid}
                    session={currentSelectedSession}
                    onBack={handleBack}
                    onSessionUpdate={handleSessionUpdate}
                    onClose={handleClose}
                />
            ) : view === 'new' ? (
                <NewSessionChat
                    projectUuid={projectUuid}
                    onBack={handleBack}
                    onSessionCreated={handleSessionCreated}
                />
            ) : (
                <SessionList
                    sessions={recentSessions}
                    onSelectSession={handleSelectSession}
                    onNewSession={handleNewSession}
                    projectUuid={projectUuid}
                    onClose={handleClose}
                />
            )}
        </Drawer>
    );
};
