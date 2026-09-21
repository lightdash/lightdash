import {
    ChartType,
    DATA_APP_VIZ_TEMPLATE,
    FeatureFlags,
    type ItemsMap,
    type ResultRow,
} from '@lightdash/common';
import { Box, Button } from '@mantine/core';
import { useEffect, useMemo, useState, type FC } from 'react';
import {
    Link,
    Navigate,
    useBlocker,
    useLocation,
    useNavigate,
    useParams,
    type To,
} from 'react-router';
import { validate as isUuidString } from 'uuid';
import { DocumentTitle } from '../components/common/DocumentTitle';
import SuboptimalState from '../components/common/SuboptimalState/SuboptimalState';
import { useCanCreateDataApp } from '../features/apps/hooks/useCanCreateDataApp';
import { useCanEditDataApp } from '../features/apps/hooks/useCanEditDataApp';
import { useGetApp } from '../features/apps/hooks/useGetApp';
import BuildInProgressExitModal from '../features/chartTypes/builder/BuildInProgressExitModal';
import ChartInputsPanel from '../features/chartTypes/builder/ChartInputsPanel';
import ChartTypeBuilderHeader from '../features/chartTypes/builder/ChartTypeBuilderHeader';
import ChartTypeBuilderWorkspace from '../features/chartTypes/builder/ChartTypeBuilderWorkspace';
import ConfigurePanel from '../features/chartTypes/builder/ConfigurePanel';
import PreviewDataOverlay, {
    type PreviewDataOverlayReason,
} from '../features/chartTypes/builder/PreviewDataOverlay';
import PreviewDataPill from '../features/chartTypes/builder/PreviewDataPill';
import PreviewDataStatus from '../features/chartTypes/builder/PreviewDataStatus';
import { type PreviewDataSource } from '../features/chartTypes/builder/previewDataTypes';
import { useChartTypeAuthoringExit } from '../features/chartTypes/builder/useChartTypeAuthoringExit';
import { useChartTypeBuilderWorkspace } from '../features/chartTypes/builder/useChartTypeBuilderWorkspace';
import { useChartTypePreviewData } from '../features/chartTypes/builder/useChartTypePreviewData';
import { useConfigurePanelState } from '../features/chartTypes/builder/useConfigurePanelState';
import ChartTypePreviewTableModal from '../features/chartTypes/components/ChartTypePreviewTableModal';
import { useDataAppVizResolvedColors } from '../features/chartTypes/hooks/useDataAppVizResolvedColors';
import { chartTypeBuilderPath } from '../features/chartTypes/utils/chartTypeBuilderPath';
import { buildExplorerVizContext } from '../features/chartTypes/utils/explorerVizContext';
import { buildSampleVizContext } from '../features/chartTypes/utils/sampleVizContext';
import { vizBuildSampleRows } from '../features/chartTypes/utils/vizBuildSampleRows';
import { useResolvedColorPalette } from '../hooks/appearance/useResolvedColorPalette';
import {
    getExplorerUrlFromCreateSavedChartVersion,
    parseChartFromExplorerSearchParams,
} from '../hooks/useExplorerRoute';
import { useProjectUuid } from '../hooks/useProjectUuid';
import { useServerFeatureFlag } from '../hooks/useServerOrClientFeatureFlag';
import classes from './ChartTypeBuilder.module.css';

// No chart query here; auto-mapping belongs to charts binding fields.
const NO_ITEMS: ItemsMap = {};
const NO_ROWS: ResultRow[] = [];

/** Set on the `/new` -> `/:dataAppVizUuid` redirect so "created in this
 *  session" survives that route change (a fresh mount reads it back). */
type ChartTypeBuilderLocationState = {
    createdInSession: boolean;
};

/**
 * The dedicated chart type builder. Mounted at both `chart-types/new`
 * (create) and `chart-types/:dataAppVizUuid` (edit); the create flow
 * adopts the new uuid into the URL once the first build is accepted.
 */
