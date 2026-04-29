import { subject } from '@casl/ability';
import {
    ChartKind,
    ContentType,
    FeatureFlags,
    isAppVersionInProgress,
    ResourceViewItemType,
    type ApiAppVersionSummary,
    type DataAppTemplate,
} from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Group,
    Image,
    Loader,
    Menu,
    Text,
    Textarea,
    ThemeIcon,
    Title,
} from '@mantine-8/core';
import {
    IconAppsOff,
    IconAppWindow,
    IconArrowUp,
    IconDots,
    IconExternalLink,
    IconFolderPlus,
    IconFolderSymlink,
    IconPencil,
    IconLayoutDashboard,
    IconPlayerStop,
    IconSparkles,
    IconTrash,
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
import {
    Link,
    Navigate,
    useLocation,
    useNavigate,
    useParams,
} from 'react-router';
import { v4 as uuid4 } from 'uuid';
import AppDeleteModal from '../components/common/modal/AppDeleteModal';
import AppUpdateModal from '../components/common/modal/AppUpdateModal';
import { ChartIcon, IconBox } from '../components/common/ResourceIcon';
import SuboptimalState from '../components/common/SuboptimalState/SuboptimalState';
import TransferItemsModal from '../components/common/TransferItemsModal/TransferItemsModal';
import AppIframePreview from '../features/apps/AppIframePreview';
import {
    DashboardButton,
    ImageButton,
    QueryButton,
    SelectedDashboardSection,
    SelectedImageSection,
    SelectedQuerySection,
    type SelectedChart,
    type SelectedDashboard,
} from '../features/apps/AppResourcePicker';
import AppTemplatePicker from '../features/apps/AppTemplatePicker';
import AppTemplateQuestions from '../features/apps/AppTemplateQuestions';
import { useAppBuildPoller } from '../features/apps/hooks/useAppBuildPoller';
import { useAppImageUpload } from '../features/apps/hooks/useAppImageUpload';
import { useAppImageUrl } from '../features/apps/hooks/useAppImageUrl';
import { useAppPreviewToken } from '../features/apps/hooks/useAppPreviewToken';
import type { QueryEvent } from '../features/apps/hooks/useAppSdkBridge';
import { useBuildNotification } from '../features/apps/hooks/useBuildNotification';
import { useCancelAppVersion } from '../features/apps/hooks/useCancelAppVersion';
import { useGenerateApp } from '../features/apps/hooks/useGenerateApp';
import { useGetApp } from '../features/apps/hooks/useGetApp';
import { useIterateApp } from '../features/apps/hooks/useIterateApp';
import QueryInspector from '../features/apps/QueryInspector';
import { getTemplate } from '../features/apps/templates';
import { useContentAction } from '../hooks/useContent';
import { useServerFeatureFlag } from '../hooks/useServerOrClientFeatureFlag';
import { useSpaceSummaries } from '../hooks/useSpaces';
import { useAbilityContext } from '../providers/Ability/useAbilityContext';
import useApp from '../providers/App/useApp';
import classes from './AppGenerate.module.css';

type ChatChart = {
    name: string;
    uuid: string;
    chartKind?: ChartKind;
};

type ChatMessage = {
    role: 'user' | 'assistant';
    content: string;
    imagePreviewUrl: string | null;
    imageResourceId: string | null;
    charts: ChatChart[];
    dashboardName: string | null;
    appUuid: string | null;
    version: number | null;
};

const AppResourceImage: FC<{
    projectUuid: string;
    appUuid: string;
    imageId: string;
    className?: string;
}> = ({ projectUuid, appUuid, imageId, className }) => {
    const { data } = useAppImageUrl(projectUuid, appUuid, imageId);
    if (!data?.imageUrl) return null;
    return <Image src={data.imageUrl} className={className} alt="Attached" />;
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
    const location = useLocation();
    const queryClient = useQueryClient();
    const [prompt, setPrompt] = useState('');
    // Starter-template wizard state (only meaningful for v1 of a new app).
    // 'pick'      → show the 4 template cards (replaces the empty state)
    // 'questions' → show clarifying-questions form for the selected template
    // 'confirm'   → wizard collapses; user reviews/edits the prefilled prompt
    //               in the existing textarea and submits as normal.
    const [selectedTemplate, setSelectedTemplate] =
        useState<DataAppTemplate | null>(null);
    const [templateAnswers, setTemplateAnswers] = useState<
        Record<string, string>
    >({});
    const [wizardStage, setWizardStage] = useState<
        'pick' | 'questions' | 'confirm'
    >('pick');
    const [imageAttachment, setImageAttachment] = useState<{
        file: File;
        previewUrl: string;
    } | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [selectedCharts, setSelectedCharts] = useState<SelectedChart[]>([]);
    const [selectedDashboard, setSelectedDashboard] =
        useState<SelectedDashboard | null>(null);
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
    // Maps prompt text → dashboard name so it survives the local→server transition
    const sentDashboardByPrompt = useRef(new Map<string, string>());
    // Track appUuid in local state so polling starts immediately after creation
    // (before the URL param updates via replaceState)
    const [activeAppUuid, setActiveAppUuid] = useState<string | undefined>(
        urlAppUuid,
    );
    // Track the previous app UUID so we can detect intentional navigation
    // vs. the post-submit URL update (undefined → newUuid).
    const prevUrlAppUuid = useRef(urlAppUuid);
    const resetSessionState = useCallback(() => {
        setPrompt('');
        setSelectedCharts([]);
        setSelectedDashboard(null);
        setImageAttachment(null);
        setLocalMessages([]);
        setPreviewApp(null);
        setTrackedQueries([]);
        setSelectedTemplate(null);
        setTemplateAnswers({});
        setWizardStage('pick');
        versionCacheRef.current.clear();
        versionCacheAppRef.current = undefined;
        sentImagesByPrompt.current.forEach((url) => URL.revokeObjectURL(url));
        sentImagesByPrompt.current.clear();
    }, []);
    useEffect(() => {
        const prev = prevUrlAppUuid.current;
        prevUrlAppUuid.current = urlAppUuid;
        setActiveAppUuid(urlAppUuid);

        // Post-submit redirect: undefined → new uuid. Don't clear state.
        if (!prev && urlAppUuid) return;

        // Intentional navigation: switching apps, or going to "new app" mode.
        resetSessionState();
    }, [urlAppUuid, location.key, resetSessionState]);
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
        error: appError,
        isLoading: isLoadingApp,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
    } = useGetApp(projectUuid, activeAppUuid ?? urlAppUuid);

    // Derive app name/description/space/creator from fetched data
    const appName = appData?.pages?.[0]?.name ?? '';
    const appDescription = appData?.pages?.[0]?.description ?? '';
    const appSpaceUuid = appData?.pages?.[0]?.spaceUuid ?? null;
    const appCreatedByUserUuid = appData?.pages?.[0]?.createdByUserUuid ?? null;

    // Used to resolve the user's space role when checking manage rights for
    // an existing app — space editors/admins inherit manage on its data app.
    const { data: spaces = [] } = useSpaceSummaries(projectUuid, true, {});

    const [isMoveToSpaceOpen, setIsMoveToSpaceOpen] = useState(false);
    const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const { mutateAsync: contentAction, isLoading: isMovingToSpace } =
        useContentAction(projectUuid);

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
            // Prefer server-side resources; fall back to session refs
            const serverCharts: ChatChart[] =
                v.resources?.charts.map((c) => ({
                    name: c.chartName,
                    uuid: c.chartUuid,
                    chartKind: undefined,
                })) ?? [];
            const charts =
                serverCharts.length > 0
                    ? serverCharts
                    : (sentChartsByPrompt.current.get(v.prompt) ?? []);
            const imageResourceId = v.resources?.images[0]?.imageId ?? null;
            const imagePreviewUrl =
                sentImagesByPrompt.current.get(v.prompt) ?? null;
            const dashboardName =
                v.resources?.dashboardName ??
                sentDashboardByPrompt.current.get(v.prompt) ??
                null;
            const msgs: ChatMessage[] = [
                {
                    role: 'user',
                    content: v.prompt,
                    imagePreviewUrl,
                    imageResourceId,
                    charts,
                    dashboardName,
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
                    imageResourceId: null,
                    charts: [],
                    dashboardName: null,
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
                    imageResourceId: null,
                    charts: [],
                    dashboardName: null,
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

    // The starter-template wizard only shows for v1 of a brand-new app -
    // before the URL has an appUuid and before any messages exist.
    const isNewApp = !urlAppUuid && !activeAppUuid;
    // While the wizard is in pick/questions, the chat input area is hidden
    // - the wizard's own buttons drive the flow. When stage='confirm', the
    // input area reappears with the composed prompt prefilled for the user
    // to review and edit before submitting.
    const wizardCoversInput =
        isNewApp &&
        messages.length === 0 &&
        !isLoading &&
        wizardStage !== 'confirm';

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

    // Two paths: creating a brand-new app (no urlAppUuid) → check `create`;
    // editing an existing one → check `manage` with the app's space access
    // and creator context (so space editors and the creator of a personal
    // app both match).
    // Wait for the app to load before deciding the existing-app case —
    // without spaceUuid + createdByUserUuid we'd misjudge a non-admin user.
    if (urlAppUuid && isLoadingApp) {
        return null;
    }
    const userSpaceAccess = appSpaceUuid
        ? spaces.find((s) => s.uuid === appSpaceUuid)?.userAccess
        : undefined;
    const canAccessApp = urlAppUuid
        ? ability.can(
              'manage',
              subject('DataApp', {
                  organizationUuid: user.data?.organizationUuid,
                  projectUuid,
                  access: userSpaceAccess ? [userSpaceAccess] : [],
                  createdByUserUuid: appCreatedByUserUuid,
              }),
          )
        : ability.can(
              'create',
              subject('DataApp', {
                  organizationUuid: user.data?.organizationUuid,
                  projectUuid,
              }),
          );
    if (!canAccessApp) {
        return <Navigate to={`/projects/${projectUuid}/home`} replace />;
    }

    // Navigating to a soft-deleted (or never-existed) app's URL. Surface a
    // not-found state instead of silently falling through to new-app mode —
    // otherwise a follow-up prompt would try to iterate a ghost app.
    if (urlAppUuid && appError?.error?.statusCode === 404) {
        return (
            <Box mt="30vh">
                <SuboptimalState
                    icon={IconAppsOff}
                    title="Data app not found"
                    description="This data app doesn't exist or has been deleted."
                />
            </Box>
        );
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

        // Send structured chart refs (uuid + per-chart sample-data opt-in).
        // The backend resolves these server-side so the client never sees
        // chart configs or rows.
        const charts =
            selectedCharts.length > 0
                ? selectedCharts.map((c) => ({
                      uuid: c.uuid,
                      includeSampleData: c.includeSampleData,
                  }))
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
            chartKind: c.chartKind,
        }));
        if (sentCharts.length > 0) {
            sentChartsByPrompt.current.set(trimmed, sentCharts);
        }
        const sentDashboardName = selectedDashboard?.name ?? null;
        if (sentDashboardName) {
            sentDashboardByPrompt.current.set(trimmed, sentDashboardName);
        }

        const dashboard = selectedDashboard
            ? {
                  uuid: selectedDashboard.uuid,
                  includeSampleData: selectedDashboard.includeSampleData,
              }
            : undefined;

        setLocalMessages((prev) => [
            ...prev,
            {
                role: 'user',
                content: trimmed,
                imagePreviewUrl: sentImageUrl,
                imageResourceId: null,
                charts: sentCharts,
                dashboardName: sentDashboardName,
                appUuid: null,
                version: null,
            },
        ]);
        setPrompt('');
        setImageAttachment(null);
        setSelectedCharts([]);
        setSelectedDashboard(null);
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
                        imageResourceId: null,
                        charts: [],
                        dashboardName: null,
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
                    charts,
                    dashboard,
                },
                callbacks,
            );
        } else {
            generateMutate(
                {
                    projectUuid,
                    prompt: trimmed,
                    template: selectedTemplate ?? undefined,
                    imageId,
                    appUuid: newAppUuid,
                    charts,
                    dashboard,
                },
                callbacks,
            );
        }
    };

    const handleTemplateSelect = (template: DataAppTemplate) => {
        setSelectedTemplate(template);
        setTemplateAnswers({});
        if (template === 'custom') {
            // Skip clarifying questions - drop straight into the existing
            // free-text input area.
            setWizardStage('confirm');
            setPrompt('');
            return;
        }
        setWizardStage('questions');
    };

    const handleTemplateBack = () => {
        setWizardStage('pick');
        setTemplateAnswers({});
    };

    const handleTemplateContinue = () => {
        if (!selectedTemplate) return;
        const composed =
            getTemplate(selectedTemplate).composePrompt(templateAnswers);
        setPrompt(composed);
        setWizardStage('confirm');
        // Move focus to the textarea so the user can immediately tweak the
        // composed prompt before sending.
        setTimeout(() => textareaRef.current?.focus(), 0);
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
                                isNewApp && wizardStage === 'pick' ? (
                                    <AppTemplatePicker
                                        onSelect={handleTemplateSelect}
                                    />
                                ) : isNewApp &&
                                  wizardStage === 'questions' &&
                                  selectedTemplate ? (
                                    <AppTemplateQuestions
                                        template={getTemplate(selectedTemplate)}
                                        answers={templateAnswers}
                                        onAnswersChange={setTemplateAnswers}
                                        onBack={handleTemplateBack}
                                        onContinue={handleTemplateContinue}
                                    />
                                ) : (
                                    <Box className={classes.emptyChat}>
                                        <ThemeIcon
                                            size="xl"
                                            radius="xl"
                                            variant="light"
                                            color="gray"
                                        >
                                            <IconSparkles size={24} />
                                        </ThemeIcon>
                                        <Text fw={600} size="lg">
                                            Build a data app
                                        </Text>
                                        <Text size="sm" c="dimmed" maw={280}>
                                            Describe what you want to build and
                                            I'll generate a data app connected
                                            to your project.
                                        </Text>
                                    </Box>
                                )
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
                                                        <Box
                                                            mt="xs"
                                                            className={
                                                                classes.bubbleQueryList
                                                            }
                                                        >
                                                            {msg.charts.map(
                                                                (chart) => (
                                                                    <Group
                                                                        key={
                                                                            chart.uuid
                                                                        }
                                                                        gap="xs"
                                                                        wrap="nowrap"
                                                                        className={
                                                                            classes.bubbleQueryItem
                                                                        }
                                                                    >
                                                                        <ChartIcon
                                                                            chartKind={
                                                                                chart.chartKind ??
                                                                                ChartKind.VERTICAL_BAR
                                                                            }
                                                                        />
                                                                        <Text
                                                                            size="xs"
                                                                            fw={
                                                                                500
                                                                            }
                                                                            truncate
                                                                        >
                                                                            {
                                                                                chart.name
                                                                            }
                                                                        </Text>
                                                                    </Group>
                                                                ),
                                                            )}
                                                        </Box>
                                                    )}
                                                    {msg.dashboardName && (
                                                        <Box
                                                            mt="xs"
                                                            className={
                                                                classes.bubbleQueryList
                                                            }
                                                        >
                                                            <Group
                                                                gap="xs"
                                                                wrap="nowrap"
                                                                className={
                                                                    classes.bubbleQueryItem
                                                                }
                                                            >
                                                                <IconBox
                                                                    icon={
                                                                        IconLayoutDashboard
                                                                    }
                                                                    color="green.6"
                                                                />
                                                                <Text
                                                                    size="xs"
                                                                    fw={500}
                                                                    truncate
                                                                >
                                                                    {
                                                                        msg.dashboardName
                                                                    }
                                                                </Text>
                                                            </Group>
                                                        </Box>
                                                    )}
                                                    {msg.imagePreviewUrl ? (
                                                        <Image
                                                            src={
                                                                msg.imagePreviewUrl
                                                            }
                                                            className={
                                                                classes.sentImageThumbnail
                                                            }
                                                            alt="Attached"
                                                        />
                                                    ) : (
                                                        msg.imageResourceId &&
                                                        activeAppUuid &&
                                                        projectUuid && (
                                                            <AppResourceImage
                                                                projectUuid={
                                                                    projectUuid
                                                                }
                                                                appUuid={
                                                                    activeAppUuid
                                                                }
                                                                imageId={
                                                                    msg.imageResourceId
                                                                }
                                                                className={
                                                                    classes.sentImageThumbnail
                                                                }
                                                            />
                                                        )
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
                                                    color="gray"
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
                                                color="gray"
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
                        {!wizardCoversInput && (
                            <Box className={classes.chatInputArea}>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/png,image/jpeg,image/gif,image/webp"
                                    onChange={handleFileInputChange}
                                    hidden
                                />
                                <Box className={classes.inputWrapper}>
                                    <Box className={classes.textareaColumn}>
                                        <Textarea
                                            ref={textareaRef}
                                            placeholder="Describe the app you want to build..."
                                            autosize
                                            autoFocus
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
                                                wrapper:
                                                    classes.textareaWrapper,
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
                                    )}
                                </Box>
                                <Group gap="xs" pt="xs">
                                    <QueryButton
                                        selectedCharts={selectedCharts}
                                        onSelect={(chart) =>
                                            setSelectedCharts((prev) => [
                                                ...prev,
                                                chart,
                                            ])
                                        }
                                        disabled={isLoading}
                                    />
                                    <DashboardButton
                                        selected={selectedDashboard}
                                        onSelect={setSelectedDashboard}
                                        disabled={isLoading}
                                    />
                                    <ImageButton
                                        onClick={() =>
                                            fileInputRef.current?.click()
                                        }
                                        disabled={
                                            isLoading || !!imageAttachment
                                        }
                                    />
                                </Group>
                                <Box
                                    className={classes.resourceSections}
                                    onDragOver={handleDragOver}
                                    onDrop={handleDrop}
                                >
                                    {selectedCharts.length > 0 ||
                                    selectedDashboard ||
                                    imageAttachment ? (
                                        <>
                                            {selectedCharts.length > 0 && (
                                                <SelectedQuerySection
                                                    charts={selectedCharts}
                                                    onRemove={(uuid) =>
                                                        setSelectedCharts(
                                                            (prev) =>
                                                                prev.filter(
                                                                    (c) =>
                                                                        c.uuid !==
                                                                        uuid,
                                                                ),
                                                        )
                                                    }
                                                    onToggleSampleData={(
                                                        uuid,
                                                    ) =>
                                                        setSelectedCharts(
                                                            (prev) =>
                                                                prev.map((c) =>
                                                                    c.uuid ===
                                                                    uuid
                                                                        ? {
                                                                              ...c,
                                                                              includeSampleData:
                                                                                  !c.includeSampleData,
                                                                          }
                                                                        : c,
                                                                ),
                                                        )
                                                    }
                                                />
                                            )}
                                            {selectedDashboard && (
                                                <SelectedDashboardSection
                                                    dashboard={
                                                        selectedDashboard
                                                    }
                                                    onRemove={() =>
                                                        setSelectedDashboard(
                                                            null,
                                                        )
                                                    }
                                                    onToggleSampleData={() =>
                                                        setSelectedDashboard(
                                                            (prev) =>
                                                                prev
                                                                    ? {
                                                                          ...prev,
                                                                          includeSampleData:
                                                                              !prev.includeSampleData,
                                                                      }
                                                                    : null,
                                                        )
                                                    }
                                                />
                                            )}
                                            {imageAttachment && (
                                                <SelectedImageSection
                                                    images={[
                                                        {
                                                            previewUrl:
                                                                imageAttachment.previewUrl,
                                                        },
                                                    ]}
                                                    onRemove={() =>
                                                        clearImage()
                                                    }
                                                />
                                            )}
                                        </>
                                    ) : (
                                        <Box className={classes.resourceEmpty}>
                                            <Text size="xs" c="dimmed">
                                                Resources
                                            </Text>
                                        </Box>
                                    )}
                                </Box>
                            </Box>
                        )}
                    </Box>
                </Panel>

                <PanelResizeHandle className={classes.resizeHandle} />

                {/* Preview Panel */}
                <Panel minSize={40}>
                    <Box className={classes.previewPanel}>
                        {activeAppUuid && (
                            <Box className={classes.previewHeader}>
                                <Box className={classes.previewHeaderInfo}>
                                    <Title order={6} fw={600} lineClamp={1}>
                                        {appName || 'Untitled app'}
                                    </Title>
                                    {appDescription && (
                                        <Text
                                            size="xs"
                                            c="dimmed"
                                            lineClamp={1}
                                        >
                                            {appDescription}
                                        </Text>
                                    )}
                                </Box>
                                <Menu
                                    position="bottom-end"
                                    shadow="md"
                                    withinPortal
                                    withArrow
                                    arrowPosition="center"
                                >
                                    <Menu.Target>
                                        <ActionIcon
                                            variant="subtle"
                                            size="sm"
                                            color="ldGray.6"
                                            ml="auto"
                                            aria-label="App actions"
                                        >
                                            <IconDots size={16} />
                                        </ActionIcon>
                                    </Menu.Target>
                                    <Menu.Dropdown>
                                        {previewApp && (
                                            <Menu.Item
                                                component={Link}
                                                to={`/projects/${projectUuid}/apps/${previewApp.appUuid}/preview`}
                                                target="_blank"
                                                leftSection={
                                                    <IconExternalLink
                                                        size={14}
                                                    />
                                                }
                                            >
                                                Preview latest
                                            </Menu.Item>
                                        )}
                                        {previewApp && <Menu.Divider />}
                                        <Menu.Item
                                            leftSection={
                                                <IconPencil size={14} />
                                            }
                                            onClick={() =>
                                                setIsUpdateModalOpen(true)
                                            }
                                        >
                                            Rename
                                        </Menu.Item>
                                        <Menu.Item
                                            leftSection={
                                                appSpaceUuid ? (
                                                    <IconFolderSymlink
                                                        size={14}
                                                    />
                                                ) : (
                                                    <IconFolderPlus size={14} />
                                                )
                                            }
                                            onClick={() =>
                                                setIsMoveToSpaceOpen(true)
                                            }
                                        >
                                            {appSpaceUuid
                                                ? 'Move to space'
                                                : 'Add to space'}
                                        </Menu.Item>
                                        <Menu.Divider />
                                        <Menu.Item
                                            color="red"
                                            leftSection={
                                                <IconTrash size={14} />
                                            }
                                            onClick={() =>
                                                setIsDeleteModalOpen(true)
                                            }
                                        >
                                            Delete
                                        </Menu.Item>
                                    </Menu.Dropdown>
                                </Menu>
                            </Box>
                        )}
                        {isMoveToSpaceOpen && activeAppUuid && (
                            <TransferItemsModal
                                projectUuid={projectUuid}
                                opened
                                onClose={() => setIsMoveToSpaceOpen(false)}
                                items={[
                                    {
                                        type: ResourceViewItemType.DATA_APP,
                                        data: {
                                            uuid: activeAppUuid,
                                            name: appName,
                                            description:
                                                appDescription || undefined,
                                            spaceUuid: appSpaceUuid,
                                            createdByUserUuid:
                                                appCreatedByUserUuid,
                                            updatedAt: new Date(),
                                            updatedByUser: null,
                                            views: 0,
                                            firstViewedAt: null,
                                            latestVersionNumber: null,
                                            latestVersionStatus: null,
                                            pinnedListUuid: null,
                                            pinnedListOrder: null,
                                        },
                                    },
                                ]}
                                isLoading={isMovingToSpace}
                                onConfirm={async (targetSpaceUuid) => {
                                    if (!targetSpaceUuid) return;
                                    await contentAction({
                                        action: {
                                            type: 'move',
                                            targetSpaceUuid,
                                        },
                                        item: {
                                            uuid: activeAppUuid,
                                            contentType: ContentType.DATA_APP,
                                        },
                                    });
                                    await queryClient.invalidateQueries({
                                        queryKey: [
                                            'app',
                                            projectUuid,
                                            activeAppUuid,
                                        ],
                                    });
                                    setIsMoveToSpaceOpen(false);
                                }}
                            />
                        )}
                        {isUpdateModalOpen && activeAppUuid && (
                            <AppUpdateModal
                                opened
                                projectUuid={projectUuid}
                                uuid={activeAppUuid}
                                initialName={appName}
                                initialDescription={appDescription}
                                onClose={() => setIsUpdateModalOpen(false)}
                                onConfirm={() => setIsUpdateModalOpen(false)}
                            />
                        )}
                        {isDeleteModalOpen && activeAppUuid && (
                            <AppDeleteModal
                                opened
                                projectUuid={projectUuid}
                                uuid={activeAppUuid}
                                name={appName}
                                onClose={() => setIsDeleteModalOpen(false)}
                                onConfirm={() => {
                                    setIsDeleteModalOpen(false);
                                    void navigate(
                                        `/projects/${projectUuid}/apps/generate`,
                                    );
                                }}
                            />
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
