import { subject } from '@casl/ability';
import {
    ChartKind,
    ContentType,
    FeatureFlags,
    isAppVersionInProgress,
    ResourceViewItemType,
    type ApiAppVersionSummary,
    type AppChartReference,
    type AppClarification,
    type AppDashboardReference,
    type DataAppTemplate,
} from '@lightdash/common';
import {
    ActionIcon,
    Badge,
    Box,
    Button,
    Group,
    Image,
    Loader,
    Menu,
    Stack,
    Text,
    Textarea,
    ThemeIcon,
    Title,
    Tooltip,
} from '@mantine-8/core';
import { useLocalStorage } from '@mantine-8/hooks';
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
    IconRefresh,
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
import MantineIcon from '../components/common/MantineIcon';
import AppDeleteModal from '../components/common/modal/AppDeleteModal';
import AppUpdateModal from '../components/common/modal/AppUpdateModal';
import { ChartIcon, IconBox } from '../components/common/ResourceIcon';
import SuboptimalState from '../components/common/SuboptimalState/SuboptimalState';
import TransferItemsModal from '../components/common/TransferItemsModal/TransferItemsModal';
import AppIframePreview from '../features/apps/AppIframePreview';
import AppPromptEditor, {
    type AppPromptEditorHandle,
    type ElementRef,
} from '../features/apps/AppPromptEditor';
import {
    DashboardButton,
    ImageButton,
    InspectButton,
    QueryButton,
    SelectedDashboardSection,
    SelectedImageSection,
    SelectedQuerySection,
    type SelectedChart,
    type SelectedDashboard,
} from '../features/apps/AppResourcePicker';
import AppTemplatePicker from '../features/apps/AppTemplatePicker';
import ChatMessageContent from '../features/apps/ChatMessageContent';
import { useAppBuildPoller } from '../features/apps/hooks/useAppBuildPoller';
import { useAppImageUpload } from '../features/apps/hooks/useAppImageUpload';
import { useAppImageUrl } from '../features/apps/hooks/useAppImageUrl';
import { useAppPreviewToken } from '../features/apps/hooks/useAppPreviewToken';
import type { QueryEvent } from '../features/apps/hooks/useAppSdkBridge';
import { useBuildNotification } from '../features/apps/hooks/useBuildNotification';
import { useCancelAppVersion } from '../features/apps/hooks/useCancelAppVersion';
import { useClarifyApp } from '../features/apps/hooks/useClarifyApp';
import { useGenerateApp } from '../features/apps/hooks/useGenerateApp';
import { useGetApp } from '../features/apps/hooks/useGetApp';
import { useIterateApp } from '../features/apps/hooks/useIterateApp';
import { usePreviewOrigin } from '../features/apps/previewOrigin';
import QueryInspector from '../features/apps/QueryInspector';
import { getTemplate } from '../features/apps/templates';
import useToaster from '../hooks/toaster/useToaster';
import { useContentAction } from '../hooks/useContent';
import { useServerFeatureFlag } from '../hooks/useServerOrClientFeatureFlag';
import { useSpaceSummaries } from '../hooks/useSpaces';
import { useAbilityContext } from '../providers/Ability/useAbilityContext';
import useApp from '../providers/App/useApp';
import classes from './AppGenerate.module.css';

const PERSIST_LOGS_STORAGE_KEY = 'data-apps:persist-logs';

/**
 * Parse `[tag "text" @loc]` (or `[tag @loc]`, `[tag "text"]`, `[tag]`) from
 * the iframe inspector's `lightdash:inspect:selected` payload into the
 * structured attrs the editor's mention node expects. Returns null if the
 * label doesn't match the expected shape — defensive against future SDK
 * versions that might emit a different format.
 */
function parseElementRefLabel(label: string): ElementRef | null {
    // Loc allows any char except `]` (which terminates the reference) so
    // paths with spaces (e.g. `My Component/App.tsx:42`) round-trip cleanly.
    const m =
        /^\[([A-Za-z][A-Za-z0-9-]*)(?:\s+"([^"]*)")?(?:\s+@([^\]]+))?\]$/.exec(
            label,
        );
    if (!m) return null;
    return { tag: m[1] ?? '', text: m[2] ?? '', loc: m[3] ?? '' };
}

type ChatChart = {
    name: string;
    uuid: string;
    chartKind?: ChartKind;
};