const ChartTypeBuilder: FC = () => {
    const { dataAppVizUuid: urlVizUuid } = useParams();
    const projectUuid = useProjectUuid();
    const location = useLocation();
    const navigate = useNavigate();
    const [isPreviewTableOpen, setIsPreviewTableOpen] = useState(false);
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

    const workspace = useChartTypeBuilderWorkspace({
        projectUuid,
        dataAppVizUuid: activeVizUuid ?? null,
        creationExperience: 'chart_type_builder',
        itemsMap: NO_ITEMS,
    });
    const { build, history, isBuilding, isHistoryOpen } = workspace;
    const panel = useConfigurePanelState(activeVizUuid ?? null);

    // Read back from location state, which survives the route's own remount.
    const createdInSession = Boolean(
        (location.state as ChartTypeBuilderLocationState | null)
            ?.createdInSession,
    );

    // On `/new`, move to the edit route once the build claims an app.
    useEffect(() => {
        if (!urlVizUuid && build.appUuid && projectUuid) {
            void navigate(
                {
                    pathname: chartTypeBuilderPath(projectUuid, build.appUuid),
                    search: location.search,
                },
                {
                    replace: true,
                    state: {
                        createdInSession: true,
                    } satisfies ChartTypeBuilderLocationState,
                },
            );
        }
    }, [urlVizUuid, build.appUuid, projectUuid, location.search, navigate]);

    const colorPalette = useResolvedColorPalette(
        projectUuid,
        panel.colorPaletteUuid,
    );

    const schema = workspace.dataAppViz?.schema ?? null;
    const previewData = useChartTypePreviewData({ projectUuid, schema });
    const [isDataMenuOpen, setIsDataMenuOpen] = useState(false);
    const liveRun = previewData.run.status === 'ready' ? previewData.run : null;
    const liveRows = liveRun?.rows ?? NO_ROWS;
    const liveItemsMap = liveRun?.itemsMap ?? NO_ITEMS;
    const livePivotDetails = liveRun?.pivotDetails ?? null;
    const resolvedColors = useDataAppVizResolvedColors({
        itemsMap: liveItemsMap,
        rows: liveRows,
        fieldMapping: previewData.fieldMapping,
        pivotDetails: livePivotDetails,
        colorPalette,
    });
    // Live rows only once they fit the version on screen; sample data is the
    // always-available fallback, and it is always labelled as such.
    const isPreviewLive =
        previewData.previewDataSource.kind === 'live' && liveRun !== null;
    const previewContext = useMemo(() => {
        if (!schema) return null;
        return isPreviewLive
            ? buildExplorerVizContext({
                  schema,
                  itemsMap: liveItemsMap,
                  persistedFieldMapping: previewData.fieldMapping,
                  rows: liveRows,
                  pivotDetails: livePivotDetails,
                  colorPalette,
                  optionValues: panel.optionValues,
                  resolvedColors,
              })
            : buildSampleVizContext(schema, colorPalette, panel.optionValues);
    }, [
        schema,
        isPreviewLive,
        liveItemsMap,
        liveRows,
        livePivotDetails,
        previewData.fieldMapping,
        colorPalette,
        panel.optionValues,
        resolvedColors,
    ]);
    const previewDataSource: PreviewDataSource | null = previewContext
        ? previewData.previewDataSource
        : null;
    // The builder agent sees the binding the author does. Only while the
    // latest version is on screen, so browsing history still builds against
    // the schema the workspace resolves for itself.
    const currentBuildContext =
        schema &&
        previewData.selection.kind === 'query' &&
        workspace.viewedVersion === null
            ? { schema, fieldMapping: previewData.fieldMapping }
            : undefined;
    const sampleRows = useMemo(
        () =>
            isPreviewLive
                ? vizBuildSampleRows(liveRows, previewData.fieldMapping)
                : [],
        [isPreviewLive, liveRows, previewData.fieldMapping],
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

    const canEdit = useCanEditDataApp(projectUuid, {
        spaceUuid: appMeta?.spaceUuid ?? null,
        createdByUserUuid: appMeta?.createdByUserUuid ?? null,
    });

    // Falls back to `build.appUuid` for the window before the redirect below
    // adopts it, while the URL is still `/new`.
    const exit = useChartTypeAuthoringExit({
        projectUuid,
        dataAppVizUuid: activeVizUuid ?? build.appUuid ?? null,
        createdInSession,
        isBuilding: build.isBuilding,
        draft: build.draft,
        discard: build.discard,
        latestReadyVersion: history.latestReadyVersion,
        isHistoryLoading: history.isLoading,
        // Also a version building server-side this session did not start.
        isLatestVersionInProgress: isBuilding,
    });

    // Browser back/forward and other in-app links, not the `/new` -> `/:uuid`
    // redirect, which stays inside this same builder session.
    const blocker = useBlocker(({ currentLocation, nextLocation }) => {
        if (!isBuilding) return false;
        if (currentLocation.pathname === nextLocation.pathname) return false;
        return (
            !build.appUuid ||
            !projectUuid ||
            nextLocation.pathname !==
                chartTypeBuilderPath(projectUuid, build.appUuid)
        );
    });

    if (!projectUuid) return null;
    if (dataAppsFlag.isLoading) return null;
    if (!dataAppsFlag.data?.enabled) {
        return <Navigate to={`/projects/${projectUuid}/home`} replace />;
    }

    const isCreateFlow = urlVizUuid === undefined && build.appUuid === null;
    if (isCreateFlow && !canCreate) {
        return <Navigate to={`/projects/${projectUuid}/chart-types`} replace />;
    }

    if (appQuery.error?.error.statusCode === 404) {
        return (
            <Box className={classes.root}>
                <Box className={classes.notFound}>
                    <SuboptimalState
                        title="Chart type not found"
                        description="It may have been deleted, or the link is wrong."
                        action={
                            <Button
                                component={Link}
                                to={`/projects/${projectUuid}/chart-types`}
                                variant="default"
                            >
                                Back to chart types
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
            return (
                <Navigate to={`/projects/${projectUuid}/chart-types`} replace />
            );
        }
        // Server-enforced (registry apps are read-only); this only keeps
        // the builder UI from being reached for an official chart type.
        if (appMeta.registrySlug !== null) {
            return (
                <Navigate to={`/projects/${projectUuid}/chart-types`} replace />
            );
        }
    }

    const selection = previewData.selection;
    const overlayReason: PreviewDataOverlayReason | null =
        previewData.fit.status === 'doesNotFit'
            ? {
                  kind: 'doesNotFit',
                  issues: previewData.fit.issues,
                  itemsMap: previewData.itemsMap,
              }
            : previewData.fit.status === 'unavailable'
              ? { kind: 'unavailable', message: previewData.fit.message }
              : null;
    const chartInputs =
        schema &&
        schema.fields.length > 0 &&
        selection.kind === 'query' &&
        previewData.metricQuery ? (
            <ChartInputsPanel
                fields={schema.fields}
                itemsMap={previewData.itemsMap}
                fieldMapping={previewData.fieldMapping}
                exploreLabel={previewData.exploreLabel ?? selection.exploreName}
                onChangeExplore={
                    selection.savedChart === null
                        ? () => setIsDataMenuOpen(true)
                        : null
                }
                metricQuery={previewData.metricQuery}
                run={previewData.run}
                fit={previewData.fit}
                onSetField={previewData.setField}
                onRun={previewData.runQuery}
            />
        ) : null;

    // Remounted per viz so the selected tab belongs to the declaration on screen.
    const configurePanel = schema ? (
        <ConfigurePanel
            key={activeVizUuid}
            schema={schema}
            optionValues={panel.optionValues}
            onOptionChange={panel.onOptionChange}
            colorPaletteUuid={panel.colorPaletteUuid}
            onPaletteChange={panel.onPaletteChange}
            resolvedColorPalette={colorPalette}
            isStale={workspace.isFetchingSchema}
            chartInputs={chartInputs}
        />
    ) : null;

    const chartTypeGalleryPath = `/projects/${projectUuid}/chart-types`;
    // While building, the blocker owns the confirm and cleanup instead.
    const cleanupIfIdle = () => {
        if (!isBuilding) exit.cleanupAbandonedType();
    };
    const handleDone = () => {
        cleanupIfIdle();
        void navigate(chartTypeGalleryPath);
    };

    const backLink = explorerChart
        ? {
              label: 'Explorer',
              to:
                  explorerDestination ??
                  ({
                      pathname: `/projects/${projectUuid}/tables/${explorerChart.tableName}`,
                      search: location.search,
                  } satisfies To),
          }
        : {
              label: 'Chart types',
              to: chartTypeGalleryPath,
          };

    return (
        <Box className={classes.root}>
            <DocumentTitle title="Chart Studio" />
            <ChartTypeBuilderHeader
                projectUuid={projectUuid}
                appUuidOrSlug={urlVizUuid}
                backLink={backLink}
                onBackLinkClick={cleanupIfIdle}
                app={appMeta}
                latestReadyVersion={history.latestReadyVersion}
                hasHistory={workspace.hasHistory}
                isHistoryOpen={isHistoryOpen}
                isBuilding={isBuilding}
                upgrade={
                    activeVizUuid && history.latestReadyVersion !== null
                        ? { ...workspace.sdkUpgradeOffer, disabled: isBuilding }
                        : null
                }
                onUpgradeStarted={workspace.openHistory}
                onToggleHistory={workspace.toggleHistory}
                onDone={handleDone}
                previewInExplorerLink={explorerDestination}
                onPreviewInExplorer={
                    activeVizUuid ? () => setIsPreviewTableOpen(true) : null
                }
            />
            <ChartTypeBuilderWorkspace
                projectUuid={projectUuid}
                workspace={workspace}
                previewContext={previewContext}
                previewDataSource={previewDataSource}
                previewSourceExtra={
                    <PreviewDataStatus
                        selection={selection}
                        run={previewData.run}
                        fit={previewData.fit}
                        hasDeclaredInputs={previewData.hasDeclaredInputs}
                        onOpenDataMenu={() => setIsDataMenuOpen(true)}
                        onRefresh={previewData.runQuery}
                    />
                }
                previewOverlay={
                    overlayReason ? (
                        <PreviewDataOverlay
                            reason={overlayReason}
                            onUseSampleData={previewData.selectSample}
                        />
                    ) : null
                }
                dataPill={
                    <PreviewDataPill
                        projectUuid={projectUuid}
                        selection={selection}
                        exploreLabel={previewData.exploreLabel}
                        boundFieldCount={previewData.boundFieldCount}
                        isNotRun={previewData.run.status !== 'ready'}
                        fields={schema?.fields ?? []}
                        disabled={isBuilding}
                        opened={isDataMenuOpen}
                        onOpenedChange={setIsDataMenuOpen}
                        onSelectSample={previewData.selectSample}
                        onSelectSavedChart={previewData.selectSavedChart}
                        onSelectExplore={previewData.selectExplore}
                    />
                }
                sampleRows={sampleRows}
                currentBuildContext={currentBuildContext}
                syncPreviewUrlState
                configurePanel={configurePanel}
            />
            {isPreviewTableOpen && activeVizUuid && (
                <ChartTypePreviewTableModal
                    projectUuid={projectUuid}
                    dataAppVizUuid={activeVizUuid}
                    registrySlug={appMeta?.registrySlug ?? null}
                    onClose={() => setIsPreviewTableOpen(false)}
                />
            )}
            {blocker.state === 'blocked' && (
                <BuildInProgressExitModal
                    exitDiscardsBuild={exit.exitDiscardsBuild}
                    onKeepBuilding={() => blocker.reset()}
                    onConfirmExit={() => {
                        exit.cleanupAbandonedType();
                        blocker.proceed();
                    }}
                />
            )}
        </Box>
    );
};

export default ChartTypeBuilder;
