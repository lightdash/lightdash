import {
    DATA_APP_VIZ_TEMPLATE,
    isAppVersionInProgress,
    type AppClarification,
    type AppChartReference,
    type DataAppCreationExperience,
    type DataAppViz,
    type DataAppVizSchema,
    type ItemsMap,
} from '@lightdash/common';
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type RefObject,
} from 'react';
import { getAppVersionFailureMessage } from '../../apps/getAppVersionFailureMessage';
import { useAppBuildPoller } from '../../apps/hooks/useAppBuildPoller';
import { type SdkManifest } from '../../apps/hooks/useAppSdkBridge';
import {
    useAppVersionHistory,
    type AppVersionHistory,
} from '../../apps/hooks/useAppVersionHistory';
import {
    useClarificationRound,
    type ClarificationRound,
    type ClarifyParams,
} from '../../apps/hooks/useClarificationRound';
import {
    useDataAppModelSelection,
    type DataAppModelSelection,
} from '../../apps/hooks/useDataAppModelSelection';
import { useElapsedClock } from '../../apps/hooks/useElapsedClock';
import {
    useSdkUpgradeStatus,
    type SdkUpgradeOffer,
} from '../../apps/hooks/useSdkUpgradeStatus';
import {
    getVersionNarration,
    type AppVersionNarrationData,
} from '../../apps/utils/versionNarration';
import { useDataAppVisualization } from '../hooks/useDataAppVisualization';
import {
    useDataAppVizBuild,
    type DataAppVizBuildState,
    type VizBuildRequest,
} from '../hooks/useDataAppVizBuild';
import { useOrganizationChartTypeSchema } from '../hooks/useOrganizationChartTypeSchema';
import {
    type ChartTypeBuildTarget,
    type ChartTypeOwner,
} from '../utils/chartTypeOwner';
import { type BuilderPromptBarHandle } from './BuilderPromptBar';

const noop = () => undefined;

export type ChartTypeBuilderWorkspaceArgs = {
    projectUuid: string | undefined;
    /** Where builds are sent: the project, or the organization library. */
    target: ChartTypeBuildTarget;
    /** The viz being revised; null while authoring a new one. A host that
     *  adopts the uuid a first build claims passes it back here without
     *  resetting the session. */
    dataAppVizUuid: string | null;
    /** The surface builds are reported from in analytics. */
    creationExperience: DataAppCreationExperience;
    /** Result columns the build binds fields against; {} when no query
     *  backs the session. */
    itemsMap: ItemsMap;
    /** Saved chart backing an Explorer-hosted builder, when one exists. */
    chartReference?: AppChartReference;
};

export type ChartTypeBuilderWorkspaceState = {
    owner: ChartTypeOwner;
    dataAppVizUuid: string | null;
    build: DataAppVizBuildState;
    clarification: ClarificationRound<VizBuildRequest>;
    history: AppVersionHistory;
    modelSelection: DataAppModelSelection;
    isBuilding: boolean;
    buildingPrompt: string | null;
    elapsed: string | null;
    narration: AppVersionNarrationData;
    onCancelBuild: (() => void) | null;
    failureMessage: string | null;
    isClarifyRoundOpen: boolean;
    /** The version the preview renders; null when nothing is renderable. */
    previewVersion: number | null;
    /** The pinned version from history; null when following the current one. */
    viewedVersion: number | null;
    onViewVersion: (version: number | null) => void;
    /** The previewed project viz; undefined for organization chart types,
     *  whose routes have no visualization detail. */
    dataAppViz: DataAppViz | undefined;
    /** The schema of the previewed version. */
    schema: DataAppVizSchema | null;
    isFetchingSchema: boolean;
    hasHistory: boolean;
    isHistoryOpen: boolean;
    openHistory: () => void;
    closeHistory: () => void;
    toggleHistory: () => void;
    /** An opened viz whose history has not loaded: neither new nor ready. */
    isLoadingExisting: boolean;
    isPromptBarMounted: boolean;
    promptSessionKey: string;
    /** Whether the next prompt carries the run's rows: the composer's
     *  sample-data button, read wherever the source is described. */
    includeSampleData: boolean;
    setIncludeSampleData: (included: boolean) => void;
    composerAppUuid: string;
    sdkUpgradeOffer: SdkUpgradeOffer;
    onSdkManifest: (manifest: SdkManifest) => void;
    promptBarRef: RefObject<BuilderPromptBarHandle | null>;
    onPickExample: ((prompt: string) => void) | null;
};

/** The builder session without its host: build, clarify, history and the
 *  previewed version. Hosts supply the uuid and what the preview renders against. */
