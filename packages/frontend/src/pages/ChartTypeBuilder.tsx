import {
    ChartType,
    DATA_APP_VIZ_TEMPLATE,
    FeatureFlags,
    isAppVersionInProgress,
    type AppClarification,
    type DataAppVizOptionValue,
    type DataAppVizOptionValues,
} from '@lightdash/common';
import { Box, Button } from '@mantine/core';
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
import { validate as isUuidString } from 'uuid';
import { DocumentTitle } from '../components/common/DocumentTitle';
import SuboptimalState from '../components/common/SuboptimalState/SuboptimalState';
import { getAppVersionFailureMessage } from '../features/apps/getAppVersionFailureMessage';
import { useAppBuildPoller } from '../features/apps/hooks/useAppBuildPoller';
import { useAppVersionHistory } from '../features/apps/hooks/useAppVersionHistory';
import { useCanCreateDataApp } from '../features/apps/hooks/useCanCreateDataApp';
import { useCanEditDataApp } from '../features/apps/hooks/useCanEditDataApp';
import {
    useClarificationRound,
    type ClarifyParams,
} from '../features/apps/hooks/useClarificationRound';
import { useDataAppModelSelection } from '../features/apps/hooks/useDataAppModelSelection';
import { useElapsedClock } from '../features/apps/hooks/useElapsedClock';
import { useGetApp } from '../features/apps/hooks/useGetApp';
import { useSdkUpgradeStatus } from '../features/apps/hooks/useSdkUpgradeStatus';
import { getVersionNarration } from '../features/apps/utils/versionNarration';
import BuilderCanvas from '../features/chartTypes/builder/BuilderCanvas';
import BuilderPromptBar, {
    type BuilderPromptBarHandle,
} from '../features/chartTypes/builder/BuilderPromptBar';
import ChartTypeBuilderHeader from '../features/chartTypes/builder/ChartTypeBuilderHeader';
import ConfigurePanel from '../features/chartTypes/builder/ConfigurePanel';
import VersionHistoryPanel from '../features/chartTypes/builder/VersionHistoryPanel';
import { useDataAppVisualization } from '../features/chartTypes/hooks/useDataAppVisualization';
import {
    useDataAppVizBuild,
    type VizBuildRequest,
} from '../features/chartTypes/hooks/useDataAppVizBuild';
import { buildSampleVizContext } from '../features/chartTypes/utils/sampleVizContext';
import { useResolvedColorPalette } from '../hooks/appearance/useResolvedColorPalette';
import {
    getExplorerUrlFromCreateSavedChartVersion,
    parseChartFromExplorerSearchParams,
} from '../hooks/useExplorerRoute';
import { useServerFeatureFlag } from '../hooks/useServerOrClientFeatureFlag';
import classes from './ChartTypeBuilder.module.css';

const noop = () => undefined;

/**
 * The dedicated chart type builder. Mounted at both `chart-types/new`
 * (create) and `chart-types/:dataAppVizUuid` (edit); the create flow
 * adopts the new uuid into the URL once the first build is accepted.
 */
const toVizClarifyParams = (request: VizBuildRequest): ClarifyParams => ({
    prompt: request.description,
    template: DATA_APP_VIZ_TEMPLATE,
    fileIds: request.fileIds.length > 0 ? request.fileIds : undefined,
});

