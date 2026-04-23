import { subject } from '@casl/ability';
import {
    FeatureFlags,
    isAppVersionInProgress,
    type ApiAppVersionSummary,
} from '@lightdash/common';
import {
    ActionIcon,
    Box,
    CloseButton,
    Group,
    Image,
    Loader,
    Text,
    Textarea,
    ThemeIcon,
} from '@mantine-8/core';
import {
    IconAppWindow,
    IconArrowUp,
    IconExternalLink,
    IconPlayerStop,
    IconSparkles,
} from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import ReactMarkdownPreview from '@uiw/react-markdown-preview';
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type FC,
} from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { Link, Navigate, useNavigate, useParams } from 'react-router';
import { v4 as uuid4 } from 'uuid';
import { EditableText } from '../components/VisualizationConfigs/common/EditableText';
import AppIframePreview from '../features/apps/AppIframePreview';
import AppResourcePicker, {
    SelectedChartPills,
    type SelectedChart,
} from '../features/apps/AppResourcePicker';
import { useAppBuildPoller } from '../features/apps/hooks/useAppBuildPoller';
import { useAppImageUpload } from '../features/apps/hooks/useAppImageUpload';
import { useAppPreviewToken } from '../features/apps/hooks/useAppPreviewToken';
import type { QueryEvent } from '../features/apps/hooks/useAppSdkBridge';
import { useBuildNotification } from '../features/apps/hooks/useBuildNotification';
import { useCancelAppVersion } from '../features/apps/hooks/useCancelAppVersion';
import { useGenerateApp } from '../features/apps/hooks/useGenerateApp';
import { useGetApp } from '../features/apps/hooks/useGetApp';
import { useIterateApp } from '../features/apps/hooks/useIterateApp';
import { useUpdateApp } from '../features/apps/hooks/useUpdateApp';
import QueryInspector from '../features/apps/QueryInspector';
import { useServerFeatureFlag } from '../hooks/useServerOrClientFeatureFlag';
import { useAbilityContext } from '../providers/Ability/useAbilityContext';
import useApp from '../providers/App/useApp';
import classes from './AppGenerate.module.css';

type ChatChart = {
    name: string;
    uuid: string;
};

type ChatMessage = {
    role: 'user' | 'assistant';
    content: string;
    imagePreviewUrl: string | null;
    charts: ChatChart[];
    appUuid: string | null;
    version: number | null;
};

