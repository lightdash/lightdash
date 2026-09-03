import { subject } from '@casl/ability';
import {
    ChartKind,
    DATA_APP_VIZ_TEMPLATE,
    FeatureFlags,
    isApiError,
    isAppVersionInProgress,
    MAX_APP_FILES_PER_VERSION,
    type ApiAppVersionSummary,
    type AppClarification,
    type AppExternalConnectionReference,
    type AppVersionDependencyEntry,
    type DataAppTemplate,
    type DataAppVizContext,
} from '@lightdash/common';
import {
    Badge,
    Box,
    Button,
    Divider,
    Group,
    Image,
    Loader,
    Menu,
    Stack,
    Text,
    Tooltip,
} from '@mantine/core';
import {
    IconAppsOff,
    IconAppWindow,
    IconCheck,
    IconArrowUp,
    IconBrush,
    IconExternalLink,
    IconArrowBackUp,
    IconFileDescription,
    IconLayoutDashboard,
    IconLink,
    IconPackage,
    IconPlayerStop,
    IconRestore,
    IconPlugConnected,
} from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    type FC,
} from 'react';
import { flushSync } from 'react-dom';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import {
    Link,
    Navigate,
    useLocation,
    useNavigate,
    useParams,
} from 'react-router';
import { validate as isUuidString, v4 as uuid4 } from 'uuid';
import { AiMarkdown } from '../components/common/AiMarkdown';
import Callout from '../components/common/Callout';
import MantineIcon from '../components/common/MantineIcon';
import {
    ComposerSubmitButton,
    PromptComposer,
    type PromptComposerHandle,
} from '../components/common/PromptComposer';
import { getChartIcon } from '../components/common/ResourceIcon/utils';
import SuboptimalState from '../components/common/SuboptimalState/SuboptimalState';
import { type AppIframePreviewHandle } from '../features/apps/AppIframePreview';
import AppInspectorPanel from '../features/apps/AppInspectorPanel';
import {
    AttachButton,
    ModelPicker,
    ScreenshotButton,
    SelectedAttachmentSection,
    SelectedDashboardSection,
    SelectedQuerySection,
    type SelectedChart,
    type SelectedConnection,
    type SelectedDashboard,
} from '../features/apps/AppResourcePicker';
import AppTemplatePicker from '../features/apps/AppTemplatePicker';
import ChatBubbleMeta from '../features/apps/ChatBubbleMeta';
import ChatMessageContent from '../features/apps/ChatMessageContent';
import AppBuilderSidebarToggle from '../features/apps/components/AppBuilderSidebarToggle';
import AppHeader from '../features/apps/components/AppHeader';
import AppHeaderActions from '../features/apps/components/AppHeaderActions';
import AppPreview from '../features/apps/components/AppPreview';
import AppVersionNarration from '../features/apps/components/AppVersionNarration';
import ClarificationQuestionList from '../features/apps/components/ClarificationQuestionList';
import ConnectionChip from '../features/apps/components/ConnectionChip';
import { ElementPickerButton } from '../features/apps/components/ElementPickerButton';
import { ElementRefPill } from '../features/apps/components/ElementRefPill';
import LoadingDots from '../features/apps/components/LoadingDots';
import RecentAppSuggestions from '../features/apps/components/RecentAppSuggestions';
import { RestoreAppVersionModal } from '../features/apps/components/RestoreAppVersionModal';
import { useAppBuildPoller } from '../features/apps/hooks/useAppBuildPoller';
import { useAppFileUpload } from '../features/apps/hooks/useAppFileUpload';
import { useAppImageUrl } from '../features/apps/hooks/useAppImageUrl';
import { useAppThumbnailUpload } from '../features/apps/hooks/useAppThumbnail';
import { useBuildNotification } from '../features/apps/hooks/useBuildNotification';
import { useCancelAppVersion } from '../features/apps/hooks/useCancelAppVersion';
import { useClarificationRound } from '../features/apps/hooks/useClarificationRound';
import { useDataAppModelSelection } from '../features/apps/hooks/useDataAppModelSelection';
import { useElementPicker } from '../features/apps/hooks/useElementPicker';
import { useGenerateApp } from '../features/apps/hooks/useGenerateApp';
import { useGetApp } from '../features/apps/hooks/useGetApp';
import { useIterateApp } from '../features/apps/hooks/useIterateApp';
import { useRestoreAppVersion } from '../features/apps/hooks/useRestoreAppVersion';
import { useSdkUpgradeStatus } from '../features/apps/hooks/useSdkUpgradeStatus';
import {
    countReadyQueriesSinceBoundary,
    useTrackedAppQueries,
} from '../features/apps/hooks/useTrackedAppQueries';
import { useTrackedExternalRequests } from '../features/apps/hooks/useTrackedExternalRequests';
import { getTemplate } from '../features/apps/templates';
import {
    toAppClarifyParams,
    toAppGeneratePayload,
    type AppBuildRequest,
} from '../features/apps/utils/appBuildRequest';
import {
    getAppFileValidationError,
    isSupportedAppImage,
} from '../features/apps/utils/appFileAttachments';
import {
    emptyChatMessage,
    mergeChatMessages,
    type ChatAttachedFile,
    type ChatChart,
    type ChatConnection,
    type ChatMessage,
} from '../features/apps/utils/chatMessage';
import {
    elementRefKey,
    refToWireString,
} from '../features/apps/utils/elementRefs';
import { getVersionNarration } from '../features/apps/utils/versionNarration';
import { versionsToChatMessages } from '../features/apps/utils/versionsToChatMessages';
import DataAppVizResultCard from '../features/chartTypes/components/DataAppVizResultCard';
import DataAppVizTestPanel from '../features/chartTypes/components/DataAppVizTestPanel';
import { chartTypeBuilderPath } from '../features/chartTypes/utils/chartTypeBuilderPath';
import { useAppExternalConnections } from '../features/externalConnections/hooks/useAppExternalConnections';
import { ThemePicker } from '../features/organizationDesigns/components/ThemePicker';
import { useOrganizationDesigns } from '../features/organizationDesigns/hooks/useOrganizationDesigns';
import useToaster from '../hooks/toaster/useToaster';
import { useProjectUuid } from '../hooks/useProjectUuid';
import { useServerFeatureFlag } from '../hooks/useServerOrClientFeatureFlag';
import { useSpaceSummaries } from '../hooks/useSpaces';
import { useAbilityContext } from '../providers/Ability/useAbilityContext';
import useApp from '../providers/App/useApp';
import classes from './AppGenerate.module.css';

// Run a layout-changing state update inside a native View Transition so the
// browser cross-fades/morphs the before/after frames (used for the
// centered-composer → split-sidebar handoff). flushSync forces React to
// commit synchronously so the transition captures the new layout. Falls back
// to a plain update where the API is unavailable.
function withViewTransition(update: () => void): void {
    const doc = document as Document & {
        startViewTransition?: (cb: () => void) => unknown;
    };
    if (typeof doc.startViewTransition === 'function') {
        doc.startViewTransition(() => flushSync(update));
    } else {
        update();
    }
}

// ChatChart and ChatMessage are imported from `features/apps/utils/chatMessage`
// alongside the merge helper, so the type and the merge logic stay collocated.

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

const TemplateChip: FC<{ template: DataAppTemplate }> = ({ template }) => {
    const t = getTemplate(template);
    return (
        <Badge size="md" leftSection={<MantineIcon icon={t.icon} size={12} />}>
            {t.title}
        </Badge>
    );
};

const NO_THEME_LABEL = 'No theme';

const ThemeChip: FC<{
    themeName: string;
    selectedThemeUuid: string | null;
    themes: { designUuid: string; name: string; isDefault?: boolean }[];
    disabled?: boolean;
    onThemeChange: (designUuid: string | null) => void;
}> = ({ themeName, selectedThemeUuid, themes, disabled, onThemeChange }) => (
    <Menu position="top-start">
        <Menu.Target>
            <Badge
                component="button"
                type="button"
                size="md"
                leftSection={<MantineIcon icon={IconBrush} size={12} />}
                disabled={disabled}
                styles={{
                    root: {
                        cursor: disabled ? 'not-allowed' : 'pointer',
                    },
                }}
            >
                {themeName}
            </Badge>
        </Menu.Target>
        <Menu.Dropdown>
            <Menu.Item
                leftSection={
                    selectedThemeUuid === null ? (
                        <MantineIcon icon={IconCheck} size={14} />
                    ) : undefined
                }
                disabled={disabled}
                onClick={() => onThemeChange(null)}
            >
                {NO_THEME_LABEL}
            </Menu.Item>
            {themes.length > 0 && <Menu.Divider />}
            {themes.map((theme) => (
                <Menu.Item
                    key={theme.designUuid}
                    leftSection={
                        selectedThemeUuid === theme.designUuid ? (
                            <MantineIcon icon={IconCheck} size={14} />
                        ) : undefined
                    }
                    disabled={disabled}
                    onClick={() => onThemeChange(theme.designUuid)}
                >
                    <Group gap="xs">
                        <Text size="sm">{theme.name}</Text>
                        {theme.isDefault && (
                            <Text size="xs" c="dimmed">
                                Default
                            </Text>
                        )}
                    </Group>
                </Menu.Item>
            ))}
        </Menu.Dropdown>
    </Menu>
);

/** A small informational badge shown on assistant bubbles for versions that
 *  were uploaded with a custom dependency set. Lists `name@version` per line
 *  in the tooltip so the author can confirm what was installed. */
const DepsChip: FC<{ deps: AppVersionDependencyEntry[] }> = ({ deps }) => (
    <Tooltip
        position="top-start"
        label={
            <Stack gap={2}>
                <Text size="xs" fw={600}>
                    Installed in the build sandbox
                </Text>
                {deps.map((d) => (
                    <Text key={d.name} size="xs">
                        {d.name}@{d.version}
                    </Text>
                ))}
            </Stack>
        }
    >
        <Badge
            size="sm"
            leftSection={<MantineIcon icon={IconPackage} size={10} />}
        >
            {deps.length} {deps.length === 1 ? 'package' : 'packages'}
        </Badge>
    </Tooltip>
);

/** A status pill (theme-pill style) listing the connections this app can call. */
const AvailableConnectionsChip: FC<{ aliases: string[] }> = ({ aliases }) => (
    <Tooltip
        position="top"
        label={
            <Stack gap={2}>
                <Text size="xs" fw={600}>
                    Available to this app
                </Text>
                {aliases.map((alias) => (
                    <Text key={alias} size="xs">
                        {alias}
                    </Text>
                ))}
            </Stack>
        }
    >
        <Badge
            size="md"
            leftSection={<MantineIcon icon={IconPlugConnected} size={12} />}
        >
            {aliases.length} connection{aliases.length === 1 ? '' : 's'}
        </Badge>
    </Tooltip>
);

