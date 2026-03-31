import { subject } from '@casl/ability';
import {
    ActionIcon,
    Box,
    Group,
    Loader,
    Text,
    Textarea,
    ThemeIcon,
} from '@mantine-8/core';
import {
    IconAppWindow,
    IconArrowUp,
    IconExternalLink,
    IconSparkles,
} from '@tabler/icons-react';
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type FC,
} from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { Link, Navigate, useParams } from 'react-router';
import AppIframePreview from '../features/apps/AppIframePreview';
import { useAppPreviewToken } from '../features/apps/hooks/useAppPreviewToken';
import { useGenerateApp } from '../features/apps/hooks/useGenerateApp';
import { useGetApp } from '../features/apps/hooks/useGetApp';
import { useIterateApp } from '../features/apps/hooks/useIterateApp';
import useHealth from '../hooks/health/useHealth';
import { useAbilityContext } from '../providers/Ability/useAbilityContext';
import useApp from '../providers/App/useApp';
import classes from './AppGenerate.module.css';

type ChatMessage = {
    role: 'user' | 'assistant';
    content: string;
    appUuid: string | null;
    version: number | null;
};

const AppPreview: FC<{
    projectUuid: string;
    appUuid: string;
    version: number;
}> = ({ projectUuid, appUuid, version }) => {
    const {
        data: token,
        isLoading,
        error,
    } = useAppPreviewToken(projectUuid, appUuid, version);

    const baseUrl = window.location.origin;
    const previewUrl = token
        ? `${baseUrl}/api/apps/${appUuid}/versions/${version}/?token=${token}#transport=postMessage&projectUuid=${projectUuid}`
        : undefined;

    if (isLoading) {
        return (
            <Group gap="sm" p="md" justify="center">
                <Loader size="sm" />
                <Text size="sm" c="dimmed">
                    Loading preview...
                </Text>
            </Group>
        );
    }

    if (error) {
        return (
            <Text c="red" p="md" size="sm">
                Failed to load preview:{' '}
                {error instanceof Error ? error.message : 'Unknown error'}
            </Text>
        );
    }

    if (!previewUrl) return null;

    return <AppIframePreview src={previewUrl} />;
};

const LoadingDots: FC = () => (
    <span className={classes.loadingDots}>
        <span className={classes.loadingDot} />
        <span className={classes.loadingDot} />
        <span className={classes.loadingDot} />
    </span>
);