export const useChartTypeBuilderWorkspace = ({
    projectUuid,
    target,
    dataAppVizUuid,
    creationExperience,
    itemsMap,
    chartReference,
}: ChartTypeBuilderWorkspaceArgs): ChartTypeBuilderWorkspaceState => {
    const build = useDataAppVizBuild({
        projectUuid,
        target,
        creationExperience,
        chartReference,
        itemsMap,
        dataAppVizUuid,
        // Selection is the host's explicit act; nothing binds on landing.
        onCreated: noop,
    });

    // Depend on the send function, not on `build` — that is a fresh object
    // every render, so the memo would never hold.
    const sendBuild = build.send;
    const onClarifiedBuild = useCallback(
        (request: VizBuildRequest, clarifications: AppClarification[]) =>
            sendBuild({ ...request, clarifications }),
        [sendBuild],
    );

    const toClarifyParams = useCallback(
        (request: VizBuildRequest): ClarifyParams => ({
            prompt: request.description,
            template: DATA_APP_VIZ_TEMPLATE,
            fileIds: request.fileIds.length > 0 ? request.fileIds : undefined,
            target,
        }),
        [target],
    );

    // Questions only before the first build: once a version exists, intent is
    // grounded in what is on screen.
    const clarification = useClarificationRound<VizBuildRequest>({
        projectUuid,
        isFirstBuild: dataAppVizUuid === null,
        toClarifyParams,
        onBuild: onClarifiedBuild,
    });
    const { reset: resetClarification } = clarification;

    const historyUuid = dataAppVizUuid ?? build.appUuid;
    const history = useAppVersionHistory(
        projectUuid ?? '',
        historyUuid,
        target.owner,
    );

    // Covers builds sent here and builds found already running in history.
    const historyLatestInProgress =
        history.latest !== null &&
        isAppVersionInProgress(history.latest.status);
    const buildStartedAt =
        build.startedAt ??
        (historyLatestInProgress && history.latest
            ? new Date(history.latest.createdAt)
            : null);
    const elapsed = useElapsedClock(buildStartedAt);

    // The model the next prompt builds with; the latest version's own model
    // pre-selects it, so reopening a chart type keeps building the way it was.
    const modelSelection = useDataAppModelSelection({
        appUuid: dataAppVizUuid,
        latestVersionModel:
            history.latest?.resources?.codexModel ??
            history.latest?.resources?.claudeModel ??
            null,
    });
    const { clearPick: clearModelPick } = modelSelection;

    // Intentional navigation between vizs resets session state; a host
    // adopting the uuid a first build claimed (null → uuid) must not.
    const prevVizUuid = useRef(dataAppVizUuid);
    const latestDraftAppUuid = useRef(build.draftAppUuid);
    latestDraftAppUuid.current = build.draftAppUuid;
    const [promptSessionKey, setPromptSessionKey] = useState(
        () => dataAppVizUuid ?? build.draftAppUuid,
    );
    const [pin, setPin] = useState<{
        appUuid: string;
        version: number;
        /** Latest ready version at the moment of pinning; the pin is treated
         *  as cleared once a newer build finishes past this snapshot. */
        pinnedAtLatest: number | null;
    } | null>(null);
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);
    const [includeSampleData, setIncludeSampleData] = useState(false);
    useEffect(() => {
        const prev = prevVizUuid.current;
        prevVizUuid.current = dataAppVizUuid;
        if (prev === null && dataAppVizUuid !== null) return;
        setPromptSessionKey(dataAppVizUuid ?? latestDraftAppUuid.current);
        setPin(null);
        setIsHistoryOpen(false);
        setIncludeSampleData(false);
        clearModelPick();
        resetClarification();
    }, [dataAppVizUuid, clearModelPick, resetClarification]);

    const isBuilding = build.isBuilding || historyLatestInProgress;
    const narration = useMemo(
        () =>
            getVersionNarration(
                historyLatestInProgress
                    ? history.latest?.statusHistory
                    : undefined,
            ),
        [history.latest, historyLatestInProgress],
    );

    // A build started elsewhere needs polling here; a build sent from this
    // session already polls inside useDataAppVizBuild.
    const externalBuildRunning = !build.isBuilding && historyLatestInProgress;
    useAppBuildPoller(
        projectUuid,
        historyUuid ?? undefined,
        externalBuildRunning,
        noop,
        target.owner,
    );

    // Derived pin: ignored when it belongs to another app, a newer version
    // landed since, or the pinned version is no longer ready.
    const viewedVersion = useMemo(() => {
        if (pin === null || pin.appUuid !== dataAppVizUuid) return null;
        if (
            pin.pinnedAtLatest !== null &&
            history.latestReadyVersion !== null &&
            history.latestReadyVersion > pin.pinnedAtLatest
        ) {
            return null;
        }
        const stillReady = history.versions.some(
            (v) => v.version === pin.version && v.status === 'ready',
        );
        return stillReady ? pin.version : null;
    }, [pin, dataAppVizUuid, history.latestReadyVersion, history.versions]);

    const previewVersion = viewedVersion ?? history.latestReadyVersion;
    const { offer: sdkUpgradeOffer, onSdkManifest } = useSdkUpgradeStatus({
        target: 'chart_type',
        bundleKey:
            dataAppVizUuid && history.latestReadyVersion !== null
                ? `${dataAppVizUuid}:${history.latestReadyVersion}`
                : null,
        renderedKey:
            dataAppVizUuid && previewVersion !== null
                ? `${dataAppVizUuid}:${previewVersion}`
                : null,
        isRendering:
            previewVersion !== null &&
            previewVersion === history.latestReadyVersion,
    });

    // The schema follows the preview: the options beside a version are the
    // ones that version declares.
    const isOrganization = target.owner === 'organization';
    const projectVizQuery = useDataAppVisualization(
        projectUuid,
        isOrganization ? null : dataAppVizUuid,
        previewVersion,
    );
    const organizationSchemaQuery = useOrganizationChartTypeSchema(
        isOrganization ? dataAppVizUuid : null,
        previewVersion,
    );
    const dataAppViz = projectVizQuery.data;
    const schema = isOrganization
        ? (organizationSchemaQuery.data ?? null)
        : (dataAppViz?.schema ?? null);
    const isFetchingSchema = isOrganization
        ? organizationSchemaQuery.isFetching
        : projectVizQuery.isFetching;

    const onViewVersion = useCallback(
        (version: number | null) => {
            if (version === null) {
                setPin(null);
                return;
            }
            if (!dataAppVizUuid) return;
            setPin({
                appUuid: dataAppVizUuid,
                version,
                pinnedAtLatest: history.latestReadyVersion,
            });
        },
        [dataAppVizUuid, history.latestReadyVersion],
    );

    const openHistory = useCallback(() => setIsHistoryOpen(true), []);
    // The panel is the only place an older version can be selected, so it is
    // also the only place that can show you are off the current one — closing
    // it returns the preview to current rather than stranding the pin.
    const closeHistory = useCallback(() => {
        setIsHistoryOpen(false);
        setPin(null);
    }, []);
    const toggleHistory = useCallback(
        () => (isHistoryOpen ? closeHistory() : openHistory()),
        [isHistoryOpen, closeHistory, openHistory],
    );

    const promptBarRef = useRef<BuilderPromptBarHandle>(null);
    const onPickExample = useCallback(
        (prompt: string) => promptBarRef.current?.setPrompt(prompt),
        [],
    );

    // The request in flight, or the stored prompt of a build found in history.
    const buildingPrompt =
        build.pendingPrompt ??
        (historyLatestInProgress ? (history.latest?.prompt ?? null) : null);
    // A first build on a brand-new viz is discarded whole; a revision is only
    // cancelled. Builds found in history (started elsewhere) offer no cancel.
    const onCancelBuild = build.isBuilding
        ? build.draft !== null
            ? build.discard
            : build.cancel
        : null;

    // With nothing renderable, the newest terminal version explains itself.
    const failureMessage =
        history.latestReadyVersion === null &&
        history.latest !== null &&
        !isAppVersionInProgress(history.latest.status) &&
        history.latest.status !== 'ready'
            ? getAppVersionFailureMessage(history.latest)
            : null;

    const hasHistory = dataAppVizUuid !== null && history.versions.length > 0;

    // An opened viz waits for its history before showing anything; a viz this
    // session's first build claimed is already on screen.
    const isLoadingExisting =
        dataAppVizUuid !== null &&
        history.isLoading &&
        build.appUuid !== dataAppVizUuid;
    // Wait for history so the composer never opens with create wording.
    const isPromptBarMounted = !isLoadingExisting;

    return {
        owner: target.owner,
        dataAppVizUuid,
        build,
        clarification,
        history,
        modelSelection,
        isBuilding,
        buildingPrompt,
        elapsed,
        narration,
        onCancelBuild,
        failureMessage,
        isClarifyRoundOpen:
            clarification.clarifyingPrompt !== null ||
            clarification.pending !== null,
        previewVersion,
        viewedVersion,
        onViewVersion,
        dataAppViz,
        schema,
        isFetchingSchema,
        hasHistory,
        isHistoryOpen,
        openHistory,
        closeHistory,
        toggleHistory,
        isLoadingExisting,
        isPromptBarMounted,
        promptSessionKey,
        includeSampleData,
        setIncludeSampleData,
        composerAppUuid: dataAppVizUuid ?? build.appUuid ?? build.draftAppUuid,
        sdkUpgradeOffer,
        onSdkManifest,
        promptBarRef,
        onPickExample: isPromptBarMounted ? onPickExample : null,
    };
};
