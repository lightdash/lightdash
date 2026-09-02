import {
    DATA_APP_VIZ_TEMPLATE,
    isAppVersionInProgress,
    type AppClarification,
    type DataAppCreationExperience,
    type DataAppViz,
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
import { type BuilderPromptBarHandle } from './BuilderPromptBar';

const noop = () => undefined;

const toVizClarifyParams = (request: VizBuildRequest): ClarifyParams => ({
    prompt: request.description,
    template: DATA_APP_VIZ_TEMPLATE,
    fileIds: request.fileIds.length > 0 ? request.fileIds : undefined,
});

export type ChartTypeBuilderWorkspaceArgs = {
    projectUuid: string | undefined;
    /** The viz being revised; null while authoring a new one. A host that
     *  adopts the uuid a first build claims passes it back here without
     *  resetting the session. */
    dataAppVizUuid: string | null;
    /** The surface builds are reported from in analytics. */
    creationExperience: DataAppCreationExperience;
    /** Result columns the build binds fields against; {} when no query
     *  backs the session. */
    itemsMap: ItemsMap;
};

export type ChartTypeBuilderWorkspaceState = {
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
    /** The schema of the previewed version. */
    dataAppViz: DataAppViz | undefined;
    isFetchingSchema: boolean;
    hasHistory: boolean;
    isHistoryOpen: boolean;
    openHistory: () => void;
    closeHistory: () => void;
    toggleHistory: () => void;
    isPromptBarMounted: boolean;
    promptSessionKey: string;
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
    dataAppVizUuid,
    creationExperience,
    itemsMap,
}: ChartTypeBuilderWorkspaceArgs): ChartTypeBuilderWorkspaceState => {
    const build = useDataAppVizBuild({
        projectUuid,
        creationExperience,
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

    // Questions only before the first build: once a version exists, intent is
    // grounded in what is on screen.
    const clarification = useClarificationRound<VizBuildRequest>({
        projectUuid,
        isFirstBuild: dataAppVizUuid === null,
        toClarifyParams: toVizClarifyParams,
        onBuild: onClarifiedBuild,
    });
    const { reset: resetClarification } = clarification;

    const historyUuid = dataAppVizUuid ?? build.appUuid;
    const history = useAppVersionHistory(projectUuid ?? '', historyUuid);

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
    useEffect(() => {
        const prev = prevVizUuid.current;
        prevVizUuid.current = dataAppVizUuid;
        if (prev === null && dataAppVizUuid !== null) return;
        setPromptSessionKey(dataAppVizUuid ?? latestDraftAppUuid.current);
        setPin(null);
        setIsHistoryOpen(false);
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
    const { data: dataAppViz, isFetching: isFetchingSchema } =
        useDataAppVisualization(projectUuid, dataAppVizUuid, previewVersion);

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

    // The composer captures its placeholder at mount, so wait for history
    // before choosing create vs revise wording.
    const isPromptBarMounted = !(dataAppVizUuid && history.isLoading);

    return {
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
        isFetchingSchema,
        hasHistory,
        isHistoryOpen,
        openHistory,
        closeHistory,
        toggleHistory,
        isPromptBarMounted,
        promptSessionKey,
        composerAppUuid: dataAppVizUuid ?? build.appUuid ?? build.draftAppUuid,
        sdkUpgradeOffer,
        onSdkManifest,
        promptBarRef,
        onPickExample: isPromptBarMounted ? onPickExample : null,
    };
};