const AppPreview: FC<{
    projectUuid: string;
    appUuid: string;
    version: number;
    onQueryEvent?: (event: QueryEvent) => void;
}> = ({ projectUuid, appUuid, version, onQueryEvent }) => {
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

    return <AppIframePreview src={previewUrl} onQueryEvent={onQueryEvent} />;
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
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [prompt, setPrompt] = useState('');
    const [imageAttachment, setImageAttachment] = useState<{
        file: File;
        previewUrl: string;
    } | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [selectedCharts, setSelectedCharts] = useState<SelectedChart[]>([]);
    const [trackedQueries, setTrackedQueries] = useState<QueryEvent[]>([]);
    const handleQueryEvent = useCallback((event: QueryEvent) => {
        setTrackedQueries((prev) => {
            // If this event has a queryUuid, merge it with an existing entry
            if (event.queryUuid) {
                const existing = prev.find(
                    (q) => q.queryUuid === event.queryUuid,
                );
                if (existing) {
                    return prev.map((q) =>
                        q.queryUuid === event.queryUuid
                            ? {
                                  ...q,
                                  label: event.label ?? q.label,
                                  status: event.status,
                                  rowCount: event.rowCount ?? q.rowCount,
                                  durationMs: event.durationMs ?? q.durationMs,
                                  error: event.error ?? q.error,
                                  rawMetricQuery:
                                      event.rawMetricQuery ?? q.rawMetricQuery,
                              }
                            : q,
                    );
                }
            }
            // If this is a POST initiation with queryUuid, check if we
            // have a pending entry from the same request id to merge
            const pendingIdx = prev.findIndex(
                (q) => q.id === event.id && q.status === 'pending',
            );
            if (pendingIdx >= 0) {
                return prev.map((q, i) =>
                    i === pendingIdx
                        ? {
                              ...event,
                              rawMetricQuery:
                                  event.rawMetricQuery ?? q.rawMetricQuery,
                          }
                        : q,
                );
            }
            return [...prev, event];
        });
    }, []);
    const [localMessages, setLocalMessages] = useState<ChatMessage[]>([]);
    // Maps prompt text → image preview URL so the thumbnail survives the
    // local→server message transition (localMessages get cleared when server
    // version data arrives, but the ref persists).
    const sentImagesByPrompt = useRef(new Map<string, string>());
    // Maps prompt text → chart names so they survive the local→server transition
    const sentChartsByPrompt = useRef(new Map<string, ChatChart[]>());
    // Track appUuid in local state so polling starts immediately after creation
    // (before the URL param updates via replaceState)
    const [activeAppUuid, setActiveAppUuid] = useState<string | undefined>(
        urlAppUuid,
    );
    // Sync from URL when navigating (e.g. browser back/forward).
    // When navigating to "new app" mode, clear all session state.
    useEffect(() => {
        setActiveAppUuid(urlAppUuid);
        if (!urlAppUuid) {
            setPrompt('');
            setLocalMessages([]);
            setPreviewApp(null);
            versionCacheRef.current.clear();
            versionCacheAppRef.current = undefined;
            setTrackedQueries([]);
            sentImagesByPrompt.current.forEach((url) =>
                URL.revokeObjectURL(url),
            );
            sentImagesByPrompt.current.clear();
        }
    }, [urlAppUuid]);
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
    const { mutate: updateAppMutate } = useUpdateApp();
    const { mutate: cancelMutate, isLoading: isCancelling } =
        useCancelAppVersion();
    const { mutateAsync: uploadImage } = useAppImageUpload();
    const dataAppsFlag = useServerFeatureFlag(FeatureFlags.EnableDataApps);
    const { user } = useApp();
    const ability = useAbilityContext();
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Fetch version history (polling is handled by the Web Worker below)
    const {
        data: appData,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
    } = useGetApp(projectUuid, activeAppUuid ?? urlAppUuid);

    // Derive app name/description from fetched data
    const appName = appData?.pages?.[0]?.name ?? '';
    const appDescription = appData?.pages?.[0]?.description ?? '';

    // Draft state for inline editing (synced from server, saved on blur)
    const [draftName, setDraftName] = useState(appName);
    const [draftDescription, setDraftDescription] = useState(appDescription);
    const isEditingName = useRef(false);
    const isEditingDescription = useRef(false);
    useEffect(() => {
        if (!isEditingName.current) setDraftName(appName);
    }, [appName]);
    useEffect(() => {
        if (!isEditingDescription.current) setDraftDescription(appDescription);
    }, [appDescription]);

    // Accumulate all versions ever seen in this session. Refetches may lose
    // older versions when new ones shift pagination boundaries, but we keep
    // everything that's been fetched at least once. Status updates are applied.
    const versionCacheRef = useRef(new Map<number, ApiAppVersionSummary>());
    const versionCacheAppRef = useRef(activeAppUuid);
    const allVersions = useMemo(() => {
        // Clear cache when switching to a different app
        if (versionCacheAppRef.current !== activeAppUuid) {
            versionCacheRef.current.clear();
            versionCacheAppRef.current = activeAppUuid;
        }
        if (appData?.pages) {
            for (const page of appData.pages) {
                for (const v of page.versions) {
                    versionCacheRef.current.set(v.version, v);
                }
            }
        }
        return Array.from(versionCacheRef.current.values());
    }, [appData, activeAppUuid]);

    // Derive building state from the latest version in fetched data
    const latestBuildingVersion = useMemo(() => {
        if (!appData?.pages?.[0]) return null;
        const latest = appData.pages[0].versions[0];
        if (latest?.status && isAppVersionInProgress(latest.status))
            return latest;
        return null;
    }, [appData]);
    const isBuilding = latestBuildingVersion !== null;
    const isLoading = isGenerating || isIterating || isBuilding;

    // OS notification when a build finishes (only fires when tab is in background)
    const notifyBuildDone = useBuildNotification(appName, isLoading);

    // Web Worker that polls the API while a version is building.
    // Workers aren't throttled in background tabs, unlike main-thread timers.
    useAppBuildPoller(projectUuid, activeAppUuid, isBuilding, notifyBuildDone);

    // Clear local messages once server data takes over (avoids duplicates).
    // Use the version count as dependency so this doesn't fire on every poll.
    const serverVersionCount = allVersions.length;
    useEffect(() => {
        if (serverVersionCount > 0) {
            setLocalMessages([]);
        }
    }, [serverVersionCount]);

    // Convert fetched versions into chat messages (oldest first)
    const historyMessages = useMemo<ChatMessage[]>(() => {
        if (allVersions.length === 0) return [];
        const sorted = [...allVersions].sort((a, b) => a.version - b.version);
        return sorted.flatMap((v) => {
            const msgs: ChatMessage[] = [
                {
                    role: 'user',
                    content: v.prompt,
                    imagePreviewUrl:
                        sentImagesByPrompt.current.get(v.prompt) ?? null,
                    charts: sentChartsByPrompt.current.get(v.prompt) ?? [],
                    appUuid: null,
                    version: null,
                },
            ];
            if (v.status === 'ready') {
                msgs.push({
                    role: 'assistant',
                    content:
                        v.statusMessage ??
                        (v.version === 1
                            ? 'Your app is ready!'
                            : `Version ${v.version} is ready!`),
                    imagePreviewUrl: null,
                    charts: [],
                    appUuid: activeAppUuid ?? null,
                    version: v.version,
                });
            } else if (v.status === 'error') {
                msgs.push({
                    role: 'assistant',
                    content:
                        v.statusMessage ??
                        'Generation failed. Please try again.',
                    imagePreviewUrl: null,
                    charts: [],
                    appUuid: null,
                    version: null,
                });
            }
            // 'building' status is not rendered as a history message —
            // it's shown as a live progress indicator below
            return msgs;
        });
    }, [allVersions, activeAppUuid]);

    // Merge: history messages first, then any optimistic local messages
    const messages = useMemo(
        () => [...historyMessages, ...localMessages],
        [historyMessages, localMessages],
    );

    // `hasNextPage` reflects the server's "more pages exist" signal, but we
    // accumulate versions across fetches in `versionCacheRef` — so even if the
    // server thinks more exist, we may already have them all. Versions are
    // 1-indexed and contiguous, so seeing version 1 means we've loaded
    // everything and the "Load earlier messages" button is misleading.
    const hasUnloadedEarlierVersions =
        hasNextPage && !allVersions.some((v) => v.version === 1);

    // Stable reference for the preview — only updates when a new version
    // becomes ready, preventing iframe reloads during status polling.
    const latestReadyPreview = useMemo(() => {
        if (allVersions.length === 0 || !activeAppUuid) return null;
        // Find the highest-numbered ready version
        const ready = [...allVersions]
            .sort((a, b) => b.version - a.version)
            .find((v) => v.status === 'ready');
        if (!ready) return null;
        return { appUuid: activeAppUuid, version: ready.version };
    }, [allVersions, activeAppUuid]);
    const [previewApp, setPreviewApp] = useState(latestReadyPreview);
    useEffect(() => {
        if (
            latestReadyPreview &&
            (latestReadyPreview.appUuid !== previewApp?.appUuid ||
                latestReadyPreview.version !== previewApp?.version)
        ) {
            setPreviewApp(latestReadyPreview);
        }
    }, [latestReadyPreview, previewApp?.appUuid, previewApp?.version]);

    const scrollToBottom = useCallback(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, []);

    useEffect(() => {
        scrollToBottom();
    }, [messages, isLoading, scrollToBottom]);

    // Revoke all sent image blob URLs on unmount to prevent memory leaks.
    // We don't revoke on imageAttachment change because the URL may have
    // been transferred to a sent message for display.
    useEffect(() => {
        const ref = sentImagesByPrompt.current;
        return () => {
            ref.forEach((url) => URL.revokeObjectURL(url));
        };
    }, []);

    if (dataAppsFlag.isLoading) {
        return null;
    }
    if (!dataAppsFlag.data?.enabled) {
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

    const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10 MB
    const ACCEPTED_IMAGE_TYPES = [
        'image/png',
        'image/jpeg',
        'image/gif',
        'image/webp',
    ];

    const handleImageAttach = (file: File) => {
        if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
            return;
        }
        if (file.size > MAX_IMAGE_SIZE) {
            return;
        }
        setImageAttachment({
            file,
            previewUrl: URL.createObjectURL(file),
        });
    };

    const handlePaste = (e: React.ClipboardEvent) => {
        const items = e.clipboardData?.files;
        if (items && items.length > 0) {
            const file = items[0];
            if (file.type.startsWith('image/')) {
                e.preventDefault();
                handleImageAttach(file);
            }
        }
    };

    const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            handleImageAttach(file);
        }
        e.target.value = '';
    };

    const clearImage = () => {
        if (imageAttachment?.previewUrl) {
            URL.revokeObjectURL(imageAttachment.previewUrl);
        }
        setImageAttachment(null);
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('image/')) {
            handleImageAttach(file);
        }
    };

    const handleSubmit = async () => {
        const trimmed = prompt.trim();
        if (!trimmed || isLoading) return;

        // Collect chart UUIDs to send as structured data (resolved server-side)
        const chartUuids =
            selectedCharts.length > 0
                ? selectedCharts.map((c) => c.uuid)
                : undefined;

        // For new apps, pre-generate the UUID so the image upload and
        // the generate request both use the same app-scoped S3 path.
        const newAppUuid = activeAppUuid ? undefined : uuid4();
        const targetAppUuid = activeAppUuid ?? newAppUuid;

        // Upload image via backend proxy, then reference by opaque imageId
        let imageId: string | undefined;
        if (imageAttachment) {
            try {
                const result = await uploadImage({
                    projectUuid: projectUuid!,
                    file: imageAttachment.file,
                    appUuid: targetAppUuid!,
                });
                imageId = result.imageId;
            } catch {
                // If upload fails, proceed without the image
                // rather than blocking the entire submission
            }
        }

        // Capture the preview URL before clearing — it stays in the message bubble.
        // Also store in the ref so it survives the local→server transition.
        const sentImageUrl = imageAttachment?.previewUrl ?? null;
        if (sentImageUrl) {
            sentImagesByPrompt.current.set(trimmed, sentImageUrl);
        }
        const sentCharts: ChatChart[] = selectedCharts.map((c) => ({
            name: c.name,
            uuid: c.uuid,
        }));
        if (sentCharts.length > 0) {
            sentChartsByPrompt.current.set(trimmed, sentCharts);
        }

        setLocalMessages((prev) => [
            ...prev,
            {
                role: 'user',
                content: trimmed,
                imagePreviewUrl: sentImageUrl,
                charts: sentCharts,
                appUuid: null,
                version: null,
            },
        ]);
        setPrompt('');
        // Don't revoke the object URL since it's now referenced by the message
        setImageAttachment(null);
        setSelectedCharts([]);
        resetGenerate();
        resetIterate();

        const callbacks = {
            onSuccess: (data: { appUuid: string; version: number }) => {
                setActiveAppUuid(data.appUuid);
                void queryClient.invalidateQueries({
                    queryKey: ['app', projectUuid, data.appUuid],
                });
                if (!urlAppUuid) {
                    void navigate(
                        `/projects/${projectUuid}/apps/${data.appUuid}`,
                        { replace: true },
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
                        imagePreviewUrl: null,
                        charts: [],
                        appUuid: null,
                        version: null,
                    },
                ]);
            },
        };

        if (activeAppUuid) {
            iterateMutate(
                {
                    projectUuid,
                    appUuid: activeAppUuid,
                    prompt: trimmed,
                    imageId,
                    chartUuids,
                },
                callbacks,
            );
        } else {
            generateMutate(
                {
                    projectUuid,
                    prompt: trimmed,
                    imageId,
                    appUuid: newAppUuid,
                    chartUuids,
                },
                callbacks,
            );
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            void handleSubmit();
        }
    };

    const handleCancel = () => {
        if (
            !projectUuid ||
            !activeAppUuid ||
            !latestBuildingVersion ||
            isCancelling
        )
            return;
        cancelMutate(
            {
                projectUuid,
                appUuid: activeAppUuid,
                version: latestBuildingVersion.version,
            },
            {
                onSuccess: () => {
                    void queryClient.invalidateQueries({
                        queryKey: ['app', projectUuid, activeAppUuid],
                    });
                },
            },
        );
    };

    return (
        <Box className={classes.layout}>
            <PanelGroup direction="horizontal">
                {/* Chat Panel */}
                <Panel defaultSize={30} minSize={20} maxSize={50}>
                    <Box className={classes.chatPanel}>
                        <Box className={classes.chatMessages}>
                            {hasUnloadedEarlierVersions && (
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
                                                    {msg.charts.length > 0 && (
                                                        <Box mt="xs">
                                                            <Text
                                                                size="sm"
                                                                fw={700}
                                                            >
                                                                Included queries
                                                            </Text>
                                                            <ul
                                                                style={{
                                                                    margin: 0,
                                                                    paddingLeft: 20,
                                                                }}
                                                            >
                                                                {msg.charts.map(
                                                                    (chart) => (
                                                                        <li
                                                                            key={
                                                                                chart.uuid
                                                                            }
                                                                        >
                                                                            <Text
                                                                                size="sm"
                                                                                component="span"
                                                                            >
                                                                                {
                                                                                    chart.name
                                                                                }{' '}
                                                                                (id:{' '}
                                                                                {
                                                                                    chart.uuid
                                                                                }
                                                                                )
                                                                            </Text>
                                                                        </li>
                                                                    ),
                                                                )}
                                                            </ul>
                                                        </Box>
                                                    )}
                                                    {msg.imagePreviewUrl && (
                                                        <Image
                                                            src={
                                                                msg.imagePreviewUrl
                                                            }
                                                            className={
                                                                classes.sentImageThumbnail
                                                            }
                                                            alt="Attached"
                                                        />
                                                    )}
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
                                                    {msg.appUuid ? (
                                                        <ReactMarkdownPreview
                                                            source={msg.content}
                                                            className={
                                                                classes.markdown
                                                            }
                                                        />
                                                    ) : (
                                                        <Text size="sm" c="red">
                                                            {msg.content}
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
                                                    {latestBuildingVersion?.statusMessage ??
                                                        'Generating your app'}{' '}
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
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/png,image/jpeg,image/gif,image/webp"
                                onChange={handleFileInputChange}
                                hidden
                            />
                            <Box
                                className={classes.inputWrapper}
                                onDragOver={handleDragOver}
                                onDrop={handleDrop}
                            >
                                <Box className={classes.textareaColumn}>
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
                                        onPaste={handlePaste}
                                        disabled={isLoading}
                                        classNames={{
                                            root: classes.textareaRoot,
                                            input: classes.textarea,
                                            wrapper: classes.textareaWrapper,
                                        }}
                                    />
                                </Box>
                                {isBuilding ? (
                                    <ActionIcon
                                        size="sm"
                                        radius="xl"
                                        variant="filled"
                                        color="red"
                                        onClick={handleCancel}
                                        loading={isCancelling}
                                        className={classes.submitButton}
                                    >
                                        <IconPlayerStop size={14} />
                                    </ActionIcon>
                                ) : (
                                    <Group gap={4} wrap="nowrap">
                                        <AppResourcePicker
                                            onImageClick={() =>
                                                fileInputRef.current?.click()
                                            }
                                            imageDisabled={
                                                isLoading || !!imageAttachment
                                            }
                                            selectedCharts={selectedCharts}
                                            onChartsChange={setSelectedCharts}
                                            disabled={isLoading}
                                        />
                                        <ActionIcon
                                            size="sm"
                                            radius="xl"
                                            variant="filled"
                                            color="violet"
                                            onClick={() => void handleSubmit()}
                                            disabled={
                                                !prompt.trim() || isLoading
                                            }
                                            loading={
                                                isGenerating || isIterating
                                            }
                                            className={classes.submitButton}
                                        >
                                            <IconArrowUp size={14} />
                                        </ActionIcon>
                                    </Group>
                                )}
                            </Box>
                            {(imageAttachment || selectedCharts.length > 0) && (
                                <Group
                                    gap="xs"
                                    wrap="wrap"
                                    align="center"
                                    pt={4}
                                >
                                    {imageAttachment && (
                                        <Box className={classes.imagePreview}>
                                            <Image
                                                src={imageAttachment.previewUrl}
                                                className={
                                                    classes.imagePreviewThumbnail
                                                }
                                                alt="Attached image"
                                            />
                                            <CloseButton
                                                size="xs"
                                                onClick={clearImage}
                                            />
                                        </Box>
                                    )}
                                    <SelectedChartPills
                                        charts={selectedCharts}
                                        onRemove={(uuid) =>
                                            setSelectedCharts((prev) =>
                                                prev.filter(
                                                    (c) => c.uuid !== uuid,
                                                ),
                                            )
                                        }
                                    />
                                </Group>
                            )}
                        </Box>
                    </Box>
                </Panel>

                <PanelResizeHandle className={classes.resizeHandle} />

                {/* Preview Panel */}
                <Panel minSize={40}>
                    <Box className={classes.previewPanel}>
                        {activeAppUuid && (
                            <Box className={classes.previewHeader}>
                                <Box className={classes.previewHeaderInfo}>
                                    <EditableText
                                        value={draftName}
                                        placeholder="Untitled app"
                                        fw={600}
                                        size="md"
                                        onFocus={() => {
                                            isEditingName.current = true;
                                        }}
                                        onChange={(e) =>
                                            setDraftName(e.currentTarget.value)
                                        }
                                        onBlur={() => {
                                            isEditingName.current = false;
                                            const trimmed = draftName.trim();
                                            if (
                                                trimmed &&
                                                trimmed !== appName
                                            ) {
                                                updateAppMutate({
                                                    projectUuid,
                                                    appUuid: activeAppUuid,
                                                    name: trimmed,
                                                });
                                            } else {
                                                setDraftName(appName);
                                            }
                                        }}
                                    />
                                    <EditableText
                                        value={draftDescription}
                                        placeholder="Add a description..."
                                        lighter
                                        onFocus={() => {
                                            isEditingDescription.current = true;
                                        }}
                                        onChange={(e) =>
                                            setDraftDescription(
                                                e.currentTarget.value,
                                            )
                                        }
                                        onBlur={() => {
                                            isEditingDescription.current = false;
                                            const trimmed =
                                                draftDescription.trim();
                                            if (trimmed !== appDescription) {
                                                updateAppMutate({
                                                    projectUuid,
                                                    appUuid: activeAppUuid,
                                                    description: trimmed,
                                                });
                                            } else {
                                                setDraftDescription(
                                                    appDescription,
                                                );
                                            }
                                        }}
                                    />
                                </Box>
                                {previewApp && (
                                    <ActionIcon
                                        component={Link}
                                        to={`/projects/${projectUuid}/apps/${previewApp.appUuid}/preview`}
                                        target="_blank"
                                        variant="subtle"
                                        size="sm"
                                        ml="auto"
                                    >
                                        <IconExternalLink size={14} />
                                    </ActionIcon>
                                )}
                            </Box>
                        )}

                        <Box className={classes.previewContent}>
                            {previewApp ? (
                                <AppPreview
                                    projectUuid={projectUuid}
                                    appUuid={previewApp.appUuid}
                                    version={previewApp.version}
                                    onQueryEvent={handleQueryEvent}
                                />
                            ) : (
                                <Box className={classes.previewEmpty}>
                                    <IconAppWindow size={48} stroke={1} />
                                    <Text size="sm">
                                        Your app preview will appear here
                                    </Text>
                                </Box>
                            )}
                            <QueryInspector
                                queries={trackedQueries}
                                projectUuid={projectUuid!}
                            />
                        </Box>
                    </Box>
                </Panel>
            </PanelGroup>
        </Box>
    );
};

export default AppGenerate;