type ChatMessage = {
    role: 'user' | 'assistant';
    content: string;
    imagePreviewUrls: string[];
    imageResourceIds: string[];
    charts: ChatChart[];
    dashboardName: string | null;
    clarifications: AppClarification[];
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
    /** Bumping this re-mounts the iframe URL to force a reload (and a
     *  re-run of the app's metric queries). Same version → identical app
     *  bundle, but the new query string defeats any caching and flushes
     *  whatever in-iframe state was running. */
    refreshKey: number;
    onQueryEvent?: (event: QueryEvent) => void;
    inspectorEnabled?: boolean;
    onElementSelected?: (event: { label: string }) => void;
    onInspectorAvailabilityChange?: (available: boolean) => void;
    onInspectorCancelled?: () => void;
}> = ({
    projectUuid,
    appUuid,
    version,
    refreshKey,
    onQueryEvent,
    inspectorEnabled,
    onElementSelected,
    onInspectorAvailabilityChange,
    onInspectorCancelled,
}) => {
    const {
        data: token,
        isLoading,
        error,
    } = useAppPreviewToken(projectUuid, appUuid, version);

    const previewOrigin = usePreviewOrigin();
    const previewUrl = token
        ? `${previewOrigin}/api/apps/${appUuid}/versions/${version}/?token=${token}&r=${refreshKey}#transport=postMessage&projectUuid=${projectUuid}`
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

    return (
        <AppIframePreview
            src={previewUrl}
            expectedPreviewOrigin={previewOrigin}
            identityKey={`${appUuid}:${version}`}
            onQueryEvent={onQueryEvent}
            inspectorEnabled={inspectorEnabled}
            onElementSelected={onElementSelected}
            onInspectorAvailabilityChange={onInspectorAvailabilityChange}
            onInspectorCancelled={onInspectorCancelled}
        />
    );
};

const LoadingDots: FC = () => (
    <span className={classes.loadingDots}>
        <span className={classes.loadingDot} />
        <span className={classes.loadingDot} />
        <span className={classes.loadingDot} />
    </span>
);

const TemplateChip: FC<{ template: DataAppTemplate }> = ({ template }) => {
    const t = getTemplate(template);
    return (
        <Group gap="xs" pb="xs">
            <Badge
                variant="light"
                color="gray"
                size="md"
                leftSection={<MantineIcon icon={t.icon} size={12} />}
            >
                {t.title}
            </Badge>
        </Group>
    );
};