const AppGenerate: FC = () => {
    const { appUuid: urlAppUuid } = useParams();
    const projectUuid = useProjectUuid();
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
    const promptEditorRef = useRef<PromptComposerHandle | null>(null);
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
    const [themeChipOverride, setThemeChipOverride] = useState<{
        appUuid: string | null; // null = override set from the new-app page
        designUuid: string | null;
    } | null>(null);
    const [fileAttachments, setFileAttachments] = useState<
        Array<{
            localId: string;
            file: File;
            /** Object URL for image thumbnails; null for non-image files. */
            previewUrl: string | null;
            kind?: 'screenshot';
        }>
    >([]);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [selectedCharts, setSelectedCharts] = useState<SelectedChart[]>([]);
    const [selectedDashboard, setSelectedDashboard] =
        useState<SelectedDashboard | null>(null);
    const [selectedConnections, setSelectedConnections] = useState<
        SelectedConnection[]
    >([]);
    // Same handshake for screenshot capture. Older templates (resumed
    // sandboxes built before this feature shipped) never announce, so the
    // Screenshot button stays hidden — they keep working as before.
    const [screenshotAvailable, setScreenshotAvailable] = useState(false);
    const [isCapturingScreenshot, setIsCapturingScreenshot] = useState(false);
    const [lineageEnabled, setLineageEnabled] = useState(false);
    const [lineageAvailable, setLineageAvailable] = useState(false);
    const [hoveredQueryUuid, setHoveredQueryUuid] = useState<string | null>(
        null,
    );
    const [focusedQueryUuid, setFocusedQueryUuid] = useState<string | null>(
        null,
    );
    const previewRef = useRef<AppIframePreviewHandle>(null);
    // Collapse is pure UI state driven by CSS (see chatPanelOuter[data-collapsed])
    // — the panel-group layout is never touched, so expanding restores the
    // exact pre-collapse width.
    const [isChatPanelCollapsed, setIsChatPanelCollapsed] = useState(false);
    const handleToggleChatPanel = useCallback(() => {
        setIsChatPanelCollapsed((collapsed) => !collapsed);
    }, []);
    const {
        queries: trackedQueries,
        persistLogs,
        setPersistLogs,
        handleQueryEvent,
        clearQueries,
        resetQueries,
        interruptInFlightQueries,
    } = useTrackedAppQueries();
    const {
        externalRequests,
        handleExternalRequestEvent,
        clearExternalRequests,
        interruptInFlightRequests,
    } = useTrackedExternalRequests();
    // Parent-owned visibility so the X dismisses the panel completely and the
    // user re-opens it from the dots menu — same model as preview, for
    // consistency. Defaults to visible because the builder is the technical
    // workflow where seeing queries as they fire is the point.
    const [networkPanelHidden, setNetworkPanelHidden] = useState(false);
    const handleLineageSelected = useCallback(
        (event: { queryUuid: string }) => {
            setNetworkPanelHidden(false);
            // Selection persists (row highlight + in-app element outline);
            // re-clicking the selected element deselects it.
            setFocusedQueryUuid((prev) =>
                prev === event.queryUuid ? null : event.queryUuid,
            );
        },
        [],
    );

    const handleLineageCancelled = useCallback(() => {
        setLineageEnabled(false);
        setFocusedQueryUuid(null);
    }, []);

    const [localMessages, setLocalMessages] = useState<ChatMessage[]>([]);
    // Maps prompt text → image preview URL so the thumbnail survives the
    // local→server message transition (localMessages get cleared when server
    // version data arrives, but the ref persists).
    const sentImagesByPrompt = useRef(new Map<string, string[]>());
    // Maps prompt text → non-image attachment chips, same lifecycle as above
    const sentFilesByPrompt = useRef(new Map<string, ChatAttachedFile[]>());
    // Maps prompt text → chart names so they survive the local→server transition
    const sentChartsByPrompt = useRef(new Map<string, ChatChart[]>());
    // Maps prompt text → connection names so they survive the local→server transition
    const sentConnectionsByPrompt = useRef(new Map<string, ChatConnection[]>());
    // Maps prompt text → dashboard name so it survives the local→server transition
    const sentDashboardByPrompt = useRef(new Map<string, string>());
    // Track appUuid in local state so polling starts immediately after creation
    // (before the URL param updates via replaceState). The URL param may be a
    // slug — never seed it here: only `useGetApp` accepts a slug, and every
    // other endpoint needs the canonical uuid it returns. Until that arrives,
    // activeAppUuid stays undefined and the uuid-keyed hooks stay idle.
    const [activeAppUuid, setActiveAppUuid] = useState<string | undefined>(
        isUuidString(urlAppUuid ?? '') ? urlAppUuid : undefined,
    );
    // Element references travel as wire-string lines appended to the prompt
    // at submit time. Picker and lineage modes are mutually exclusive.
    const elementPicker = useElementPicker({
        identityKey: activeAppUuid ?? '',
        onEnabled: handleLineageCancelled,
    });
    const cancelElementPicker = elementPicker.cancel;
    const clearElementRefs = elementPicker.clear;
    const handleToggleLineage = useCallback(() => {
        const next = !lineageEnabled;
        setLineageEnabled(next);
        if (next) cancelElementPicker();
        setFocusedQueryUuid(null);
    }, [lineageEnabled, cancelElementPicker]);
    // Connections already linked to this app — shown as an "available" pill so
    // the user knows what the generated app can call via client.externalFetch.
    const { data: availableConnectionLinks = [] } = useAppExternalConnections(
        projectUuid,
        activeAppUuid,
    );
    const availableConnectionAliases = availableConnectionLinks.map(
        (l) => l.alias,
    );
    const invalidateAppData = useCallback(
        (appUuid: string | undefined) => {
            if (!projectUuid || !appUuid) return;

            void queryClient.invalidateQueries({
                queryKey: ['app', projectUuid, appUuid],
            });
            void queryClient.invalidateQueries({
                queryKey: ['app-external-connections', projectUuid, appUuid],
            });
        },
        [projectUuid, queryClient],
    );
    // Assigned further down, once the generate mutation and its callbacks are
    // in scope; only ever called from an event, never during render.
    const runBuildRef = useRef<
        (request: AppBuildRequest, clarifications: AppClarification[]) => void
    >(() => {});
    const onClarifiedBuild = useCallback(
        (request: AppBuildRequest, clarifications: AppClarification[]) =>
            runBuildRef.current(request, clarifications),
        [],
    );
    const clarification = useClarificationRound<AppBuildRequest>({
        projectUuid,
        isFirstBuild: !activeAppUuid,
        toClarifyParams: toAppClarifyParams,
        onBuild: onClarifiedBuild,
    });
    const { reset: resetClarification } = clarification;
    // Track the previous app UUID so we can detect intentional navigation
    // vs. the post-submit URL update (undefined → newUuid).
    const prevUrlAppUuid = useRef(urlAppUuid);
    const resetSessionState = useCallback(() => {
        promptEditorRef.current?.clear();
        setIsPromptEmpty(true);
        setSelectedCharts([]);
        setSelectedDashboard(null);
        setSelectedConnections([]);
        clearElementRefs();
        cancelElementPicker();
        setFileAttachments([]);
        setLocalMessages([]);
        setPin(null);
        // resetQueries: navigating away tears down the preview but not the
        // parent-owned fetch/poll of an in-flight query.
        resetQueries();
        clearExternalRequests();
        setScreenshotAvailable(false);
        setIsCapturingScreenshot(false);
        setLineageEnabled(false);
        setLineageAvailable(false);
        setHoveredQueryUuid(null);
        setFocusedQueryUuid(null);
        setSelectedTemplate(null);
        setThemeChipOverride(null);
        resetClarification();
        setTestVizContext(null);
        setIsChatPanelCollapsed(false);
        versionCacheRef.current.clear();
        versionCacheAppRef.current = undefined;
        sentImagesByPrompt.current.forEach((urls) =>
            urls.forEach((url) => URL.revokeObjectURL(url)),
        );
        sentImagesByPrompt.current.clear();
        sentFilesByPrompt.current.clear();
    }, [
        resetQueries,
        clearExternalRequests,
        resetClarification,
        clearElementRefs,
        cancelElementPicker,
    ]);
    useEffect(() => {
        const prev = prevUrlAppUuid.current;
        prevUrlAppUuid.current = urlAppUuid;
        // Slug URLs resolve to the canonical uuid via useGetApp; see the
        // activeAppUuid declaration.
        setActiveAppUuid(
            isUuidString(urlAppUuid ?? '') ? urlAppUuid : undefined,
        );

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

    const buildSubmitCallbacks = useCallback(
        () => ({
            onSuccess: (data: { appUuid: string; version: number }) => {
                setActiveAppUuid(data.appUuid);
                invalidateAppData(data.appUuid);
                if (!urlAppUuid) {
                    void navigate(
                        `/projects/${projectUuid}/apps/${data.appUuid}`,
                        { replace: true },
                    );
                }
            },
            onError: (err: unknown) => {
                // The mutation rejects with an ApiError object (not an Error
                // instance), so read its message before falling back.
                const errorMessage = isApiError(err)
                    ? err.error.message
                    : err instanceof Error
                      ? err.message
                      : 'Failed to generate app';
                setLocalMessages((prev) => [
                    ...prev,
                    {
                        ...emptyChatMessage(),
                        role: 'assistant' as const,
                        status: 'error' as const,
                        content: errorMessage,
                        timestamp: new Date(),
                    },
                ]);
            },
        }),
        [invalidateAppData, navigate, projectUuid, urlAppUuid],
    );

    // The generate half of a submit, deferred until the clarifying round (if
    // any) resolves. Answers ride along and are echoed on the user's bubble.
    // Assigned in a layout effect, and above the page's early returns, so a
    // guarded render can neither skip the hook nor leave a stale closure.
    useLayoutEffect(() => {
        runBuildRef.current = (request, clarifications) => {
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
            resetGenerate();
            generateMutate(
                toAppGeneratePayload(projectUuid!, request, clarifications),
                buildSubmitCallbacks(),
            );
        };
    }, [buildSubmitCallbacks, generateMutate, projectUuid, resetGenerate]);
    const { mutate: cancelMutate, isLoading: isCancelling } =
        useCancelAppVersion();
    const {
        mutate: restoreVersionMutate,
        isLoading: isRestoringVersion,
        error: restoreVersionError,
        reset: resetRestoreVersion,
    } = useRestoreAppVersion();
    // Which version the user is about to restore. `null` while the modal is
    // closed. Set when the user clicks "Restore" on a bubble; consumed by
    // the confirm modal at the bottom of the page.
    const [restoreTargetVersion, setRestoreTargetVersion] = useState<
        number | null
    >(null);
    const { mutateAsync: uploadFile } = useAppFileUpload();
    const { showToastError, showToastSuccess, showToastWarning } = useToaster();
    const { mutateAsync: uploadThumbnail } = useAppThumbnailUpload();

    // Raw live-preview capture handed to the move modal (via header actions
    // and space chip) so move-time thumbnails show the app exactly as
    // currently displayed — interactive state included. Must stay in the
    // unconditional hook section: the component has early returns below.
    const capturePreviewScreenshot = useCallback(async () => {
        const capture = previewRef.current?.captureScreenshot;
        if (!capture) {
            throw new Error('Screenshot capture is not available');
        }
        return capture();
    }, []);
    const dataAppsFlag = useServerFeatureFlag(FeatureFlags.EnableDataApps);
    const { user, health } = useApp();
    const sampleDataEnabled = health.data?.dataApps.sampleDataEnabled !== false;
    const ability = useAbilityContext();
    const chatMessagesRef = useRef<HTMLDivElement>(null);

    // Fetch version history (polling is handled by the Web Worker below)
    const {
        data: appData,
        error: appError,
        isLoading: isLoadingApp,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
    } = useGetApp(projectUuid, activeAppUuid ?? urlAppUuid);

    // The URL may reference the app by slug; the API resolves it and returns
    // the canonical uuid. Adopt it so every downstream call (iterate, polling,
    // thumbnails, connections) hits the uuid-only endpoints with a real uuid.
    const canonicalAppUuid = appData?.pages[0]?.appUuid;
    useEffect(() => {
        if (canonicalAppUuid && activeAppUuid !== canonicalAppUuid) {
            setActiveAppUuid(canonicalAppUuid);
        }
    }, [canonicalAppUuid, activeAppUuid]);

    // Derive app name/description/space/creator from fetched data
    const appName = appData?.pages?.[0]?.name ?? '';
    const appDescription = appData?.pages?.[0]?.description ?? '';
    const appSpaceUuid = appData?.pages?.[0]?.spaceUuid ?? null;
    const appSpaceName = appData?.pages?.[0]?.spaceName ?? null;
    const appCreatedByUserUuid = appData?.pages?.[0]?.createdByUserUuid ?? null;
    const appPersistedTemplate = appData?.pages?.[0]?.template ?? null;
    const appSlug = appData?.pages?.[0]?.slug ?? null;
    const appViews = appData?.pages?.[0]?.views ?? null;
    // Latest build activity stands in for "last modified" — apps have no
    // updated-at of their own.
    const appNewestVersion = appData?.pages?.[0]?.versions[0];
    const appLastModified = appNewestVersion
        ? (appNewestVersion.statusUpdatedAt ?? appNewestVersion.createdAt)
        : null;

    // Used to resolve the user's space role when checking manage rights for
    // an existing app — space editors/admins inherit manage on its data app.
    const { data: spaces = [] } = useSpaceSummaries(projectUuid, true, {});

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
    const liveNarration = useMemo(
        () => getVersionNarration(latestBuildingVersion?.statusHistory),
        [latestBuildingVersion],
    );
    // Clarifying counts as loading for the chat input (disable send; typing
    // stays enabled so the next prompt can be drafted), and a pending
    // unanswered clarification keeps send disabled until the user clicks
    // "Build" on the question bubble.
    const hasPendingClarification = clarification.pending !== null;
    const isClarifying = clarification.clarifyingPrompt !== null;
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
            // Keep the same reference when already empty: a fresh array
            // rebuilds `messages` and re-triggers the auto-scroll below.
            setLocalMessages((prev) => (prev.length === 0 ? prev : []));
        }
    }, [serverVersionCount]);

    // Convert fetched versions into chat messages (oldest first)
    const historyMessages = useMemo<ChatMessage[]>(
        () =>
            versionsToChatMessages(allVersions, {
                charts: sentChartsByPrompt.current,
                connections: sentConnectionsByPrompt.current,
                imagePreviewUrls: sentImagesByPrompt.current,
                files: sentFilesByPrompt.current,
                dashboardName: sentDashboardByPrompt.current,
            }),
        [allVersions],
    );

    // Lookup table: version number → full version summary. Used to retrieve
    // declared-dependency metadata when rendering assistant bubbles.
    const versionByNumber = useMemo(
        () =>
            new Map<number, ApiAppVersionSummary>(
                allVersions.map((v) => [v.version, v]),
            ),
        [allVersions],
    );

    // Highest server-known version number, used by `mergeChatMessages` to drop
    // optimistic local bubbles whose corresponding server version has already
    // landed in history.
    const maxHistoryVersion = useMemo(
        () => allVersions.reduce((max, v) => Math.max(max, v.version), 0),
        [allVersions],
    );

    // Merge history with the optimistic queue, dropping any local user bubble
    // whose `submittedAtVersion` is older than `maxHistoryVersion` — see
    // `mergeChatMessages` for the dedup contract.
    const messages = useMemo(
        () =>
            mergeChatMessages(
                historyMessages,
                localMessages,
                maxHistoryVersion,
            ),
        [historyMessages, localMessages, maxHistoryVersion],
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
    // New-app empty screen: arch + composer, centered, no preview/split yet.
    const newAppLanding = isNewApp && messages.length === 0 && !isLoading;

    // `hasNextPage` reflects the server's "more pages exist" signal, but we
    // accumulate versions across fetches in `versionCacheRef` — so even if the
    // server thinks more exist, we may already have them all. Versions are
    // 1-indexed and contiguous, so seeing version 1 means we've loaded
    // everything and the "Load earlier messages" button is misleading.
    const hasUnloadedEarlierVersions =
        hasNextPage && !allVersions.some((v) => v.version === 1);

    // Latest ready version for this app. Updates as new versions finish
    // building — preview defaults to this unless the user pins an older one.
    const latestReadyVersion = useMemo(() => {
        if (allVersions.length === 0) return null;
        return (
            [...allVersions]
                .sort((a, b) => b.version - a.version)
                .find((v) => v.status === 'ready') ?? null
        );
    }, [allVersions]);

    // Last Claude model used on this app, sourced from the most recent
    // version (any status — a still-building version's model is already a
    // valid signal of the user's intent). `null` when no version data is
    // loaded yet or older versions didn't persist the field.
    const latestVersion = useMemo(() => {
        if (allVersions.length === 0) return null;
        return [...allVersions].sort((a, b) => b.version - a.version)[0];
    }, [allVersions]);

    const {
        codingAgent,
        selectedModel,
        modelRequest,
        visibleModels,
        isLoading: isModelVisibilityLoading,
        setModel: handleModelChange,
    } = useDataAppModelSelection({
        appUuid: activeAppUuid ?? null,
        latestVersionModel:
            latestVersion?.resources?.codexModel ??
            latestVersion?.resources?.claudeModel ??
            null,
    });

    // Theme (org design) picker state. New apps pre-populate with the org's
    // default theme so the visible selection matches what the backend would
    // have applied anyway. Existing apps use the latest version's design
    // snapshot and send explicit changes as style-only iterations.
    // `null` means "no theme" (the Lightdash default styling).
    const { data: orgThemes = [], isFetched: hasFetchedOrgThemes } =
        useOrganizationDesigns();
    const [themeOverride, setThemeOverride] = useState<
        string | null | undefined
    >(undefined);
    const orgDefaultThemeUuid =
        orgThemes.find((t) => t.isDefault)?.designUuid ?? null;
    const selectedThemeUuid: string | null =
        themeOverride !== undefined ? themeOverride : orgDefaultThemeUuid;
    const effectiveThemeChipOverride =
        themeChipOverride &&
        (themeChipOverride.appUuid === null ||
            themeChipOverride.appUuid === activeAppUuid)
            ? themeChipOverride.designUuid
            : undefined;
    const currentThemeUuid: string | null = isNewApp
        ? (effectiveThemeChipOverride ?? selectedThemeUuid)
        : (effectiveThemeChipOverride ??
          latestVersion?.resources?.design?.designUuid ??
          null);
    const handleThemeChange = useCallback(
        (designUuid: string | null) => {
            if (designUuid === currentThemeUuid) return;

            if (isNewApp) {
                setThemeOverride(designUuid);
                setThemeChipOverride({ appUuid: null, designUuid });
                return;
            }

            if (!projectUuid || !activeAppUuid || isAgentWorking) return;

            const themeName = designUuid
                ? (orgThemes.find((t) => t.designUuid === designUuid)?.name ??
                  'Selected theme')
                : NO_THEME_LABEL;
            const prompt =
                designUuid === null
                    ? `Remove theme`
                    : `Apply theme: ${themeName}`;

            setLocalMessages((prev) => [
                ...prev,
                {
                    ...emptyChatMessage(),
                    role: 'user',
                    content: prompt,
                    timestamp: new Date(),
                    userName:
                        [user.data?.firstName, user.data?.lastName]
                            .filter((s): s is string => !!s && s.length > 0)
                            .join(' ') || null,
                    submittedAtVersion: maxHistoryVersion,
                },
            ]);
            setThemeChipOverride({ appUuid: activeAppUuid, designUuid });
            resetIterate();
            iterateMutate(
                {
                    projectUuid,
                    appUuid: activeAppUuid,
                    prompt,
                    creationExperience: 'app_builder',
                    ...modelRequest,
                    designUuid,
                },
                {
                    onSuccess: (data: { appUuid: string; version: number }) => {
                        setActiveAppUuid(data.appUuid);
                        invalidateAppData(data.appUuid);
                    },
                    onError: (err: unknown) => {
                        setThemeChipOverride(null);
                        const themeErrorMessage = isApiError(err)
                            ? err.error.message
                            : err instanceof Error
                              ? err.message
                              : 'Failed to apply theme';
                        setLocalMessages((prev) => [
                            ...prev,
                            {
                                ...emptyChatMessage(),
                                role: 'assistant',
                                status: 'error',
                                content: themeErrorMessage,
                                timestamp: new Date(),
                            },
                        ]);
                    },
                },
            );
        },
        [
            activeAppUuid,
            currentThemeUuid,
            isAgentWorking,
            isNewApp,
            iterateMutate,
            maxHistoryVersion,
            orgThemes,
            projectUuid,
            invalidateAppData,
            resetIterate,
            modelRequest,
            user.data?.firstName,
            user.data?.lastName,
        ],
    );

    // What theme name to render on the chip above the prompt input.
    // - New apps: the just-picked theme's name (from the org themes list).
    // - Existing apps: the snapshot the pipeline persisted on the latest
    //   version's resources — survives org-default changes and theme
    //   renames, so what you see is what the build actually used.
    const hasThemeChipSource = isNewApp
        ? currentThemeUuid !== null ||
          themeOverride === null ||
          (themeOverride === undefined && hasFetchedOrgThemes)
        : effectiveThemeChipOverride !== undefined || latestVersion !== null;
    const latestVersionDesign = latestVersion?.resources?.design ?? null;
    const latestVersionThemeName =
        latestVersionDesign?.designUuid === currentThemeUuid
            ? latestVersionDesign.name
            : null;
    const displayThemeName: string | null = hasThemeChipSource
        ? currentThemeUuid
            ? (orgThemes.find((t) => t.designUuid === currentThemeUuid)?.name ??
              latestVersionThemeName)
            : NO_THEME_LABEL
        : null;

    // User-pinned version override. `null` = follow latest ready (default).
    // We snapshot the app uuid and the latest ready version at the moment of
    // pinning so the pin can self-invalidate via the derived
    // `effectivePinnedVersion` below — no useEffect+setState chain needed
    // (lightdash frontend rule).
    const [pin, setPin] = useState<{
        appUuid: string;
        version: number;
        /** Latest ready version at the moment of pinning. The pin is treated
         *  as cleared once a newer build finishes past this snapshot. */
        pinnedAtLatest: number | null;
    } | null>(null);

    // Effective pinned version after applying invalidation rules:
    //  - pin from a different app (user navigated away) → ignore.
    //  - a newer ready version exists than at pin time → ignore (the user
    //    just authored a fresh prompt; show them the result, not the stale
    //    review state).
    //  - the pinned version is no longer in the ready set → ignore.
    // Polling cycles where latestReadyVersion stays the same are no-ops, so
    // the pin survives normal refetches.
    const effectivePinnedVersion = useMemo(() => {
        if (pin === null || pin.appUuid !== activeAppUuid) return null;
        if (
            pin.pinnedAtLatest !== null &&
            latestReadyVersion !== null &&
            latestReadyVersion.version > pin.pinnedAtLatest
        ) {
            return null;
        }
        const stillReady = allVersions.some(
            (v) => v.version === pin.version && v.status === 'ready',
        );
        return stillReady ? pin.version : null;
    }, [pin, activeAppUuid, latestReadyVersion, allVersions]);

    // Effective preview target: derived pin wins over latest ready.
    const previewApp = useMemo(() => {
        if (!activeAppUuid) return null;
        if (effectivePinnedVersion !== null) {
            return { appUuid: activeAppUuid, version: effectivePinnedVersion };
        }
        if (!latestReadyVersion) return null;
        return { appUuid: activeAppUuid, version: latestReadyVersion.version };
    }, [activeAppUuid, effectivePinnedVersion, latestReadyVersion]);

    // Upgrade offer for the header menu. Keyed to the latest ready bundle —
    // the one an upgrade would rebuild from — not to whatever version the
    // user has pinned the preview to.
    const {
        offer: sdkUpgradeOffer,
        renderedManifest: renderedSdkManifest,
        onSdkManifest: handleSdkManifest,
    } = useSdkUpgradeStatus({
        bundleKey:
            activeAppUuid && latestReadyVersion !== null
                ? `${activeAppUuid}:${latestReadyVersion.version}`
                : null,
        renderedKey: previewApp
            ? `${previewApp.appUuid}:${previewApp.version}`
            : null,
        isRendering:
            previewApp !== null &&
            latestReadyVersion !== null &&
            previewApp.version === latestReadyVersion.version,
    });

    // Pin the preview to a specific version. Captures the current latest as
    // the "pinned-at" snapshot so the derived state can decide later when
    // the pin has become stale.
    const pinPreviewToVersion = useCallback(
        (version: number) => {
            if (!activeAppUuid) return;
            setPin({
                appUuid: activeAppUuid,
                version,
                pinnedAtLatest: latestReadyVersion?.version ?? null,
            });
        },
        [activeAppUuid, latestReadyVersion],
    );

    // Build the `version` prop for an assistant bubble's `ChatBubbleMeta`.
    // Extracted so the arrow-function `onPreview` captures a `number` rather
    // than `number | null` — TS won't carry inline ternary narrowing into a
    // closure, but it does narrow this function's parameter directly.
    const buildBubbleVersionInfo = (bubbleVersion: number) => ({
        version: bubbleVersion,
        isActive: previewApp?.version === bubbleVersion,
        onPreview: () => pinPreviewToVersion(bubbleVersion),
    });

    // Chip listing the custom packages installed for a version's build.
    const renderVersionDepsChip = (bubbleVersion: number) => {
        const vDeps = versionByNumber.get(bubbleVersion)?.dependencies?.custom;
        if (!vDeps || vDeps.length === 0) return null;
        return (
            <Group gap="xs" mt={4}>
                <DepsChip deps={vDeps} />
            </Group>
        );
    };

    // Whether the user is currently looking at a version other than the
    // latest ready one. Drives the "viewing older version" banner.
    const isViewingOlderVersion =
        previewApp !== null &&
        latestReadyVersion !== null &&
        previewApp.version !== latestReadyVersion.version;

    // When the effective preview version changes (auto-bump to a newer
    // build, or a user click pinning an older one), the iframe reloads and
    // re-runs its metric queries from scratch. With "Persist" on we flip
    // in-flight entries to a terminal "interrupted" state — the iframe that
    // would have polled their queryUuids is gone, so they'd otherwise sit
    // non-terminal forever. Without persist we just clear the log.
    //
    // "Persist" deliberately keeps prior versions' `ready` entries visible in
    // the log, so a raw ready-count would inflate/mask the scheduler's app
    // csv/xlsx gate for the version currently previewed. We snapshot the
    // ready-count as a boundary on every switch and subtract it back out via
    // `countReadyQueriesSinceBoundary` wherever the live count is read.
    const lastPreviewVersionRef = useRef<number | null>(null);
    const versionQueryBoundaryRef = useRef(0);
    // Latest-ref so the version-switch effect can snapshot the ready count
    // without re-running on every query event.
    const trackedQueriesRef = useRef(trackedQueries);
    trackedQueriesRef.current = trackedQueries;
    useEffect(() => {
        const next = previewApp?.version ?? null;
        if (lastPreviewVersionRef.current === next) return;
        const prev = lastPreviewVersionRef.current;
        lastPreviewVersionRef.current = next;
        if (prev === null) return; // Initial render — nothing to clean up.
        if (persistLogs) {
            interruptInFlightQueries();
            interruptInFlightRequests();
            versionQueryBoundaryRef.current = trackedQueriesRef.current.filter(
                (q) => q.status === 'ready',
            ).length;
        } else {
            // resetQueries (not clearQueries): the old version's fetch/poll
            // isn't torn down by the iframe reload, so a still-in-flight
            // query's late terminal event must not resurrect as a phantom row.
            resetQueries();
            clearExternalRequests();
            versionQueryBoundaryRef.current = 0;
        }
    }, [
        previewApp?.version,
        persistLogs,
        interruptInFlightQueries,
        resetQueries,
        interruptInFlightRequests,
        clearExternalRequests,
    ]);

    // Manual refresh counter for the preview iframe. The iframe URL embeds
    // this value, so bumping it forces the browser to reload the iframe and
    // re-execute the app's metric queries. Used after the user pushes a
    // semantic-layer change and wants to see it reflected without waiting
    // on the in-progress code-gen iteration.
    const [previewRefreshKey, setPreviewRefreshKey] = useState(0);
    // Set imperatively by the "test with data" panel (later task) when the
    // user runs a query; pushed into the preview iframe so the generated
    // data-app-viz renders with real result rows instead of mock data.
    const [testVizContext, setTestVizContext] =
        useState<DataAppVizContext | null>(null);
    // Latched on by the first manual refresh: a refresh means "show me fresh
    // data", so from then on the preview's queries bypass the warehouse cache.
    // Starts false so the initial load can still serve cached results fast.
    const [invalidatePreviewCache, setInvalidatePreviewCache] = useState(false);
    const handleRefreshPreview = useCallback(() => {
        setPreviewRefreshKey((k) => k + 1);
        setInvalidatePreviewCache(true);
        if (persistLogs) {
            interruptInFlightQueries();
            interruptInFlightRequests();
        } else {
            // resetQueries (not clearQueries): the reload leaves the
            // parent-owned fetch/poll running, so a late terminal event would
            // otherwise land as a phantom row.
            resetQueries();
            clearExternalRequests();
        }
    }, [
        persistLogs,
        interruptInFlightQueries,
        resetQueries,
        interruptInFlightRequests,
        clearExternalRequests,
    ]);

    const scrollToBottom = useCallback(() => {
        // Scroll the chat container itself rather than calling scrollIntoView
        // on a child — scrollIntoView also scrolls outer ancestors (incl. the
        // window), which pulls the navbar/preview banner out of view.
        const el = chatMessagesRef.current;
        el?.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    }, []);

    // Where the user was when they asked for earlier history. Older versions
    // are prepended, so without re-anchoring the chat would jump around and
    // the auto-scroll below would drag them back to the latest message.
    const earlierHistoryAnchorRef = useRef<{
        pageCount: number;
        scrollTop: number;
        scrollHeight: number;
    } | null>(null);
    const loadedPageCount = appData?.pages.length ?? 0;

    const loadEarlierMessages = useCallback(() => {
        if (isFetchingNextPage) return;
        const el = chatMessagesRef.current;
        if (el) {
            earlierHistoryAnchorRef.current = {
                pageCount: loadedPageCount,
                scrollTop: el.scrollTop,
                scrollHeight: el.scrollHeight,
            };
        }
        void fetchNextPage();
    }, [isFetchingNextPage, loadedPageCount, fetchNextPage]);

    useLayoutEffect(() => {
        const anchor = earlierHistoryAnchorRef.current;
        if (anchor) {
            if (loadedPageCount > anchor.pageCount) {
                earlierHistoryAnchorRef.current = null;
                const el = chatMessagesRef.current;
                if (el) {
                    el.scrollTop =
                        anchor.scrollTop +
                        (el.scrollHeight - anchor.scrollHeight);
                }
                return;
            }
            if (isFetchingNextPage) return;
            // The fetch failed; drop the anchor but leave the user where they are.
            earlierHistoryAnchorRef.current = null;
            return;
        }
        scrollToBottom();
    }, [
        messages,
        isLoading,
        loadedPageCount,
        isFetchingNextPage,
        scrollToBottom,
    ]);

    // Revoke all sent image blob URLs on unmount to prevent memory leaks.
    // We don't revoke on fileAttachments change because the URLs may have
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
    // Navigating to a soft-deleted (or never-existed) app's URL. Surface a
    // not-found state before permission checks; missing app metadata cannot
    // produce a meaningful manage decision.
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

    // Chart types have their own builder; use the canonical uuid so slug
    // deep links land on the uuid route.
    if (
        urlAppUuid &&
        appPersistedTemplate === DATA_APP_VIZ_TEMPLATE &&
        activeAppUuid
    ) {
        return (
            <Navigate
                to={chartTypeBuilderPath(projectUuid ?? '', activeAppUuid)}
                replace
            />
        );
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

    if (!projectUuid) {
        return <Box>Missing project UUID</Box>;
    }

    const handleFileAttach = async (file: File, kind?: 'screenshot') => {
        const validationError = await getAppFileValidationError(file);
        if (validationError) {
            showToastError(validationError);
            return;
        }
        const isImage = isSupportedAppImage(file);
        setFileAttachments((prev) => {
            if (prev.length >= MAX_APP_FILES_PER_VERSION) {
                showToastWarning({
                    title: `Attachment limit reached`,
                    subtitle: `You can attach up to ${MAX_APP_FILES_PER_VERSION} files per message.`,
                });
                return prev;
            }
            return [
                ...prev,
                {
                    localId: uuid4(),
                    file,
                    previewUrl: isImage ? URL.createObjectURL(file) : null,
                    kind,
                },
            ];
        });
    };

    const handlePaste = (e: React.ClipboardEvent) => {
        const items = e.clipboardData?.files;
        if (items && items.length > 0) {
            e.preventDefault();
            Array.from(items).forEach((file) => void handleFileAttach(file));
        }
    };

    const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (files) {
            Array.from(files).forEach((file) => void handleFileAttach(file));
        }
        e.target.value = '';
    };

    const clearAttachment = (localId: string) => {
        setFileAttachments((prev) => {
            const removed = prev.find((att) => att.localId === localId);
            if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
            return prev.filter((att) => att.localId !== localId);
        });
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        Array.from(e.dataTransfer.files).forEach(
            (file) => void handleFileAttach(file),
        );
    };

    // Header-menu "Capture thumbnail": saves the preview as the app thumbnail
    // without attaching a screenshot to the next prompt.
    const handleCaptureThumbnail = async () => {
        const capture = previewRef.current?.captureScreenshot;
        if (!capture || !projectUuid || !activeAppUuid) return;
        setIsCapturingScreenshot(true);
        try {
            const file = await capture();
            await uploadThumbnail({
                projectUuid,
                appUuid: activeAppUuid,
                file,
            });
            void queryClient.invalidateQueries({
                queryKey: ['app-thumbnail', projectUuid, activeAppUuid],
            });
            showToastSuccess({ title: 'Thumbnail updated' });
        } catch (err) {
            showToastError({
                title: 'Failed to capture thumbnail',
                subtitle: err instanceof Error ? err.message : 'Unknown error',
            });
        } finally {
            setIsCapturingScreenshot(false);
        }
    };

    const handleCaptureScreenshot = async () => {
        const capture = previewRef.current?.captureScreenshot;
        if (!capture) return;
        setIsCapturingScreenshot(true);
        try {
            const file = await capture();
            if (projectUuid && activeAppUuid) {
                try {
                    await uploadThumbnail({
                        projectUuid,
                        appUuid: activeAppUuid,
                        file,
                    });
                    void queryClient.invalidateQueries({
                        queryKey: ['app-thumbnail', projectUuid, activeAppUuid],
                    });
                } catch (err) {
                    showToastWarning({
                        title: 'Thumbnail not saved',
                        subtitle:
                            err instanceof Error
                                ? err.message
                                : 'Unknown error',
                    });
                }
            }
            void handleFileAttach(file, 'screenshot');
        } catch (err) {
            showToastError({
                title: 'Screenshot failed',
                subtitle: err instanceof Error ? err.message : 'Unknown error',
            });
        } finally {
            setIsCapturingScreenshot(false);
        }
    };

    const handleSubmit = async () => {
        const typed = (promptEditorRef.current?.getText() ?? '').trim();
        if (
            (!typed && elementPicker.refs.length === 0) ||
            isLoading ||
            isSubmittingRef.current
        )
            return;
        // Element references travel as their own lines after the typed text —
        // the same bracketed wire format the agent has always received.
        const trimmed = [typed, ...elementPicker.refs.map(refToWireString)]
            .filter(Boolean)
            .join('\n');

        isSubmittingRef.current = true;
        // Morph the centered composer into the split sidebar layout. Only the
        // first submit of a brand-new app crosses that layout boundary; later
        // iterations are already in the split view and just re-render in place.
        if (newAppLanding) {
            withViewTransition(() => {
                setIsSubmitting(true);
            });
        } else {
            setIsSubmitting(true);
        }

        // Starter template selected in the picker, if any. `data_app_viz` is a
        // template like the others — it flows through the same clarify + build
        // path; the pipeline keys the viz behaviour off the app's stored template.
        const starterTemplate: DataAppTemplate | undefined =
            selectedTemplate ?? undefined;

        try {
            // Send structured chart refs (uuid + per-chart sample-data opt-in).
            // The backend resolves these server-side so the client never sees
            // chart configs or rows.
            const charts =
                selectedCharts.length > 0
                    ? selectedCharts.map((c) => ({
                          uuid: c.uuid,
                          includeSampleData: c.includeSampleData,
                          linkLive: c.linkLive,
                      }))
                    : undefined;
            const externalConnections:
                | AppExternalConnectionReference[]
                | undefined =
                selectedConnections.length > 0
                    ? selectedConnections.map((c) => ({
                          externalConnectionUuid: c.externalConnectionUuid,
                          alias: c.alias,
                      }))
                    : undefined;

            // For new apps, pre-generate the UUID so the image upload and
            // the generate request both use the same app-scoped S3 path.
            const isFirstBuild = !activeAppUuid;
            const targetAppUuid = activeAppUuid ?? uuid4();
            if (isFirstBuild) {
                setThemeChipOverride({
                    appUuid: targetAppUuid,
                    designUuid: selectedThemeUuid,
                });
            }

            // Upload files sequentially. Two reasons we can't run these in parallel:
            // 1. The backend buffers each body to avoid AWS SDK chunked signing,
            //    which MinIO/GCS handle unreliably (RequestTimeout).
            // 2. Concurrent PUTs to the same staging prefix
            //    (apps/{appUuid}/uploads/) hit MinIO's per-prefix lock and fail
            //    with "A timeout occurred while trying to lock a resource".
            // Surface individual failures via toast rather than silently dropping them.
            let fileIds: string[] | undefined;
            if (fileAttachments.length > 0) {
                const ids: string[] = [];
                for (const att of fileAttachments) {
                    try {
                        const result = await uploadFile({
                            projectUuid: projectUuid!,
                            file: att.file,
                            appUuid: targetAppUuid,
                            kind: att.kind,
                        });
                        ids.push(result.fileId);
                    } catch (err) {
                        showToastError({
                            title: 'File upload failed',
                            subtitle:
                                err instanceof Error
                                    ? err.message
                                    : 'Unknown error',
                        });
                    }
                }
                fileIds = ids.length > 0 ? ids : undefined;
                if (ids.length === 0) {
                    return;
                }
            }

            // Capture preview URLs / file chips before clearing — they stay in
            // the message bubble. Also store in the refs so they survive the
            // local→server transition.
            const sentImageUrls = fileAttachments.flatMap((att) =>
                att.previewUrl ? [att.previewUrl] : [],
            );
            if (sentImageUrls.length > 0) {
                sentImagesByPrompt.current.set(trimmed, sentImageUrls);
            }
            const sentFiles: ChatAttachedFile[] = fileAttachments
                .filter((att) => att.previewUrl === null)
                .map((att) => ({ filename: att.file.name || 'attachment' }));
            if (sentFiles.length > 0) {
                sentFilesByPrompt.current.set(trimmed, sentFiles);
            }
            const sentCharts: ChatChart[] = selectedCharts.map((c) => ({
                name: c.name,
                uuid: c.uuid,
                chartKind: c.chartKind,
                linkLive: c.linkLive,
            }));
            if (sentCharts.length > 0) {
                sentChartsByPrompt.current.set(trimmed, sentCharts);
            }
            const sentConnections: ChatConnection[] = selectedConnections.map(
                (c) => ({
                    externalConnectionUuid: c.externalConnectionUuid,
                    name: c.name,
                    alias: c.alias,
                }),
            );
            if (sentConnections.length > 0) {
                sentConnectionsByPrompt.current.set(trimmed, sentConnections);
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
                    ...emptyChatMessage(),
                    role: 'user',
                    content: trimmed,
                    imagePreviewUrls: sentImageUrls,
                    files: sentFiles,
                    charts: sentCharts,
                    externalConnections: sentConnections,
                    dashboardName: sentDashboardName,
                    timestamp: new Date(),
                    userName:
                        [user.data?.firstName, user.data?.lastName]
                            .filter((s): s is string => !!s && s.length > 0)
                            .join(' ') || null,
                    // Snapshot the highest server version known at submit time.
                    // Once history catches up past this number the optimistic
                    // bubble is dropped by `mergeChatMessages` — even if the
                    // brittle `serverVersionCount`-based clear effect misses
                    // a transition.
                    submittedAtVersion: maxHistoryVersion,
                },
            ]);
            promptEditorRef.current?.clear();
            setIsPromptEmpty(true);
            setFileAttachments([]);
            setIsCapturingScreenshot(false);
            setSelectedCharts([]);
            setSelectedDashboard(null);
            setSelectedConnections([]);
            clearElementRefs();
            resetGenerate();
            resetIterate();

            if (activeAppUuid) {
                iterateMutate(
                    {
                        projectUuid,
                        appUuid: activeAppUuid,
                        prompt: trimmed,
                        creationExperience: 'app_builder',
                        fileIds,
                        charts,
                        dashboard,
                        ...modelRequest,
                        externalConnections,
                    },
                    buildSubmitCallbacks(),
                );
            } else {
                // A first build clarifies before generating; the round calls
                // back into runBuildRef once it resolves, answered or not.
                clarification.send({
                    prompt: trimmed,
                    template: starterTemplate,
                    fileIds,
                    appUuid: targetAppUuid,
                    charts,
                    dashboard,
                    externalConnections,
                    spaceUuid: targetSpaceUuid,
                    modelRequest,
                    designUuid: selectedThemeUuid,
                });
            }
        } finally {
            isSubmittingRef.current = false;
            setIsSubmitting(false);
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
                    invalidateAppData(activeAppUuid);
                },
            },
        );
    };

    return (
        <Box className={newAppLanding ? classes.composeLayout : classes.layout}>
            <PanelGroup
                key={newAppLanding ? 'compose' : 'split'}
                direction="horizontal"
            >
                {/* Chat Panel */}
                <Panel
                    defaultSize={newAppLanding ? 100 : 30}
                    minSize={newAppLanding ? 100 : 22}
                    maxSize={newAppLanding ? 100 : 50}
                    data-collapsed={isChatPanelCollapsed || undefined}
                    className={`${classes.chatPanelOuter}${
                        newAppLanding ? ` ${classes.chatPanelOuterCompose}` : ''
                    }`}
                >
                    <Box
                        className={`${classes.chatPanel}${
                            newAppLanding ? ` ${classes.chatPanelCompose}` : ''
                        }`}
                    >
                        {!newAppLanding && (
                            <Box className={classes.sidebarHeader}>
                                <AppBuilderSidebarToggle
                                    collapsed={isChatPanelCollapsed}
                                    onToggle={handleToggleChatPanel}
                                />
                            </Box>
                        )}
                        {newAppLanding && (
                            <Stack gap="lg" className={classes.composeHeading}>
                                <Stack gap={6}>
                                    <Text
                                        fw={600}
                                        fz={28}
                                        className={classes.composeTitle}
                                    >
                                        Build a Data App
                                    </Text>
                                    <Text size="sm" c="dimmed">
                                        Pick a starting point, then describe
                                        what you want to build.
                                    </Text>
                                </Stack>
                                <AppTemplatePicker
                                    selected={selectedTemplate}
                                    onSelectedChange={setSelectedTemplate}
                                />
                            </Stack>
                        )}
                        <Box
                            ref={chatMessagesRef}
                            className={classes.chatMessages}
                        >
                            {hasUnloadedEarlierVersions && (
                                <Group
                                    gap="xs"
                                    justify="center"
                                    p="xs"
                                    onClick={loadEarlierMessages}
                                    className="ld-pointer"
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
                                    {!newAppLanding && (
                                        <Text
                                            size="sm"
                                            c="dimmed"
                                            maw={320}
                                            ta="center"
                                        >
                                            Describe what you want to build and
                                            I'll generate a data app connected
                                            to your project.
                                        </Text>
                                    )}
                                </Box>
                            ) : (
                                <>
                                    <Box
                                        className={`${classes.chatMessageGroup}${
                                            hasPendingClarification
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
                                                        <ChatBubbleMeta
                                                            timestamp={
                                                                msg.timestamp
                                                            }
                                                            userName={
                                                                msg.userName
                                                            }
                                                        />
                                                        {msg.content === '' ? (
                                                            // Uploaded-from-source
                                                            // versions have no
                                                            // prompt to show
                                                            <Text
                                                                inherit
                                                                fs="italic"
                                                                c="dimmed"
                                                            >
                                                                Uploaded a
                                                                locally-built
                                                                version
                                                            </Text>
                                                        ) : (
                                                            <ChatMessageContent
                                                                content={
                                                                    msg.content
                                                                }
                                                            />
                                                        )}
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
                                                                        <Box
                                                                            key={
                                                                                chart.uuid
                                                                            }
                                                                            className={
                                                                                classes.bubbleQueryItem
                                                                            }
                                                                        >
                                                                            <Box
                                                                                className={
                                                                                    classes.bubbleQueryItemIcon
                                                                                }
                                                                            >
                                                                                <MantineIcon
                                                                                    icon={getChartIcon(
                                                                                        chart.chartKind ??
                                                                                            ChartKind.VERTICAL_BAR,
                                                                                    )}
                                                                                    size={
                                                                                        12
                                                                                    }
                                                                                    color="blue.6"
                                                                                />
                                                                            </Box>
                                                                            <Text
                                                                                fw={
                                                                                    500
                                                                                }
                                                                                truncate
                                                                                className={
                                                                                    classes.bubbleQueryItemName
                                                                                }
                                                                            >
                                                                                {
                                                                                    chart.name
                                                                                }
                                                                            </Text>
                                                                            {chart.linkLive && (
                                                                                <MantineIcon
                                                                                    icon={
                                                                                        IconLink
                                                                                    }
                                                                                    size={
                                                                                        12
                                                                                    }
                                                                                    color="blue.6"
                                                                                />
                                                                            )}
                                                                        </Box>
                                                                    ),
                                                                )}
                                                            </Box>
                                                        )}
                                                        {msg.externalConnections
                                                            .length > 0 && (
                                                            <Box
                                                                mt="xs"
                                                                className={
                                                                    classes.bubbleQueryList
                                                                }
                                                            >
                                                                {msg.externalConnections.map(
                                                                    (
                                                                        connection,
                                                                    ) => (
                                                                        <Box
                                                                            key={
                                                                                connection.externalConnectionUuid
                                                                            }
                                                                            className={
                                                                                classes.bubbleQueryItem
                                                                            }
                                                                            title={`Alias: ${connection.alias}`}
                                                                        >
                                                                            <Box
                                                                                className={
                                                                                    classes.bubbleQueryItemIcon
                                                                                }
                                                                            >
                                                                                <MantineIcon
                                                                                    icon={
                                                                                        IconPlugConnected
                                                                                    }
                                                                                    size={
                                                                                        12
                                                                                    }
                                                                                    color="violet.6"
                                                                                />
                                                                            </Box>
                                                                            <Text
                                                                                fw={
                                                                                    500
                                                                                }
                                                                                truncate
                                                                                className={
                                                                                    classes.bubbleQueryItemName
                                                                                }
                                                                            >
                                                                                {
                                                                                    connection.name
                                                                                }
                                                                            </Text>
                                                                        </Box>
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
                                                                <Box
                                                                    className={
                                                                        classes.bubbleQueryItem
                                                                    }
                                                                >
                                                                    <Box
                                                                        className={
                                                                            classes.bubbleQueryItemIcon
                                                                        }
                                                                    >
                                                                        <MantineIcon
                                                                            icon={
                                                                                IconLayoutDashboard
                                                                            }
                                                                            size={
                                                                                12
                                                                            }
                                                                            color="green.6"
                                                                        />
                                                                    </Box>
                                                                    <Text
                                                                        fw={500}
                                                                        truncate
                                                                        className={
                                                                            classes.bubbleQueryItemName
                                                                        }
                                                                    >
                                                                        {
                                                                            msg.dashboardName
                                                                        }
                                                                    </Text>
                                                                </Box>
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
                                                        {msg.files.length >
                                                            0 && (
                                                            <Box
                                                                mt="xs"
                                                                className={
                                                                    classes.bubbleQueryList
                                                                }
                                                            >
                                                                {msg.files.map(
                                                                    (f, fi) => (
                                                                        <Box
                                                                            key={`${f.filename}-${fi}`}
                                                                            className={
                                                                                classes.bubbleQueryItem
                                                                            }
                                                                        >
                                                                            <Box
                                                                                className={
                                                                                    classes.bubbleQueryItemIcon
                                                                                }
                                                                            >
                                                                                <MantineIcon
                                                                                    icon={
                                                                                        IconFileDescription
                                                                                    }
                                                                                    size={
                                                                                        12
                                                                                    }
                                                                                />
                                                                            </Box>
                                                                            <Text
                                                                                fw={
                                                                                    500
                                                                                }
                                                                                truncate
                                                                                className={
                                                                                    classes.bubbleQueryItemName
                                                                                }
                                                                            >
                                                                                {
                                                                                    f.filename
                                                                                }
                                                                            </Text>
                                                                        </Box>
                                                                    ),
                                                                )}
                                                            </Box>
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
                                                    <Box
                                                        className={
                                                            classes.assistantBubble
                                                        }
                                                    >
                                                        <ChatBubbleMeta
                                                            timestamp={
                                                                msg.timestamp
                                                            }
                                                            userName={null}
                                                            version={
                                                                msg.status ===
                                                                    'ready' &&
                                                                msg.version !==
                                                                    null
                                                                    ? buildBubbleVersionInfo(
                                                                          msg.version,
                                                                      )
                                                                    : undefined
                                                            }
                                                            className={
                                                                classes.assistantBubbleMeta
                                                            }
                                                        />
                                                        {msg.version !== null &&
                                                            renderVersionDepsChip(
                                                                msg.version,
                                                            )}
                                                        <AppVersionNarration
                                                            narration={{
                                                                reasoning:
                                                                    msg.reasoning,
                                                                activity:
                                                                    msg.activity,
                                                            }}
                                                            isLive={false}
                                                        />
                                                        {msg.vizSchema ? (
                                                            msg.version !==
                                                                null &&
                                                            msg.version ===
                                                                latestReadyVersion?.version ? (
                                                                <DataAppVizTestPanel
                                                                    projectUuid={
                                                                        projectUuid
                                                                    }
                                                                    schema={
                                                                        msg.vizSchema
                                                                    }
                                                                    onContextChange={
                                                                        setTestVizContext
                                                                    }
                                                                />
                                                            ) : (
                                                                <DataAppVizResultCard
                                                                    schema={
                                                                        msg.vizSchema
                                                                    }
                                                                />
                                                            )
                                                        ) : msg.status !==
                                                          'error' ? (
                                                            <AiMarkdown>
                                                                {msg.content}
                                                            </AiMarkdown>
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
                                    {clarification.pending ? (
                                        <Box
                                            className={classes.clarifyContainer}
                                        >
                                            <Text size="sm">
                                                A few quick questions:
                                            </Text>
                                            <ClarificationQuestionList
                                                questions={
                                                    clarification.pending
                                                        .questions
                                                }
                                                answers={clarification.answers}
                                                onAnswer={clarification.answer}
                                            />
                                            <Group gap="xs" justify="flex-end">
                                                <Button
                                                    variant="subtle"
                                                    size="xs"
                                                    onClick={() =>
                                                        clarification.build(
                                                            true,
                                                        )
                                                    }
                                                >
                                                    Skip
                                                </Button>
                                                <Button
                                                    size="xs"
                                                    onClick={() =>
                                                        clarification.build(
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
                                            <Box>
                                                <Box
                                                    className={
                                                        classes.assistantMessage
                                                    }
                                                >
                                                    <Box
                                                        className={
                                                            classes.assistantBubble
                                                        }
                                                    >
                                                        {isClarifying ? (
                                                            <Text
                                                                size="sm"
                                                                c="dimmed"
                                                            >
                                                                Hold tight, I
                                                                may have some
                                                                questions before
                                                                starting{' '}
                                                                <LoadingDots />
                                                            </Text>
                                                        ) : (
                                                            <>
                                                                <AppVersionNarration
                                                                    narration={
                                                                        liveNarration
                                                                    }
                                                                    isLive
                                                                />
                                                                {latestBuildingVersion?.status ===
                                                                'generating' ? (
                                                                    // A status line here would duplicate the live
                                                                    // previews of the Reasoning/Activity rows above.
                                                                    <Text
                                                                        size="sm"
                                                                        c="dimmed"
                                                                        className={
                                                                            classes.workingLine
                                                                        }
                                                                    >
                                                                        Working
                                                                        on your
                                                                        app —
                                                                        feel
                                                                        free to
                                                                        switch
                                                                        tabs or
                                                                        close
                                                                        this one{' '}
                                                                        <LoadingDots />
                                                                    </Text>
                                                                ) : latestBuildingVersion?.statusMessage ? (
                                                                    <AiMarkdown
                                                                        className={
                                                                            classes.statusMarkdown
                                                                        }
                                                                        components={{
                                                                            p: ({
                                                                                node: _node,
                                                                                children,
                                                                                ...rest
                                                                            }) => (
                                                                                <p
                                                                                    {...rest}
                                                                                >
                                                                                    {
                                                                                        children
                                                                                    }{' '}
                                                                                    <LoadingDots />
                                                                                </p>
                                                                            ),
                                                                        }}
                                                                    >
                                                                        {
                                                                            latestBuildingVersion.statusMessage
                                                                        }
                                                                    </AiMarkdown>
                                                                ) : (
                                                                    <Text
                                                                        size="sm"
                                                                        c="dimmed"
                                                                    >
                                                                        Generating
                                                                        your app{' '}
                                                                        <LoadingDots />
                                                                    </Text>
                                                                )}
                                                            </>
                                                        )}
                                                    </Box>
                                                </Box>
                                            </Box>
                                        )
                                    )}
                                </>
                            )}
                        </Box>

                        {/* Chat Input */}
                        {isViewingOlderVersion && (
                            <Box className={classes.chatInputArea}>
                                <Callout
                                    variant="info"
                                    title={`You're viewing version ${previewApp?.version}`}
                                >
                                    <Text size="sm">
                                        New prompts always continue from the
                                        latest build. Return to version{' '}
                                        {latestReadyVersion?.version}, or
                                        restore this version as the new latest
                                        to keep iterating from here.
                                    </Text>
                                    <Group gap="xs" mt="sm">
                                        <Button
                                            size="xs"
                                            variant="light"
                                            color="blue"
                                            leftSection={
                                                <MantineIcon
                                                    icon={IconArrowBackUp}
                                                    size={12}
                                                />
                                            }
                                            onClick={() => setPin(null)}
                                        >
                                            Return to latest (v
                                            {latestReadyVersion?.version})
                                        </Button>
                                        {previewApp &&
                                            previewApp.version !==
                                                latestReadyVersion?.version && (
                                                <Button
                                                    size="xs"
                                                    variant="outline"
                                                    color="blue"
                                                    leftSection={
                                                        <MantineIcon
                                                            icon={IconRestore}
                                                            size={12}
                                                        />
                                                    }
                                                    disabled={isAgentWorking}
                                                    onClick={() =>
                                                        setRestoreTargetVersion(
                                                            previewApp.version,
                                                        )
                                                    }
                                                >
                                                    Restore this version
                                                </Button>
                                            )}
                                    </Group>
                                </Callout>
                            </Box>
                        )}

                        {!isViewingOlderVersion && (
                            <Box className={classes.chatInputArea}>
                                {/* No `accept` — any text-based file is
                                    allowed regardless of extension; validation
                                    happens in handleFileAttach. */}
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    multiple
                                    onChange={handleFileInputChange}
                                    hidden
                                />
                                {((!newAppLanding &&
                                    (displayTemplate || displayThemeName)) ||
                                    availableConnectionAliases.length > 0) && (
                                    <Group gap="xs" pb="xs">
                                        {!newAppLanding && displayTemplate && (
                                            <TemplateChip
                                                template={displayTemplate}
                                            />
                                        )}
                                        {!newAppLanding && displayThemeName && (
                                            <ThemeChip
                                                themeName={displayThemeName}
                                                selectedThemeUuid={
                                                    currentThemeUuid
                                                }
                                                themes={orgThemes}
                                                disabled={isAgentWorking}
                                                onThemeChange={
                                                    handleThemeChange
                                                }
                                            />
                                        )}
                                        {availableConnectionAliases.length >
                                            0 && (
                                            <AvailableConnectionsChip
                                                aliases={
                                                    availableConnectionAliases
                                                }
                                            />
                                        )}
                                    </Group>
                                )}
                                <Box
                                    onDragOver={handleDragOver}
                                    onDrop={handleDrop}
                                >
                                    <PromptComposer
                                        ref={promptEditorRef}
                                        size="md"
                                        placeholder="Describe the app you want to build..."
                                        autoFocus
                                        // Editable while the agent works so the next prompt
                                        // can be drafted; disabled only during the
                                        // client-side submit, where clear() would wipe text.
                                        disabled={isSubmitting}
                                        submitDisabled={isLoading}
                                        onEmptyChange={setIsPromptEmpty}
                                        onSubmit={() => void handleSubmit()}
                                        onPaste={handlePaste}
                                        attachments={
                                            (selectedCharts.length > 0 ||
                                                selectedDashboard ||
                                                selectedConnections.length >
                                                    0 ||
                                                elementPicker.refs.length > 0 ||
                                                fileAttachments.length > 0) && (
                                                <Box
                                                    className={
                                                        classes.attachedResources
                                                    }
                                                >
                                                    {elementPicker.refs.length >
                                                        0 && (
                                                        <Group gap={4}>
                                                            {elementPicker.refs.map(
                                                                (ref) => (
                                                                    <ElementRefPill
                                                                        key={elementRefKey(
                                                                            ref,
                                                                        )}
                                                                        elementRef={
                                                                            ref
                                                                        }
                                                                        onRemove={() =>
                                                                            elementPicker.remove(
                                                                                ref,
                                                                            )
                                                                        }
                                                                    />
                                                                ),
                                                            )}
                                                        </Group>
                                                    )}
                                                    {selectedConnections.length >
                                                        0 && (
                                                        <Group gap="xs">
                                                            {selectedConnections.map(
                                                                (c) => (
                                                                    <ConnectionChip
                                                                        key={
                                                                            c.externalConnectionUuid
                                                                        }
                                                                        name={
                                                                            c.name
                                                                        }
                                                                        onRemove={() =>
                                                                            setSelectedConnections(
                                                                                (
                                                                                    prev,
                                                                                ) =>
                                                                                    prev.filter(
                                                                                        (
                                                                                            x,
                                                                                        ) =>
                                                                                            x.externalConnectionUuid !==
                                                                                            c.externalConnectionUuid,
                                                                                    ),
                                                                            )
                                                                        }
                                                                    />
                                                                ),
                                                            )}
                                                        </Group>
                                                    )}
                                                    {selectedCharts.length >
                                                        0 && (
                                                        <SelectedQuerySection
                                                            sampleDataEnabled={
                                                                sampleDataEnabled
                                                            }
                                                            charts={
                                                                selectedCharts
                                                            }
                                                            onRemove={(uuid) =>
                                                                setSelectedCharts(
                                                                    (prev) =>
                                                                        prev.filter(
                                                                            (
                                                                                c,
                                                                            ) =>
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
                                                                        prev.map(
                                                                            (
                                                                                c,
                                                                            ) =>
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
                                                            onToggleLink={(
                                                                uuid,
                                                            ) =>
                                                                setSelectedCharts(
                                                                    (prev) =>
                                                                        prev.map(
                                                                            (
                                                                                c,
                                                                            ) =>
                                                                                c.uuid ===
                                                                                uuid
                                                                                    ? {
                                                                                          ...c,
                                                                                          linkLive:
                                                                                              !c.linkLive,
                                                                                          includeSampleData:
                                                                                              c.linkLive
                                                                                                  ? c.includeSampleData
                                                                                                  : false,
                                                                                      }
                                                                                    : c,
                                                                        ),
                                                                )
                                                            }
                                                            disabled={
                                                                isSubmitting
                                                            }
                                                        />
                                                    )}
                                                    {selectedDashboard && (
                                                        <SelectedDashboardSection
                                                            sampleDataEnabled={
                                                                sampleDataEnabled
                                                            }
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
                                                            disabled={
                                                                isSubmitting
                                                            }
                                                        />
                                                    )}
                                                    {fileAttachments.length >
                                                        0 && (
                                                        <SelectedAttachmentSection
                                                            attachments={fileAttachments.map(
                                                                (att) => ({
                                                                    id: att.localId,
                                                                    previewUrl:
                                                                        att.previewUrl,
                                                                    filename:
                                                                        att.file
                                                                            .name,
                                                                }),
                                                            )}
                                                            onRemove={
                                                                clearAttachment
                                                            }
                                                            disabled={
                                                                isSubmitting
                                                            }
                                                            loading={
                                                                isSubmitting
                                                            }
                                                        />
                                                    )}
                                                </Box>
                                            )
                                        }
                                        toolbarLeft={
                                            <Group gap={4}>
                                                <AttachButton
                                                    selectedCharts={
                                                        selectedCharts
                                                    }
                                                    onSelectChart={(chart) =>
                                                        setSelectedCharts(
                                                            (prev) =>
                                                                prev.some(
                                                                    (c) =>
                                                                        c.uuid ===
                                                                        chart.uuid,
                                                                )
                                                                    ? prev
                                                                    : [
                                                                          ...prev,
                                                                          chart,
                                                                      ],
                                                        )
                                                    }
                                                    onDeselectChart={(uuid) =>
                                                        setSelectedCharts(
                                                            (prev) =>
                                                                prev.filter(
                                                                    (c) =>
                                                                        c.uuid !==
                                                                        uuid,
                                                                ),
                                                        )
                                                    }
                                                    selectedDashboard={
                                                        selectedDashboard
                                                    }
                                                    onSelectDashboard={
                                                        setSelectedDashboard
                                                    }
                                                    onDeselectDashboard={() =>
                                                        setSelectedDashboard(
                                                            null,
                                                        )
                                                    }
                                                    selectedConnections={
                                                        selectedConnections
                                                    }
                                                    onSelectConnection={(
                                                        connection,
                                                    ) =>
                                                        setSelectedConnections(
                                                            (prev) => [
                                                                ...prev,
                                                                connection,
                                                            ],
                                                        )
                                                    }
                                                    onDeselectConnection={(
                                                        uuid,
                                                    ) =>
                                                        setSelectedConnections(
                                                            (prev) =>
                                                                prev.filter(
                                                                    (c) =>
                                                                        c.externalConnectionUuid !==
                                                                        uuid,
                                                                ),
                                                        )
                                                    }
                                                    onAddFiles={() =>
                                                        fileInputRef.current?.click()
                                                    }
                                                    disabled={isSubmitting}
                                                    filesDisabled={
                                                        fileAttachments.length >=
                                                        MAX_APP_FILES_PER_VERSION
                                                    }
                                                    linkedAppUuid={
                                                        activeAppUuid
                                                    }
                                                />
                                                {previewApp &&
                                                    screenshotAvailable && (
                                                        <ScreenshotButton
                                                            onClick={() =>
                                                                void handleCaptureScreenshot()
                                                            }
                                                            disabled={
                                                                isSubmitting ||
                                                                fileAttachments.length >=
                                                                    MAX_APP_FILES_PER_VERSION
                                                            }
                                                            loading={
                                                                isCapturingScreenshot
                                                            }
                                                        />
                                                    )}
                                                {elementPicker.available && (
                                                    <ElementPickerButton
                                                        enabled={
                                                            elementPicker.enabled
                                                        }
                                                        onToggle={
                                                            elementPicker.toggle
                                                        }
                                                    />
                                                )}
                                                {newAppLanding && (
                                                    <Divider
                                                        orientation="vertical"
                                                        h={16}
                                                        my="auto"
                                                    />
                                                )}
                                                {newAppLanding && (
                                                    <ThemePicker
                                                        compact
                                                        value={currentThemeUuid}
                                                        onChange={
                                                            handleThemeChange
                                                        }
                                                    />
                                                )}
                                                {newAppLanding &&
                                                    selectedTemplate !==
                                                        null && (
                                                        <Group
                                                            gap={5}
                                                            wrap="nowrap"
                                                            className={
                                                                classes.startingFromChip
                                                            }
                                                            title={`Starting from ${
                                                                getTemplate(
                                                                    selectedTemplate,
                                                                ).title
                                                            }`}
                                                        >
                                                            <MantineIcon
                                                                icon={
                                                                    getTemplate(
                                                                        selectedTemplate,
                                                                    ).icon
                                                                }
                                                                size={14}
                                                            />
                                                            <Text
                                                                span
                                                                size="xs"
                                                                fw={500}
                                                                lh={1.2}
                                                                className={
                                                                    classes.startingFromLabel
                                                                }
                                                            >
                                                                Template:
                                                            </Text>
                                                            <Text
                                                                span
                                                                size="xs"
                                                                fw={600}
                                                                lh={1.2}
                                                                c="inherit"
                                                                lineClamp={1}
                                                            >
                                                                {
                                                                    getTemplate(
                                                                        selectedTemplate,
                                                                    ).title
                                                                }
                                                            </Text>
                                                        </Group>
                                                    )}
                                            </Group>
                                        }
                                        toolbarRight={
                                            <Group gap="xs">
                                                <ModelPicker
                                                    value={selectedModel}
                                                    onChange={handleModelChange}
                                                    codingAgent={codingAgent}
                                                    disabled={
                                                        isSubmitting ||
                                                        isModelVisibilityLoading
                                                    }
                                                    visibleModels={
                                                        visibleModels
                                                    }
                                                />
                                                {isBuilding ? (
                                                    <ComposerSubmitButton
                                                        icon={IconPlayerStop}
                                                        label="Stop generation"
                                                        onClick={handleCancel}
                                                        loading={isCancelling}
                                                    />
                                                ) : (
                                                    <ComposerSubmitButton
                                                        icon={IconArrowUp}
                                                        label="Send message"
                                                        onClick={() =>
                                                            void handleSubmit()
                                                        }
                                                        disabled={
                                                            (isPromptEmpty &&
                                                                elementPicker
                                                                    .refs
                                                                    .length ===
                                                                    0) ||
                                                            isLoading
                                                        }
                                                        loading={
                                                            isSubmitting ||
                                                            isGenerating ||
                                                            isIterating
                                                        }
                                                    />
                                                )}
                                            </Group>
                                        }
                                    />
                                </Box>
                            </Box>
                        )}
                    </Box>
                    {newAppLanding && (
                        <RecentAppSuggestions projectUuid={projectUuid} />
                    )}
                </Panel>

                {!newAppLanding && (
                    <PanelResizeHandle
                        className={classes.resizeHandle}
                        disabled={isChatPanelCollapsed}
                    />
                )}

                {/* Preview Panel */}
                {!newAppLanding && (
                    <Panel minSize={40}>
                        <Box className={classes.previewPanel}>
                            {activeAppUuid && (
                                <AppHeader
                                    projectUuid={projectUuid}
                                    app={{
                                        uuid: activeAppUuid,
                                        name: appName,
                                        description: appDescription || null,
                                        spaceUuid: appSpaceUuid,
                                        spaceName: appSpaceName,
                                        createdByUserUuid: appCreatedByUserUuid,
                                        latestVersionNumber:
                                            latestReadyVersion?.version ?? null,
                                        latestVersionStatus:
                                            latestReadyVersion?.status ?? null,
                                        lastModified: appLastModified,
                                        views: appViews,
                                        slug: appSlug,
                                    }}
                                    rightSection={
                                        <AppHeaderActions
                                            fullscreenToggle={null}
                                            onEdit={null}
                                            shareUrl={null}
                                            projectUuid={projectUuid}
                                            appUuid={activeAppUuid}
                                            upgrade={{
                                                ...sdkUpgradeOffer,
                                                disabled:
                                                    !previewApp ||
                                                    isAgentWorking,
                                            }}
                                            appName={appName}
                                            appDescription={
                                                appDescription || null
                                            }
                                            appSpaceUuid={appSpaceUuid}
                                            appCreatedByUserUuid={
                                                appCreatedByUserUuid
                                            }
                                            latestVersionNumber={
                                                latestReadyVersion?.version ??
                                                null
                                            }
                                            latestVersionStatus={
                                                latestReadyVersion?.status ??
                                                null
                                            }
                                            onRefresh={handleRefreshPreview}
                                            refreshDisabled={!previewApp}
                                            captureThumbnail={{
                                                onCapture: () =>
                                                    void handleCaptureThumbnail(),
                                                disabled:
                                                    !previewApp ||
                                                    !screenshotAvailable ||
                                                    isCapturingScreenshot,
                                            }}
                                            capturePreviewScreenshot={
                                                screenshotAvailable
                                                    ? capturePreviewScreenshot
                                                    : null
                                            }
                                            onViewNetwork={() =>
                                                setNetworkPanelHidden(false)
                                            }
                                            capturedQueryCount={countReadyQueriesSinceBoundary(
                                                trackedQueries,
                                                versionQueryBoundaryRef.current,
                                            )}
                                            onDeleted={() =>
                                                void navigate(
                                                    `/projects/${projectUuid}/apps/generate`,
                                                )
                                            }
                                            navItem={
                                                previewApp ? (
                                                    <Menu.Item
                                                        component={Link}
                                                        to={`/projects/${projectUuid}/apps/${previewApp.appUuid}/view`}
                                                        target="_blank"
                                                        leftSection={
                                                            <MantineIcon
                                                                icon={
                                                                    IconExternalLink
                                                                }
                                                                size={14}
                                                            />
                                                        }
                                                    >
                                                        Preview latest
                                                    </Menu.Item>
                                                ) : null
                                            }
                                            askAiItem={null}
                                        />
                                    }
                                />
                            )}
                            {restoreTargetVersion !== null && activeAppUuid && (
                                <RestoreAppVersionModal
                                    version={restoreTargetVersion}
                                    isLoading={isRestoringVersion}
                                    error={restoreVersionError}
                                    onClose={() => {
                                        setRestoreTargetVersion(null);
                                        resetRestoreVersion();
                                    }}
                                    onConfirm={() =>
                                        restoreVersionMutate(
                                            {
                                                projectUuid,
                                                appUuid: activeAppUuid,
                                                version: restoreTargetVersion,
                                            },
                                            {
                                                onSuccess: () => {
                                                    setRestoreTargetVersion(
                                                        null,
                                                    );
                                                },
                                            },
                                        )
                                    }
                                />
                            )}

                            <Box className={classes.previewContent}>
                                {previewApp ? (
                                    <AppPreview
                                        ref={previewRef}
                                        projectUuid={projectUuid}
                                        appUuid={previewApp.appUuid}
                                        version={previewApp.version}
                                        refreshKey={previewRefreshKey}
                                        invalidateCache={invalidatePreviewCache}
                                        onQueryEvent={handleQueryEvent}
                                        onExternalRequestEvent={
                                            handleExternalRequestEvent
                                        }
                                        {...elementPicker.iframeProps}
                                        onScreenshotAvailabilityChange={
                                            setScreenshotAvailable
                                        }
                                        lineageEnabled={lineageEnabled}
                                        onLineageAvailabilityChange={
                                            setLineageAvailable
                                        }
                                        onLineageSelected={
                                            handleLineageSelected
                                        }
                                        lineageHighlightQueryUuid={
                                            // Hover overrides; falls back to
                                            // the persistent click-selection.
                                            hoveredQueryUuid ?? focusedQueryUuid
                                        }
                                        onLineageCancelled={
                                            handleLineageCancelled
                                        }
                                        dataAppVizContext={
                                            testVizContext ?? undefined
                                        }
                                        onSdkManifest={handleSdkManifest}
                                    />
                                ) : (
                                    <Box className={classes.previewEmpty}>
                                        <IconAppWindow size={48} stroke={1} />
                                        <Text size="sm">
                                            Your app preview will appear here
                                        </Text>
                                    </Box>
                                )}
                                {!networkPanelHidden && (
                                    <AppInspectorPanel
                                        queries={trackedQueries}
                                        projectUuid={projectUuid!}
                                        onClearQueries={clearQueries}
                                        externalRequests={externalRequests}
                                        onClearExternalRequests={
                                            clearExternalRequests
                                        }
                                        persistLogs={persistLogs}
                                        onPersistLogsChange={setPersistLogs}
                                        onDismiss={() =>
                                            setNetworkPanelHidden(true)
                                        }
                                        onHoverQuery={setHoveredQueryUuid}
                                        focusedQueryUuid={focusedQueryUuid}
                                        lineageEnabled={lineageEnabled}
                                        lineageAvailable={lineageAvailable}
                                        lineageSupportedBySdk={
                                            renderedSdkManifest?.features.includes(
                                                'lineage',
                                            ) ?? false
                                        }
                                        onToggleLineage={handleToggleLineage}
                                    />
                                )}
                            </Box>
                        </Box>
                    </Panel>
                )}
            </PanelGroup>
        </Box>
    );
};

export default AppGenerate;