const ChartTypeBuilder: FC = () => {
    const { projectUuid, dataAppVizUuid: urlVizUuid } = useParams<{
        projectUuid: string;
        dataAppVizUuid?: string;
    }>();
    const location = useLocation();
    const navigate = useNavigate();
    const explorerChart = useMemo(() => {
        try {
            const chart = parseChartFromExplorerSearchParams(location.search);
            return chart?.tableName ? chart : null;
        } catch {
            return null;
        }
    }, [location.search]);
    const dataAppsFlag = useServerFeatureFlag(FeatureFlags.EnableDataApps);
    const canCreate = useCanCreateDataApp(projectUuid);

    // `useGetApp` accepts slugs, so the raw URL param is the right key.
    const appQuery = useGetApp(projectUuid, urlVizUuid);
    const appMeta = appQuery.data?.pages[0] ?? null;
    // The uuid every uuid-keyed hook runs against; a slug URL resolves to it
    // once the app row loads.
    const activeVizUuid =
        appMeta?.appUuid ??
        (isUuidString(urlVizUuid ?? '') ? urlVizUuid : undefined);

    const build = useDataAppVizBuild({
        projectUuid,
        // No chart query here; auto-mapping belongs to charts binding fields.
        itemsMap: {},
        dataAppVizUuid: activeVizUuid ?? null,
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
        isFirstBuild: activeVizUuid === undefined,
        toClarifyParams: toVizClarifyParams,
        onBuild: onClarifiedBuild,
    });
    const { reset: resetClarification } = clarification;

    const historyUuid = activeVizUuid ?? build.appUuid;
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
        appUuid: activeVizUuid ?? null,
        latestVersionModel:
            history.latest?.resources?.codexModel ??
            history.latest?.resources?.claudeModel ??
            null,
    });
    const { clearPick: clearModelPick } = modelSelection;

    // On `/new`, move to the edit route as soon as the build claims an app so
    // a refresh mid-build lands on the in-progress version.
    useEffect(() => {
        if (!urlVizUuid && build.appUuid && projectUuid) {
            void navigate(
                {
                    pathname: `/projects/${projectUuid}/chart-types/${build.appUuid}`,
                    search: location.search,
                },
                { replace: true },
            );
        }
    }, [urlVizUuid, build.appUuid, projectUuid, location.search, navigate]);

    // Intentional navigation between vizs resets session state; the
    // post-submit `/new` → uuid replace must not.
    const prevUrlVizUuid = useRef(urlVizUuid);
    const latestDraftAppUuid = useRef(build.draftAppUuid);
    latestDraftAppUuid.current = build.draftAppUuid;
    const [promptSessionKey, setPromptSessionKey] = useState(
        () => urlVizUuid ?? build.draftAppUuid,
    );
    const [pin, setPin] = useState<{
        appUuid: string;
        version: number;
        /** Latest ready version at the moment of pinning; the pin is treated
         *  as cleared once a newer build finishes past this snapshot. */
        pinnedAtLatest: number | null;
    } | null>(null);
    // Only what the author explicitly changed; defaults resolve at render.
    const [optionValues, setOptionValues] = useState<DataAppVizOptionValues>(
        {},
    );
    // Preview-only; a chart using the viz owns the palette the normal way.
    const [colorPaletteUuid, setColorPaletteUuid] = useState<string | null>(
        null,
    );
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);
    useEffect(() => {
        const prev = prevUrlVizUuid.current;
        prevUrlVizUuid.current = urlVizUuid;
        // Post-submit redirect: undefined → new uuid. Don't clear state.
        if (!prev && urlVizUuid) return;
        setPromptSessionKey(urlVizUuid ?? latestDraftAppUuid.current);
        setPin(null);
        setOptionValues({});
        setColorPaletteUuid(null);
        setIsHistoryOpen(false);
        clearModelPick();
        resetClarification();
    }, [urlVizUuid, clearModelPick, resetClarification]);

    const isBuilding = build.isBuilding || historyLatestInProgress;
    const liveNarration = useMemo(
        () =>
            getVersionNarration(
                historyLatestInProgress
                    ? history.latest?.statusHistory
                    : undefined,
            ),
        [history.latest, historyLatestInProgress],
    );

    // A build started elsewhere needs polling here; a build sent from this
    // page already polls inside useDataAppVizBuild.
    const externalBuildRunning = !build.isBuilding && historyLatestInProgress;
    useAppBuildPoller(
        projectUuid,
        historyUuid ?? undefined,
        externalBuildRunning,
        noop,
    );

    // Derived pin: ignored when it belongs to another app, a newer version
    // landed since, or the pinned version is no longer ready.
    const effectiveViewedVersion = useMemo(() => {
        if (pin === null || pin.appUuid !== activeVizUuid) return null;
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
    }, [pin, activeVizUuid, history.latestReadyVersion, history.versions]);

    const previewVersion = effectiveViewedVersion ?? history.latestReadyVersion;
    const { offer: sdkUpgradeOffer, onSdkManifest: handleSdkManifest } =
        useSdkUpgradeStatus({
            bundleKey:
                activeVizUuid && history.latestReadyVersion !== null
                    ? `${activeVizUuid}:${history.latestReadyVersion}`
                    : null,
            renderedKey:
                activeVizUuid && previewVersion !== null
                    ? `${activeVizUuid}:${previewVersion}`
                    : null,
            isRendering:
                previewVersion !== null &&
                previewVersion === history.latestReadyVersion,
        });

    // The schema follows the preview: the options beside a version are the ones
    // that version declares, and the sample data is built from its fields.
    const { data: dataAppViz, isFetching: isFetchingSchema } =
        useDataAppVisualization(projectUuid, activeVizUuid, previewVersion);

    const colorPalette = useResolvedColorPalette(projectUuid, colorPaletteUuid);
    // The sample-data preview context, rebuilt on any option or palette edit.
    const previewContext = useMemo(
        () =>
            dataAppViz?.schema
                ? buildSampleVizContext(
                      dataAppViz.schema,
                      colorPalette,
                      optionValues,
                  )
                : null,
        [dataAppViz?.schema, colorPalette, optionValues],
    );

    const handleOptionChange = useCallback(
        (name: string, value: DataAppVizOptionValue) =>
            setOptionValues((prev) => ({ ...prev, [name]: value })),
        [],
    );

    const handleView = useCallback(
        (version: number | null) => {
            if (version === null) {
                setPin(null);
                return;
            }
            if (!activeVizUuid) return;
            setPin({
                appUuid: activeVizUuid,
                version,
                pinnedAtLatest: history.latestReadyVersion,
            });
        },
        [activeVizUuid, history.latestReadyVersion],
    );

    // The panel is the only place an older version can be selected, so it is
    // also the only place that can show you are off the current one — closing
    // it returns the preview to current rather than stranding the pin.
    const handleCloseHistory = useCallback(() => {
        setIsHistoryOpen(false);
        setPin(null);
    }, []);

    const promptBarRef = useRef<BuilderPromptBarHandle>(null);
    const handlePickExample = useCallback(
        (prompt: string) => promptBarRef.current?.setPrompt(prompt),
        [],
    );
    const explorerDestination = useMemo(() => {
        if (!explorerChart || !activeVizUuid) return null;

        return getExplorerUrlFromCreateSavedChartVersion(
            projectUuid,
            {
                ...explorerChart,
                chartConfig: {
                    type: ChartType.DATA_APP_VIZ,
                    config: {
                        dataAppVizUuid: activeVizUuid,
                        fieldMapping: {},
                        optionValues: {},
                    },
                },
            },
            false,
        );
    }, [activeVizUuid, explorerChart, projectUuid]);
    const handlePreviewInExplorer = useCallback(() => {
        if (!activeVizUuid) return;

        if (explorerDestination) {
            void navigate(explorerDestination);
            return;
        }

        void navigate(
            `/projects/${projectUuid}/tables?dataAppVizUuid=${activeVizUuid}`,
        );
    }, [activeVizUuid, explorerDestination, navigate, projectUuid]);

    const canEdit = useCanEditDataApp(projectUuid, {
        spaceUuid: appMeta?.spaceUuid ?? null,
        createdByUserUuid: appMeta?.createdByUserUuid ?? null,
    });

    if (!projectUuid) return null;
    if (dataAppsFlag.isLoading) return null;
    if (!dataAppsFlag.data?.enabled) {
        return <Navigate to={`/projects/${projectUuid}/home`} replace />;
    }

    const isCreateFlow = urlVizUuid === undefined && build.appUuid === null;
    if (isCreateFlow && !canCreate) {
        return <Navigate to={`/projects/${projectUuid}/gallery`} replace />;
    }

    if (appQuery.error?.error.statusCode === 404) {
        return (
            <Box className={classes.root}>
                <Box className={classes.content}>
                    <SuboptimalState
                        title="Chart type not found"
                        description="It may have been deleted, or the link is wrong."
                        action={
                            <Button
                                component={Link}
                                to={`/projects/${projectUuid}/gallery`}
                                variant="default"
                            >
                                Back to the gallery
                            </Button>
                        }
                    />
                </Box>
            </Box>
        );
    }

    if (appMeta) {
        // A data app that isn't a chart type belongs in the app builder.
        if (appMeta.template !== DATA_APP_VIZ_TEMPLATE) {
            return (
                <Navigate
                    to={`/projects/${projectUuid}/apps/${appMeta.appUuid}`}
                    replace
                />
            );
        }
        if (!canEdit) {
            return <Navigate to={`/projects/${projectUuid}/gallery`} replace />;
        }
    }

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

    const provenanceVersion = history.hasOrigin
        ? history.oldest
        : history.latest;

    // Always beside the chart it configures; remounted per viz so the selected
    // tab belongs to the declaration on screen.
    const configurePanel = dataAppViz?.schema ? (
        <ConfigurePanel
            key={activeVizUuid}
            schema={dataAppViz.schema}
            optionValues={optionValues}
            onOptionChange={handleOptionChange}
            colorPaletteUuid={colorPaletteUuid}
            onPaletteChange={setColorPaletteUuid}
            isStale={isFetchingSchema}
        />
    ) : null;

    const hasHistory =
        activeVizUuid !== undefined && history.versions.length > 0;

    // The composer captures its placeholder at mount, so wait for history
    // before choosing create vs revise wording.
    const isPromptBarMounted = !(activeVizUuid && history.isLoading);
    const backLink = explorerChart
        ? {
              label: 'Explorer',
              to: explorerDestination ?? {
                  pathname: `/projects/${projectUuid}/tables/${explorerChart.tableName}`,
                  search: location.search,
              },
          }
        : {
              label: 'Gallery',
              to: `/projects/${projectUuid}/gallery`,
          };

    return (
        <Box className={classes.root}>
            <DocumentTitle title="Chart type builder" />
            <ChartTypeBuilderHeader
                projectUuid={projectUuid}
                backLink={backLink}
                app={appMeta}
                latestReadyVersion={history.latestReadyVersion}
                provenanceVersion={provenanceVersion}
                hasOrigin={history.hasOrigin}
                hasHistory={hasHistory}
                isHistoryOpen={isHistoryOpen}
                upgrade={
                    activeVizUuid && history.latestReadyVersion !== null
                        ? { ...sdkUpgradeOffer, disabled: isBuilding }
                        : null
                }
                onUpgradeStarted={() => setIsHistoryOpen(true)}
                onToggleHistory={() =>
                    isHistoryOpen
                        ? handleCloseHistory()
                        : setIsHistoryOpen(true)
                }
                onPreviewInExplorer={handlePreviewInExplorer}
            />
            <PanelGroup direction="horizontal" className={classes.main}>
                <Panel id="chart-type-builder-canvas" order={1} minSize={50}>
                    <Box className={classes.content}>
                        <BuilderCanvas
                            projectUuid={projectUuid}
                            appUuid={activeVizUuid ?? null}
                            previewVersion={previewVersion}
                            isBuilding={isBuilding}
                            failureMessage={failureMessage}
                            isClarifyRoundOpen={
                                clarification.clarifyingPrompt !== null ||
                                clarification.pending !== null
                            }
                            clarifierUnavailable={clarification.fellThrough}
                            previewContext={previewContext}
                            configurePanel={configurePanel}
                            onPickExample={
                                isPromptBarMounted ? handlePickExample : null
                            }
                            onSdkManifest={handleSdkManifest}
                        />
                        {isPromptBarMounted && (
                            <BuilderPromptBar
                                ref={promptBarRef}
                                sessionKey={promptSessionKey}
                                projectUuid={projectUuid}
                                composerAppUuid={
                                    activeVizUuid ??
                                    build.appUuid ??
                                    build.draftAppUuid
                                }
                                hasVersions={history.versions.length > 0}
                                isBuilding={isBuilding}
                                buildingPrompt={buildingPrompt}
                                elapsed={elapsed}
                                latestReadyVersion={history.latestReadyVersion}
                                build={build}
                                onCancelBuild={onCancelBuild}
                                narration={liveNarration}
                                modelSelection={modelSelection}
                                clarification={clarification}
                            />
                        )}
                    </Box>
                </Panel>
                {hasHistory && isHistoryOpen && (
                    <>
                        <PanelResizeHandle
                            className={classes.historyResizeHandle}
                            aria-label="Resize version history"
                        />
                        <Panel
                            id="chart-type-builder-history"
                            order={2}
                            defaultSize={20}
                            minSize={15}
                            maxSize={50}
                            className={classes.historyPanel}
                        >
                            <VersionHistoryPanel
                                projectUuid={projectUuid}
                                appUuid={activeVizUuid}
                                versions={history.versions}
                                latestReadyVersion={history.latestReadyVersion}
                                viewedVersion={effectiveViewedVersion}
                                onView={handleView}
                                onClose={handleCloseHistory}
                                build={build}
                                hasEarlier={history.hasEarlier}
                                isFetchingEarlier={history.isFetchingEarlier}
                                fetchEarlier={history.fetchEarlier}
                            />
                        </Panel>
                    </>
                )}
            </PanelGroup>
        </Box>
    );
};

export default ChartTypeBuilder;