const AppGenerate: FC = () => {
    const { projectUuid, appUuid: urlAppUuid } = useParams<{
        projectUuid: string;
        appUuid: string;
    }>();
    const [prompt, setPrompt] = useState('');
    const [localMessages, setLocalMessages] = useState<ChatMessage[]>([]);
    const {
        mutate: generateMutate,
        isLoading: isGenerating,
        reset: resetGenerate,
    } = useGenerateApp();
    const {
        mutate: iterateMutate,
        isLoading: isIterating,
        reset: resetIterate,
    } = useIterateApp();
    const isLoading = isGenerating || isIterating;
    const health = useHealth();
    const { user } = useApp();
    const ability = useAbilityContext();
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Fetch version history when we have an appUuid in the URL
    const {
        data: appData,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
    } = useGetApp(projectUuid, urlAppUuid);

    // Convert fetched versions into chat messages (oldest first)
    const historyMessages = useMemo<ChatMessage[]>(() => {
        if (!appData?.pages) return [];
        const allVersions = appData.pages.flatMap((page) => page.versions);
        // Versions come newest-first from API; reverse for chronological chat order
        const sorted = [...allVersions].sort((a, b) => a.version - b.version);
        return sorted.flatMap((v) => {
            const msgs: ChatMessage[] = [
                {
                    role: 'user',
                    content: v.prompt,
                    appUuid: null,
                    version: null,
                },
            ];
            if (v.status === 'ready') {
                msgs.push({
                    role: 'assistant',
                    content:
                        v.version === 1
                            ? 'Your app is ready!'
                            : `Version ${v.version} is ready!`,
                    appUuid: appData.pages[0].appUuid,
                    version: v.version,
                });
            } else if (v.status === 'error') {
                msgs.push({
                    role: 'assistant',
                    content: 'Generation failed',
                    appUuid: null,
                    version: null,
                });
            }
            return msgs;
        });
    }, [appData]);

    // Merge: history messages first, then any new local messages from this session
    const messages = useMemo(
        () => [...historyMessages, ...localMessages],
        [historyMessages, localMessages],
    );

    const latestApp = [...messages]
        .reverse()
        .find((m) => m.appUuid !== null && m.version !== null);

    const scrollToBottom = useCallback(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, []);

    useEffect(() => {
        scrollToBottom();
    }, [messages, isLoading, scrollToBottom]);

    // Load more versions when scrolling to top
    const handleChatScroll = useCallback(
        (e: React.UIEvent<HTMLDivElement>) => {
            if (
                e.currentTarget.scrollTop === 0 &&
                hasNextPage &&
                !isFetchingNextPage
            ) {
                void fetchNextPage();
            }
        },
        [hasNextPage, isFetchingNextPage, fetchNextPage],
    );

    if (health.data && !health.data.dataApps.enabled) {
        return <Navigate to={`/projects/${projectUuid}/home`} replace />;
    }

    if (
        !ability.can(
            'manage',
            subject('DataApp', {
                organizationUuid: user.data?.organizationUuid,
                projectUuid,
            }),
        )
    ) {
        return <Navigate to={`/projects/${projectUuid}/home`} replace />;
    }

    if (!projectUuid) {
        return <Box>Missing project UUID</Box>;
    }

    const handleSubmit = () => {
        const trimmed = prompt.trim();
        if (!trimmed || isLoading) return;

        setLocalMessages((prev) => [
            ...prev,
            { role: 'user', content: trimmed, appUuid: null, version: null },
        ]);
        setPrompt('');
        resetGenerate();
        resetIterate();

        const callbacks = {
            onSuccess: (data: { appUuid: string; version: number }) => {
                setLocalMessages((prev) => [
                    ...prev,
                    {
                        role: 'assistant' as const,
                        content:
                            data.version === 1
                                ? 'Your app is ready!'
                                : `Version ${data.version} is ready!`,
                        appUuid: data.appUuid,
                        version: data.version,
                    },
                ]);
                // Update URL so the session is resumable, without triggering
                // a re-render or refetch — just silently swap the URL.
                if (!urlAppUuid) {
                    window.history.replaceState(
                        null,
                        '',
                        `/projects/${projectUuid}/apps/${data.appUuid}`,
                    );
                }
            },
            onError: (err: unknown) => {
                setLocalMessages((prev) => [
                    ...prev,
                    {
                        role: 'assistant' as const,
                        content:
                            err instanceof Error
                                ? err.message
                                : 'Failed to generate app',
                        appUuid: null,
                        version: null,
                    },
                ]);
            },
        };

        if (latestApp?.appUuid) {
            iterateMutate(
                {
                    projectUuid,
                    appUuid: latestApp.appUuid,
                    prompt: trimmed,
                },
                callbacks,
            );
        } else {
            generateMutate({ projectUuid, prompt: trimmed }, callbacks);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
    };

    return (
        <Box className={classes.layout}>
            <PanelGroup direction="horizontal">
                {/* Chat Panel */}
                <Panel defaultSize={30} minSize={20} maxSize={50}>
                    <Box className={classes.chatPanel}>
                        <Box
                            className={classes.chatMessages}
                            onScroll={handleChatScroll}
                        >
                            {hasNextPage && (
                                <Group
                                    gap="xs"
                                    justify="center"
                                    p="xs"
                                    onClick={() => {
                                        if (!isFetchingNextPage) {
                                            void fetchNextPage();
                                        }
                                    }}
                                    style={{ cursor: 'pointer' }}
                                >
                                    {isFetchingNextPage ? (
                                        <Loader size="xs" />
                                    ) : null}
                                    <Text size="xs" c="dimmed">
                                        {isFetchingNextPage
                                            ? 'Loading earlier messages...'
                                            : 'Load earlier messages'}
                                    </Text>
                                </Group>
                            )}
                            {messages.length === 0 && !isLoading ? (
                                <Box className={classes.emptyChat}>
                                    <ThemeIcon
                                        size="xl"
                                        radius="xl"
                                        variant="light"
                                        color="violet"
                                    >
                                        <IconSparkles size={24} />
                                    </ThemeIcon>
                                    <Text fw={600} size="lg">
                                        Build a data app
                                    </Text>
                                    <Text size="sm" c="dimmed" maw={280}>
                                        Describe what you want to build and I'll
                                        generate a data app connected to your
                                        project.
                                    </Text>
                                </Box>
                            ) : (
                                <>
                                    {messages.map((msg, i) =>
                                        msg.role === 'user' ? (
                                            <Box
                                                key={i}
                                                className={classes.userMessage}
                                            >
                                                <Box
                                                    className={
                                                        classes.userBubble
                                                    }
                                                >
                                                    {msg.content}
                                                </Box>
                                            </Box>
                                        ) : (
                                            <Box
                                                key={i}
                                                className={
                                                    classes.assistantMessage
                                                }
                                            >
                                                <ThemeIcon
                                                    size="sm"
                                                    radius="xl"
                                                    variant="light"
                                                    color="violet"
                                                    mt={2}
                                                >
                                                    <IconSparkles size={12} />
                                                </ThemeIcon>
                                                <Box
                                                    className={
                                                        classes.assistantBubble
                                                    }
                                                >
                                                    <Text
                                                        size="sm"
                                                        c={
                                                            msg.appUuid
                                                                ? undefined
                                                                : 'red'
                                                        }
                                                    >
                                                        {msg.content}
                                                    </Text>
                                                    {msg.appUuid &&
                                                        msg.version && (
                                                            <Text
                                                                component={Link}
                                                                to={`/projects/${projectUuid}/apps/${msg.appUuid}/versions/${msg.version}/preview`}
                                                                target="_blank"
                                                                size="xs"
                                                                c="dimmed"
                                                                td="underline"
                                                                mt={4}
                                                            >
                                                                Open in new tab{' '}
                                                                <IconExternalLink
                                                                    size={12}
                                                                    style={{
                                                                        verticalAlign:
                                                                            'middle',
                                                                    }}
                                                                />
                                                            </Text>
                                                        )}
                                                </Box>
                                            </Box>
                                        ),
                                    )}
                                    {isLoading && (
                                        <Box
                                            className={classes.assistantMessage}
                                        >
                                            <ThemeIcon
                                                size="sm"
                                                radius="xl"
                                                variant="light"
                                                color="violet"
                                                mt={2}
                                            >
                                                <IconSparkles size={12} />
                                            </ThemeIcon>
                                            <Box
                                                className={
                                                    classes.assistantBubble
                                                }
                                            >
                                                <Text size="sm" c="dimmed">
                                                    Generating your app{' '}
                                                    <LoadingDots />
                                                </Text>
                                            </Box>
                                        </Box>
                                    )}
                                </>
                            )}
                            <Box ref={messagesEndRef} />
                        </Box>

                        {/* Chat Input */}
                        <Box className={classes.chatInputArea}>
                            <Box className={classes.inputWrapper}>
                                <Textarea
                                    ref={textareaRef}
                                    placeholder="Describe the app you want to build..."
                                    autosize
                                    minRows={1}
                                    maxRows={6}
                                    value={prompt}
                                    onChange={(e) =>
                                        setPrompt(e.currentTarget.value)
                                    }
                                    onKeyDown={handleKeyDown}
                                    disabled={isLoading}
                                    classNames={{
                                        root: classes.textareaRoot,
                                        input: classes.textarea,
                                        wrapper: classes.textareaWrapper,
                                    }}
                                />
                                <ActionIcon
                                    size="sm"
                                    radius="xl"
                                    variant="filled"
                                    color="violet"
                                    onClick={handleSubmit}
                                    disabled={!prompt.trim() || isLoading}
                                    loading={isLoading}
                                    className={classes.submitButton}
                                >
                                    <IconArrowUp size={14} />
                                </ActionIcon>
                            </Box>
                        </Box>
                    </Box>
                </Panel>

                <PanelResizeHandle className={classes.resizeHandle} />

                {/* Preview Panel */}
                <Panel minSize={40}>
                    <Box className={classes.previewPanel}>
                        <Box className={classes.previewHeader}>
                            <IconAppWindow size={16} />
                            <Text size="sm" fw={500}>
                                Preview
                            </Text>
                            {latestApp?.appUuid && latestApp?.version && (
                                <ActionIcon
                                    component={Link}
                                    to={`/projects/${projectUuid}/apps/${latestApp.appUuid}/versions/${latestApp.version}/preview`}
                                    target="_blank"
                                    variant="subtle"
                                    size="sm"
                                    ml="auto"
                                >
                                    <IconExternalLink size={14} />
                                </ActionIcon>
                            )}
                        </Box>

                        <Box className={classes.previewContent}>
                            {latestApp?.appUuid && latestApp?.version ? (
                                <AppPreview
                                    projectUuid={projectUuid}
                                    appUuid={latestApp.appUuid}
                                    version={latestApp.version}
                                />
                            ) : (
                                <Box className={classes.previewEmpty}>
                                    <IconAppWindow size={48} stroke={1} />
                                    <Text size="sm">
                                        Your app preview will appear here
                                    </Text>
                                </Box>
                            )}
                        </Box>
                    </Box>
                </Panel>
            </PanelGroup>
        </Box>
    );
};

export default AppGenerate;