const AppGenerate: FC = () => {
    const { projectUuid, appUuid: urlAppUuid } = useParams<{
        projectUuid: string;
        appUuid: string;
    }>();
    const navigate = useNavigate();
    const location = useLocation();
    const queryClient = useQueryClient();
    // When the user lands here from a space's "+ Add" menu we get
    // ?spaceUuid=<uuid> on the URL. We only honour it for first-time creation
    // (urlAppUuid undefined) — once we're editing an existing app the space
    // assignment is already on the app row and this query param is ignored.
    const targetSpaceUuid = useMemo(() => {
        if (urlAppUuid) return undefined;
        const value = new URLSearchParams(location.search).get('spaceUuid');
        return value ?? undefined;
    }, [urlAppUuid, location.search]);
    // Editor handle (TipTap-based) — replaces the previous controlled
    // textarea + `prompt` state. The editor owns its content; the parent
    // reads on submit via `getText()` and tracks emptiness via the
    // `onEmptyChange` callback for the submit button's disabled state.
    const promptEditorRef = useRef<AppPromptEditorHandle | null>(null);
    const [isPromptEmpty, setIsPromptEmpty] = useState(true);
    // Synchronous lock for `handleSubmit`. The mutation's `isLoading` only
    // flips true after the upload + clarify awaits resolve, leaving a
    // multi-second window where Enter / send-button re-entry would fire
    // duplicate iterations against the same app.
    const isSubmittingRef = useRef(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    // Starter-template wizard state (only meaningful for v1 of a new app).
    // 'pick'    → show the 4 template cards (replaces the empty state)
    // 'confirm' → wizard collapses; the textarea takes over. Picking any
    //             template lands here directly — clarifying questions
    //             are now produced by the AI clarifier on submit, so the
    //             wizard no longer asks any questions of its own.
    const [selectedTemplate, setSelectedTemplate] =
        useState<DataAppTemplate | null>(null);
    const [wizardStage, setWizardStage] = useState<'pick' | 'confirm'>('pick');
    const [imageAttachments, setImageAttachments] = useState<
        Array<{
            file: File;
            previewUrl: string;
        }>
    >([]);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const MAX_IMAGES_PER_VERSION = 4;
    const [selectedCharts, setSelectedCharts] = useState<SelectedChart[]>([]);
    const [selectedDashboard, setSelectedDashboard] =
        useState<SelectedDashboard | null>(null);
    // Click-to-edit ("Inspect") mode. While on, the iframe overlays a hover
    // outline and intercepts clicks; each click inserts an element-reference
    // pill at the editor cursor so the user can compose targeted edits.
    // Stays on across multiple clicks; the user toggles off when done.
    const [inspectorEnabled, setInspectorEnabled] = useState(false);
    // Capability flag — flipped to true when the iframe SDK announces the
    // inspector. Existing apps in resumed sandboxes may have an older SDK
    // that never announces, in which case the toggle stays hidden.
    const [inspectorAvailable, setInspectorAvailable] = useState(false);
    const [trackedQueries, setTrackedQueries] = useState<QueryEvent[]>([]);
    // Mirrors Chrome DevTools "Preserve log". When off (default), the queries
    // panel is cleared on iframe refresh and on new-version load — fresh
    // bundles re-run their queries, so stale entries would only confuse the
    // user. Stored in localStorage so the preference survives a tab close
    // and stays consistent across tabs.
    const [persistLogs, setPersistLogs] = useLocalStorage<boolean>({
        key: PERSIST_LOGS_STORAGE_KEY,
        defaultValue: false,
    });
    // Request IDs of queries we marked as interrupted on iframe reload. The
    // bridge's parent-side fetch keeps running after the iframe dies and will
    // emit a late `running` event for them — without this guard that event
    // would resurrect the entry as 'running', or (if not matched) get appended
    // as a fresh ghost entry. The set grows for the page session; entries are
    // short request IDs, so the footprint is negligible.
    const interruptedRequestIdsRef = useRef<Set<string>>(new Set());
    const handleClearQueries = useCallback(() => {
        setTrackedQueries([]);
    }, []);
    // Move pending/running entries into a terminal `error` state. Used when
    // the preview iframe reloads with persistLogs on — the iframe that would
    // have polled their queryUuids is dead, so they would otherwise sit
    // non-terminal forever.
    const interruptInFlightQueries = useCallback(() => {
        setTrackedQueries((prev) => {
            let mutated = false;
            const next = prev.map((q) => {
                if (q.status !== 'pending' && q.status !== 'running') {
                    return q;
                }
                mutated = true;
                interruptedRequestIdsRef.current.add(q.id);
                return {
                    ...q,
                    status: 'error' as const,
                    error: 'Interrupted by reload',
                };
            });
            return mutated ? next : prev;
        });
    }, []);
    const handleElementSelected = useCallback((event: { label: string }) => {
        const ref = parseElementRefLabel(event.label);
        if (!ref) {
            console.warn(
                '[apps] Ignoring unrecognized inspector label:',
                event.label,
            );
            return;
        }
        promptEditorRef.current?.insertElementRef(ref);
    }, []);
    // Stable so AppIframePreview's keydown listener doesn't re-attach on
    // every render of this page.
    const handleInspectorCancelled = useCallback(() => {
        setInspectorEnabled(false);
    }, []);
    const handleQueryEvent = useCallback((event: QueryEvent) => {
        // Drop late events (typically the POST-resolution `running` event)
        // for requests we already marked interrupted — without this they
        // either un-terminal the entry or get appended as a ghost.
        if (interruptedRequestIdsRef.current.has(event.id)) {
            return;
        }
        setTrackedQueries((prev) => {
            // If this event has a queryUuid, merge it with an existing entry
            if (event.queryUuid) {
                const existing = prev.find(
                    (q) => q.queryUuid === event.queryUuid,
                );
                if (existing) {
                    // Don't resurrect a terminal entry. Covers the rare race
                    // where iframe-1 managed to issue a poll GET before
                    // dying, so a late `ready` event arrives keyed on the
                    // (already-interrupted) queryUuid.
                    if (
                        existing.status === 'ready' ||
                        existing.status === 'error'
                    ) {
                        return prev;
                    }
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
    // Pre-build clarification round: captured submission args that we need
    // to fire the actual generate call once the user answers the questions.
    // Non-null only between "user submitted prompt" and "user clicked Build
    // on the questions bubble". Always cleared once generate fires.
    const [pendingClarification, setPendingClarification] = useState<{
        questions: string[];
        prompt: string;
        template: DataAppTemplate | undefined;
        imageIds: string[] | undefined;
        appUuid: string;
        charts: AppChartReference[] | undefined;
        dashboard: AppDashboardReference | undefined;
        spaceUuid: string | undefined;
    } | null>(null);
    const [clarificationAnswers, setClarificationAnswers] = useState<string[]>(
        [],
    );
    // Maps prompt text → image preview URL so the thumbnail survives the
    // local→server message transition (localMessages get cleared when server
    // version data arrives, but the ref persists).
    const sentImagesByPrompt = useRef(new Map<string, string[]>());
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
        promptEditorRef.current?.clear();
        setIsPromptEmpty(true);
        setSelectedCharts([]);
        setSelectedDashboard(null);
        setImageAttachments([]);
        setLocalMessages([]);
        setPreviewApp(null);
        setTrackedQueries([]);
        setInspectorEnabled(false);
        setInspectorAvailable(false);
        setSelectedTemplate(null);
        setWizardStage('pick');
        setPendingClarification(null);
        setClarificationAnswers([]);
        versionCacheRef.current.clear();
        versionCacheAppRef.current = undefined;
        sentImagesByPrompt.current.forEach((urls) =>
            urls.forEach((url) => URL.revokeObjectURL(url)),
        );
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
    const { mutateAsync: clarifyMutateAsync, isLoading: isClarifying } =
        useClarifyApp();
    const { mutate: cancelMutate, isLoading: isCancelling } =
        useCancelAppVersion();
    const { mutateAsync: uploadImage } = useAppImageUpload();
    const { showToastError, showToastWarning } = useToaster();
    const dataAppsFlag = useServerFeatureFlag(FeatureFlags.EnableDataApps);
    const { user } = useApp();
    const ability = useAbilityContext();
    const messagesEndRef = useRef<HTMLDivElement>(null);

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
    const appPersistedTemplate = appData?.pages?.[0]?.template ?? null;

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
    // Clarifying counts as loading for the chat input (disable typing/send),
    // and a pending unanswered clarification keeps the input area disabled
    // until the user clicks "Build" on the question bubble.
    const hasPendingClarification = pendingClarification !== null;
    // Server-side work that warrants showing a placeholder assistant bubble.
    // Excludes `isSubmitting` (client-side upload — too early to claim
    // generation has started) and `hasPendingClarification` (drives its own
    // question UI, not a placeholder).
    const isAgentWorking =
        isGenerating || isIterating || isBuilding || isClarifying;
    const isLoading = isSubmitting || isAgentWorking || hasPendingClarification;

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
            const imageResourceIds =
                v.resources?.images.map((img) => img.imageId) ?? [];
            const imagePreviewUrls =
                sentImagesByPrompt.current.get(v.prompt) ?? [];
            const dashboardName =
                v.resources?.dashboardName ??
                sentDashboardByPrompt.current.get(v.prompt) ??
                null;
            const clarifications = v.resources?.clarifications ?? [];
            const msgs: ChatMessage[] = [
                {
                    role: 'user',
                    content: v.prompt,
                    imagePreviewUrls,
                    imageResourceIds,
                    charts,
                    dashboardName,
                    clarifications,
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
                    imagePreviewUrls: [],
                    imageResourceIds: [],
                    charts: [],
                    dashboardName: null,
                    clarifications: [],
                    appUuid: activeAppUuid ?? null,
                    version: v.version,
                });
            } else if (v.status === 'error') {
                msgs.push({
                    role: 'assistant',
                    content:
                        v.statusMessage ??
                        'Generation failed. Please try again.',
                    imagePreviewUrls: [],
                    imageResourceIds: [],
                    charts: [],
                    dashboardName: null,
                    clarifications: [],
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
    // Template chip: in-flight selection for new apps; persisted value for
    // existing apps so it survives reload. 'custom' is the absence of a
    // template, so we don't render a chip for it in either case.
    const candidateTemplate = isNewApp
        ? selectedTemplate
        : appPersistedTemplate;
    const displayTemplate: DataAppTemplate | null =
        candidateTemplate && candidateTemplate !== 'custom'
            ? candidateTemplate
            : null;
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
            // The new bundle re-runs its queries from scratch, so the
            // previous version's entries are stale. With "Persist" on we
            // flip in-flight ones to a terminal "interrupted" state instead
            // of clearing — the iframe that would have polled their
            // queryUuids is gone, so they'd otherwise sit non-terminal.
            if (persistLogs) {
                interruptInFlightQueries();
            } else {
                setTrackedQueries([]);
            }
        }
    }, [
        latestReadyPreview,
        previewApp?.appUuid,
        previewApp?.version,
        persistLogs,
        interruptInFlightQueries,
    ]);

    // Manual refresh counter for the preview iframe. The iframe URL embeds
    // this value, so bumping it forces the browser to reload the iframe and
    // re-execute the app's metric queries. Used after the user pushes a
    // semantic-layer change and wants to see it reflected without waiting
    // on the in-progress code-gen iteration.
    const [previewRefreshKey, setPreviewRefreshKey] = useState(0);
    const handleRefreshPreview = useCallback(() => {
        setPreviewRefreshKey((k) => k + 1);
        if (persistLogs) {
            interruptInFlightQueries();
        } else {
            setTrackedQueries([]);
        }
    }, [persistLogs, interruptInFlightQueries]);

    const scrollToBottom = useCallback(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, []);

    useEffect(() => {
        scrollToBottom();
    }, [messages, isLoading, scrollToBottom]);

    // Revoke all sent image blob URLs on unmount to prevent memory leaks.
    // We don't revoke on imageAttachments change because the URLs may have
    // been transferred to a sent message for display.
    useEffect(() => {
        const ref = sentImagesByPrompt.current;
        return () => {
            ref.forEach((urls) =>
                urls.forEach((url) => URL.revokeObjectURL(url)),
            );
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
            showToastError({
                title: 'Unsupported image type',
                subtitle: `${file.name}: only PNG, JPEG, GIF, and WEBP are supported.`,
            });
            return;
        }
        if (file.size > MAX_IMAGE_SIZE) {
            showToastError({
                title: 'Image too large',
                subtitle: `${file.name} exceeds the 10MB limit.`,
            });
            return;
        }
        setImageAttachments((prev) => {
            if (prev.length >= MAX_IMAGES_PER_VERSION) {
                showToastWarning({
                    title: `Image limit reached`,
                    subtitle: `You can attach up to ${MAX_IMAGES_PER_VERSION} images per message.`,
                });
                return prev;
            }
            return [...prev, { file, previewUrl: URL.createObjectURL(file) }];
        });
    };

    const handlePaste = (e: React.ClipboardEvent) => {
        const items = e.clipboardData?.files;
        if (items && items.length > 0) {
            const imageFiles = Array.from(items).filter((f) =>
                f.type.startsWith('image/'),
            );
            if (imageFiles.length > 0) {
                e.preventDefault();
                imageFiles.forEach(handleImageAttach);
            }
        }
    };

    const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (files) {
            Array.from(files).forEach(handleImageAttach);
        }
        e.target.value = '';
    };

    const clearImage = (previewUrl: string) => {
        URL.revokeObjectURL(previewUrl);
        setImageAttachments((prev) =>
            prev.filter((img) => img.previewUrl !== previewUrl),
        );
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        Array.from(e.dataTransfer.files)
            .filter((f) => f.type.startsWith('image/'))
            .forEach(handleImageAttach);
    };

    const buildSubmitCallbacks = () => ({
        onSuccess: (data: { appUuid: string; version: number }) => {
            setActiveAppUuid(data.appUuid);
            void queryClient.invalidateQueries({
                queryKey: ['app', projectUuid, data.appUuid],
            });
            if (!urlAppUuid) {
                void navigate(`/projects/${projectUuid}/apps/${data.appUuid}`, {
                    replace: true,
                });
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
                    imagePreviewUrls: [],
                    imageResourceIds: [],
                    charts: [],
                    dashboardName: null,
                    clarifications: [],
                    appUuid: null,
                    version: null,
                },
            ]);
        },
    });

    const handleSubmit = async () => {
        const trimmed = (promptEditorRef.current?.getText() ?? '').trim();
        if (!trimmed || isLoading || isSubmittingRef.current) return;

        isSubmittingRef.current = true;
        setIsSubmitting(true);

        try {
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

            // Upload images sequentially. Two reasons we can't run these in parallel:
            // 1. The backend buffers each body to avoid AWS SDK chunked signing,
            //    which MinIO/GCS handle unreliably (RequestTimeout).
            // 2. Concurrent PUTs to the same staging prefix
            //    (apps/{appUuid}/uploads/) hit MinIO's per-prefix lock and fail
            //    with "A timeout occurred while trying to lock a resource".
            // Surface individual failures via toast rather than silently dropping them.
            let imageIds: string[] | undefined;
            if (imageAttachments.length > 0) {
                const ids: string[] = [];
                for (const att of imageAttachments) {
                    try {
                        const result = await uploadImage({
                            projectUuid: projectUuid!,
                            file: att.file,
                            appUuid: targetAppUuid!,
                        });
                        ids.push(result.imageId);
                    } catch (err) {
                        showToastError({
                            title: 'Image upload failed',
                            subtitle:
                                err instanceof Error
                                    ? err.message
                                    : 'Unknown error',
                        });
                    }
                }
                imageIds = ids.length > 0 ? ids : undefined;
                if (ids.length === 0) {
                    return;
                }
            }

            // Capture preview URLs before clearing — they stay in the message bubble.
            // Also store in the ref so they survive the local→server transition.
            const sentImageUrls = imageAttachments.map((att) => att.previewUrl);
            if (sentImageUrls.length > 0) {
                sentImagesByPrompt.current.set(trimmed, sentImageUrls);
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
                    imagePreviewUrls: sentImageUrls,
                    imageResourceIds: [],
                    charts: sentCharts,
                    dashboardName: sentDashboardName,
                    clarifications: [],
                    appUuid: null,
                    version: null,
                },
            ]);
            promptEditorRef.current?.clear();
            setIsPromptEmpty(true);
            setImageAttachments([]);
            setSelectedCharts([]);
            setSelectedDashboard(null);
            resetGenerate();
            resetIterate();

            // Pre-build clarification: first-build only. The clarifier runs for
            // every template — the questions adapt to the kind of app being
            // built (template is passed through). Iteration prompts skip
            // clarification entirely — by then intent is already grounded in
            // the existing version.
            const isFirstBuild = !activeAppUuid;
            if (isFirstBuild && newAppUuid) {
                try {
                    const { questions } = await clarifyMutateAsync({
                        projectUuid: projectUuid!,
                        prompt: trimmed,
                        template: selectedTemplate ?? undefined,
                        charts,
                        dashboard,
                        imageIds,
                    });
                    if (questions.length > 0) {
                        setPendingClarification({
                            questions,
                            prompt: trimmed,
                            template: selectedTemplate ?? undefined,
                            imageIds,
                            appUuid: newAppUuid,
                            charts,
                            dashboard,
                            spaceUuid: targetSpaceUuid,
                        });
                        setClarificationAnswers(
                            new Array(questions.length).fill(''),
                        );
                        return;
                    }
                    // No questions returned — fall through and build immediately.
                } catch (err) {
                    // Clarify failed (model not configured, network, etc.) — fall
                    // back to the original behavior and just build. We don't want
                    // a clarifier outage to block the actual feature.
                    // eslint-disable-next-line no-console
                    console.warn(
                        'App clarification failed; proceeding to build',
                        err,
                    );
                }
            }

            const callbacks = buildSubmitCallbacks();

            if (activeAppUuid) {
                iterateMutate(
                    {
                        projectUuid,
                        appUuid: activeAppUuid,
                        prompt: trimmed,
                        imageIds,
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
                        imageIds,
                        appUuid: newAppUuid,
                        charts,
                        dashboard,
                        spaceUuid: targetSpaceUuid,
                    },
                    callbacks,
                );
            }
        } finally {
            isSubmittingRef.current = false;
            setIsSubmitting(false);
        }
    };

    /**
     * Submit the user's answers to the clarification questions and start the
     * actual build. Called by both the "Build" button (which folds answers
     * into the generate request as `clarifications`) and the "Skip" link
     * (which fires generate without any clarifications, as if the questions
     * had never been asked).
     */
    const handleSubmitClarification = (skip: boolean) => {
        if (!pendingClarification) return;

        const clarifications: AppClarification[] = skip
            ? []
            : pendingClarification.questions
                  .map((question, i) => ({
                      question,
                      answer: (clarificationAnswers[i] ?? '').trim(),
                  }))
                  // Drop empty answers — they don't help the model and just
                  // make the prompt noisier. Same effect as "Skip" for that
                  // particular question.
                  .filter((c) => c.answer.length > 0);

        // Attach the Q&A to the user bubble that handleSubmit just added.
        // The backend persists the same array on `resources.clarifications`
        // so the local→server transition is seamless.
        if (clarifications.length > 0) {
            setLocalMessages((prev) => {
                const lastUserIdx = prev.findLastIndex(
                    (m) => m.role === 'user',
                );
                if (lastUserIdx === -1) return prev;
                const next = [...prev];
                next[lastUserIdx] = {
                    ...next[lastUserIdx],
                    clarifications,
                };
                return next;
            });
        }

        const captured = pendingClarification;
        setPendingClarification(null);
        setClarificationAnswers([]);
        resetGenerate();

        generateMutate(
            {
                projectUuid: projectUuid!,
                prompt: captured.prompt,
                template: captured.template,
                imageIds: captured.imageIds,
                appUuid: captured.appUuid,
                charts: captured.charts,
                dashboard: captured.dashboard,
                clarifications:
                    clarifications.length > 0 ? clarifications : undefined,
                spaceUuid: captured.spaceUuid,
            },
            buildSubmitCallbacks(),
        );
    };

    const handleTemplateSelect = (template: DataAppTemplate) => {
        // Picking any template drops the user straight into the textarea.
        // The template still propagates through to the build (it informs
        // backend-side build instructions and the AI clarifier's questions),
        // but we no longer ask hand-rolled questions per template — the AI
        // clarifier produces those dynamically on submit.
        setSelectedTemplate(template);
        setWizardStage('confirm');
        promptEditorRef.current?.clear();
        setIsPromptEmpty(true);
        // Focus the editor so the user can immediately type. The setTimeout
        // gives the editor a tick to mount when the input area first appears.
        setTimeout(() => promptEditorRef.current?.focus(), 0);
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
                                    <Box
                                        className={`${classes.chatMessageGroup}${
                                            pendingClarification
                                                ? ` ${classes.dimmedHistory}`
                                                : ''
                                        }`}
                                    >
                                        {messages.map((msg, i) =>
                                            msg.role === 'user' ? (
                                                <Box
                                                    key={i}
                                                    className={
                                                        classes.userMessage
                                                    }
                                                >
                                                    <Box
                                                        className={
                                                            classes.userBubble
                                                        }
                                                    >
                                                        <ChatMessageContent
                                                            content={
                                                                msg.content
                                                            }
                                                        />
                                                        {msg.charts.length >
                                                            0 && (
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
                                                        {msg.clarifications
                                                            .length > 0 && (
                                                            <Box
                                                                mt="xs"
                                                                className={
                                                                    classes.bubbleClarificationList
                                                                }
                                                            >
                                                                {msg.clarifications.map(
                                                                    (c, ci) => (
                                                                        <Box
                                                                            key={
                                                                                ci
                                                                            }
                                                                            className={
                                                                                classes.bubbleClarificationItem
                                                                            }
                                                                        >
                                                                            <Text
                                                                                size="xs"
                                                                                className={
                                                                                    classes.bubbleClarificationQuestion
                                                                                }
                                                                            >
                                                                                {
                                                                                    c.question
                                                                                }
                                                                            </Text>
                                                                            <Text size="sm">
                                                                                {
                                                                                    c.answer
                                                                                }
                                                                            </Text>
                                                                        </Box>
                                                                    ),
                                                                )}
                                                            </Box>
                                                        )}
                                                        {msg.imagePreviewUrls
                                                            .length > 0
                                                            ? msg.imagePreviewUrls.map(
                                                                  (url) => (
                                                                      <Image
                                                                          key={
                                                                              url
                                                                          }
                                                                          src={
                                                                              url
                                                                          }
                                                                          className={
                                                                              classes.sentImageThumbnail
                                                                          }
                                                                          alt="Attached"
                                                                      />
                                                                  ),
                                                              )
                                                            : activeAppUuid &&
                                                              projectUuid &&
                                                              msg.imageResourceIds.map(
                                                                  (id) => (
                                                                      <AppResourceImage
                                                                          key={
                                                                              id
                                                                          }
                                                                          projectUuid={
                                                                              projectUuid
                                                                          }
                                                                          appUuid={
                                                                              activeAppUuid
                                                                          }
                                                                          imageId={
                                                                              id
                                                                          }
                                                                          className={
                                                                              classes.sentImageThumbnail
                                                                          }
                                                                      />
                                                                  ),
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
                                                        <IconSparkles
                                                            size={12}
                                                        />
                                                    </ThemeIcon>
                                                    <Box
                                                        className={
                                                            classes.assistantBubble
                                                        }
                                                    >
                                                        {msg.appUuid ? (
                                                            <ReactMarkdownPreview
                                                                source={
                                                                    msg.content
                                                                }
                                                                className={
                                                                    classes.markdown
                                                                }
                                                            />
                                                        ) : (
                                                            <Text
                                                                size="sm"
                                                                c="red"
                                                            >
                                                                {msg.content}
                                                            </Text>
                                                        )}
                                                    </Box>
                                                </Box>
                                            ),
                                        )}
                                    </Box>
                                    {pendingClarification ? (
                                        <Box
                                            className={classes.clarifyContainer}
                                        >
                                            <Group gap="xs">
                                                <ThemeIcon
                                                    size="sm"
                                                    radius="xl"
                                                    variant="light"
                                                    color="gray"
                                                >
                                                    <IconSparkles size={12} />
                                                </ThemeIcon>
                                                <Text size="sm">
                                                    A few quick questions:
                                                </Text>
                                            </Group>
                                            <Stack gap={6}>
                                                {pendingClarification.questions.map(
                                                    (question, qi) => (
                                                        <Box
                                                            key={qi}
                                                            className={
                                                                classes.clarifyCard
                                                            }
                                                        >
                                                            <Text
                                                                size="sm"
                                                                c="dimmed"
                                                            >
                                                                {question}
                                                            </Text>
                                                            <Textarea
                                                                variant="unstyled"
                                                                autosize
                                                                minRows={1}
                                                                maxRows={4}
                                                                placeholder="Your answer"
                                                                value={
                                                                    clarificationAnswers[
                                                                        qi
                                                                    ] ?? ''
                                                                }
                                                                onChange={(
                                                                    e,
                                                                ) => {
                                                                    const next =
                                                                        [
                                                                            ...clarificationAnswers,
                                                                        ];
                                                                    next[qi] =
                                                                        e.currentTarget.value;
                                                                    setClarificationAnswers(
                                                                        next,
                                                                    );
                                                                }}
                                                                autoFocus={
                                                                    qi === 0
                                                                }
                                                                classNames={{
                                                                    input: classes.clarifyCardInput,
                                                                }}
                                                            />
                                                        </Box>
                                                    ),
                                                )}
                                            </Stack>
                                            <Group gap="xs" justify="flex-end">
                                                <Button
                                                    variant="subtle"
                                                    size="xs"
                                                    onClick={() =>
                                                        handleSubmitClarification(
                                                            true,
                                                        )
                                                    }
                                                >
                                                    Skip
                                                </Button>
                                                <Button
                                                    size="xs"
                                                    onClick={() =>
                                                        handleSubmitClarification(
                                                            false,
                                                        )
                                                    }
                                                >
                                                    Build
                                                </Button>
                                            </Group>
                                        </Box>
                                    ) : (
                                        isAgentWorking && (
                                            <Box
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
                                                    <Text size="sm" c="dimmed">
                                                        {isClarifying
                                                            ? 'Hold tight, I may have some questions before starting'
                                                            : (latestBuildingVersion?.statusMessage ??
                                                              'Generating your app')}{' '}
                                                        <LoadingDots />
                                                    </Text>
                                                </Box>
                                            </Box>
                                        )
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
                                    multiple
                                    onChange={handleFileInputChange}
                                    hidden
                                />
                                {displayTemplate && (
                                    <TemplateChip template={displayTemplate} />
                                )}
                                <Box className={classes.inputWrapper}>
                                    <Box className={classes.textareaColumn}>
                                        <AppPromptEditor
                                            ref={promptEditorRef}
                                            placeholder="Describe the app you want to build..."
                                            autoFocus
                                            disabled={isLoading}
                                            onEmptyChange={setIsPromptEmpty}
                                            onSubmit={() => void handleSubmit()}
                                            onPaste={handlePaste}
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
                                                isPromptEmpty || isLoading
                                            }
                                            loading={
                                                isSubmitting ||
                                                isGenerating ||
                                                isIterating
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
                                            isLoading ||
                                            imageAttachments.length >=
                                                MAX_IMAGES_PER_VERSION
                                        }
                                    />
                                    {inspectorAvailable && (
                                        <InspectButton
                                            enabled={inspectorEnabled}
                                            onToggle={() =>
                                                setInspectorEnabled((v) => !v)
                                            }
                                        />
                                    )}
                                </Group>
                                <Box
                                    className={classes.resourceSections}
                                    onDragOver={handleDragOver}
                                    onDrop={handleDrop}
                                >
                                    {selectedCharts.length > 0 ||
                                    selectedDashboard ||
                                    imageAttachments.length > 0 ? (
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
                                                    disabled={isLoading}
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
                                                    disabled={isLoading}
                                                />
                                            )}
                                            {imageAttachments.length > 0 && (
                                                <SelectedImageSection
                                                    images={imageAttachments.map(
                                                        (att) => ({
                                                            previewUrl:
                                                                att.previewUrl,
                                                        }),
                                                    )}
                                                    onRemove={(previewUrl) =>
                                                        clearImage(previewUrl)
                                                    }
                                                    disabled={isLoading}
                                                    loading={isSubmitting}
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
                                <Tooltip
                                    label="Refresh preview to re-run queries"
                                    withArrow
                                    position="bottom"
                                >
                                    <ActionIcon
                                        variant="subtle"
                                        size="sm"
                                        color="ldGray.6"
                                        ml="auto"
                                        disabled={!previewApp}
                                        onClick={handleRefreshPreview}
                                        aria-label="Refresh preview"
                                    >
                                        <MantineIcon
                                            icon={IconRefresh}
                                            size={16}
                                        />
                                    </ActionIcon>
                                </Tooltip>
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
                                    refreshKey={previewRefreshKey}
                                    onQueryEvent={handleQueryEvent}
                                    inspectorEnabled={inspectorEnabled}
                                    onElementSelected={handleElementSelected}
                                    onInspectorAvailabilityChange={
                                        setInspectorAvailable
                                    }
                                    onInspectorCancelled={
                                        handleInspectorCancelled
                                    }
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
                                onClear={handleClearQueries}
                                persistLogs={persistLogs}
                                onPersistLogsChange={setPersistLogs}
                            />
                        </Box>
                    </Box>
                </Panel>
            </PanelGroup>
        </Box>
    );
};

export default AppGenerate;
