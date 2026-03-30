import {
    ActionIcon,
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
import { useCallback, useEffect, useRef, useState, type FC } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { Link, Navigate, useParams } from 'react-router';
import AppIframePreview from '../features/apps/AppIframePreview';
import { useAppPreviewToken } from '../features/apps/hooks/useAppPreviewToken';
import { useGenerateApp } from '../features/apps/hooks/useGenerateApp';
import useHealth from '../hooks/health/useHealth';
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
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const [prompt, setPrompt] = useState('');
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const { mutate, isLoading, error, reset } = useGenerateApp();
    const health = useHealth();
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const latestApp = [...messages]
        .reverse()
        .find((m) => m.appUuid !== null && m.version !== null);

    const scrollToBottom = useCallback(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, []);

    useEffect(() => {
        scrollToBottom();
    }, [messages, isLoading, scrollToBottom]);

    if (health.data && !health.data.dataApps.enabled) {
        return <Navigate to={`/projects/${projectUuid}/home`} replace />;
    }

    if (!projectUuid) {
        return <div>Missing project UUID</div>;
    }

    const handleSubmit = () => {
        const trimmed = prompt.trim();
        if (!trimmed || isLoading) return;

        setMessages((prev) => [
            ...prev,
            { role: 'user', content: trimmed, appUuid: null, version: null },
        ]);
        setPrompt('');
        reset();

        mutate(
            { projectUuid, prompt: trimmed },
            {
                onSuccess: (data) => {
                    setMessages((prev) => [
                        ...prev,
                        {
                            role: 'assistant',
                            content: 'Your app is ready!',
                            appUuid: data.appUuid,
                            version: data.version,
                        },
                    ]);
                },
                onError: (err) => {
                    setMessages((prev) => [
                        ...prev,
                        {
                            role: 'assistant',
                            content:
                                err instanceof Error
                                    ? err.message
                                    : 'Failed to generate app',
                            appUuid: null,
                            version: null,
                        },
                    ]);
                },
            },
        );
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
    };

    return (
        <div className={classes.layout}>
            <PanelGroup direction="horizontal">
                {/* Chat Panel */}
                <Panel defaultSize={30} minSize={20} maxSize={50}>
                    <div className={classes.chatPanel}>
                        <div className={classes.chatMessages}>
                            {messages.length === 0 && !isLoading ? (
                                <div className={classes.emptyChat}>
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
                                </div>
                            ) : (
                                <>
                                    {messages.map((msg, i) =>
                                        msg.role === 'user' ? (
                                            <div
                                                key={i}
                                                className={classes.userMessage}
                                            >
                                                <div
                                                    className={
                                                        classes.userBubble
                                                    }
                                                >
                                                    {msg.content}
                                                </div>
                                            </div>
                                        ) : (
                                            <div
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
                                                <div
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
                                                </div>
                                            </div>
                                        ),
                                    )}
                                    {isLoading && (
                                        <div
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
                                            <div
                                                className={
                                                    classes.assistantBubble
                                                }
                                            >
                                                <Text size="sm" c="dimmed">
                                                    Generating your app{' '}
                                                    <LoadingDots />
                                                </Text>
                                            </div>
                                        </div>
                                    )}
                                    {error && !isLoading && (
                                        <div
                                            className={classes.assistantMessage}
                                        >
                                            <ThemeIcon
                                                size="sm"
                                                radius="xl"
                                                variant="light"
                                                color="red"
                                                mt={2}
                                            >
                                                <IconSparkles size={12} />
                                            </ThemeIcon>
                                            <Text size="sm" c="red">
                                                {error instanceof Error
                                                    ? error.message
                                                    : 'Failed to generate app'}
                                            </Text>
                                        </div>
                                    )}
                                </>
                            )}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Chat Input */}
                        <div className={classes.chatInputArea}>
                            <div className={classes.inputWrapper}>
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
                            </div>
                        </div>
                    </div>
                </Panel>

                <PanelResizeHandle className={classes.resizeHandle} />

                {/* Preview Panel */}
                <Panel minSize={40}>
                    <div className={classes.previewPanel}>
                        <div className={classes.previewHeader}>
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
                        </div>

                        <div className={classes.previewContent}>
                            {latestApp?.appUuid && latestApp?.version ? (
                                <AppPreview
                                    projectUuid={projectUuid}
                                    appUuid={latestApp.appUuid}
                                    version={latestApp.version}
                                />
                            ) : (
                                <div className={classes.previewEmpty}>
                                    <IconAppWindow size={48} stroke={1} />
                                    <Text size="sm">
                                        Your app preview will appear here
                                    </Text>
                                </div>
                            )}
                        </div>
                    </div>
                </Panel>
            </PanelGroup>
        </div>
    );
};

export default AppGenerate;
