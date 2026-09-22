import {
    assertUnreachable,
    ChartType,
    DATA_APP_VIZ_TEMPLATE,
    FeatureFlags,
    getItemLabelWithoutTableName,
    type AppChartReference,
    type DataAppVizFieldMapping,
    type ItemsMap,
    type ResultRow,
} from '@lightdash/common';
import { Box, Button } from '@mantine/core';
import { useCallback, useEffect, useMemo, useState, type FC } from 'react';
import {
    Link,
    Navigate,
    useLocation,
    useNavigate,
    useParams,
    useSearchParams,
} from 'react-router';
import { validate as isUuidString } from 'uuid';
import { DocumentTitle } from '../components/common/DocumentTitle';
import SuboptimalState from '../components/common/SuboptimalState/SuboptimalState';
import { useCanCreateDataApp } from '../features/apps/hooks/useCanCreateDataApp';
import { useCanEditDataApp } from '../features/apps/hooks/useCanEditDataApp';
import { useGetApp } from '../features/apps/hooks/useGetApp';
import {
    type ChartInputsBinding,
    type ChartTypePreviewDataSource,
} from '../features/chartTypes/builder/ChartInputsList';
import ChartTypeBuilderHeader from '../features/chartTypes/builder/ChartTypeBuilderHeader';
import ChartTypeBuilderWorkspace from '../features/chartTypes/builder/ChartTypeBuilderWorkspace';
import {
    ChartTypeRowsModal,
    type ChartTypeRows,
} from '../features/chartTypes/builder/ChartTypeSampleData';
import ConfigurePanel from '../features/chartTypes/builder/ConfigurePanel';
import {
    type PickedSavedChart,
    type SavedChartSourceControls,
} from '../features/chartTypes/builder/savedChartSource';
import { useChartTypeBuilderWorkspace } from '../features/chartTypes/builder/useChartTypeBuilderWorkspace';
import { useConfigurePanelState } from '../features/chartTypes/builder/useConfigurePanelState';
import { useSavedChartPreviewData } from '../features/chartTypes/builder/useSavedChartPreviewData';
import ChartTypePreviewTableModal from '../features/chartTypes/components/ChartTypePreviewTableModal';
import { type VizBuildRequest } from '../features/chartTypes/hooks/useDataAppVizBuild';
import { useDataAppVizResolvedColors } from '../features/chartTypes/hooks/useDataAppVizResolvedColors';
import {
    autoMapDataAppVizFields,
    reconcileDataAppVizFieldMapping,
} from '../features/chartTypes/utils/autoMapDataAppVizFields';
import { chartTypeBuilderPath } from '../features/chartTypes/utils/chartTypeBuilderPath';
import { buildExplorerVizContext } from '../features/chartTypes/utils/explorerVizContext';
import { buildSampleVizContext } from '../features/chartTypes/utils/sampleVizContext';
import { savedChartExamplePrompts } from '../features/chartTypes/utils/savedChartExamplePrompts';
import { vizBuildSampleRows } from '../features/chartTypes/utils/vizBuildSampleRows';
import { useResolvedColorPalette } from '../hooks/appearance/useResolvedColorPalette';
import useToaster from '../hooks/toaster/useToaster';
import {
    getExplorerUrlFromCreateSavedChartVersion,
    parseChartFromExplorerSearchParams,
} from '../hooks/useExplorerRoute';
import { useOptionalProjectRoute } from '../hooks/useProjectRoute';
import { useProjectUuid } from '../hooks/useProjectUuid';
import { useServerFeatureFlag } from '../hooks/useServerOrClientFeatureFlag';
import classes from './ChartTypeBuilder.module.css';

// Stable identities, so the workspace does not rebind between renders.
const NO_ITEMS: ItemsMap = {};
const NO_ROWS: ResultRow[] = [];
const NO_MAPPING: DataAppVizFieldMapping = {};
const NO_SAMPLE_ROWS: Record<string, string>[] = [];

/** The saved chart a create session starts from, kept in the URL so a refresh
 *  and the `/new` → `/chart-types/:uuid` move both keep the selection. */
const SAVED_CHART_PARAM = 'savedChartUuid';

/**
 * The dedicated chart type builder. Mounted at both `chart-types/new`
 * (create) and `chart-types/:dataAppVizUuid` (edit); the create flow
 * adopts the new uuid into the URL once the first build is accepted.
 */
const ChartTypeBuilder: FC = () => {
    const { dataAppVizUuid: urlVizUuid } = useParams();
    const projectUuid = useProjectUuid();
    const projectRoute = useOptionalProjectRoute();
    const projectUrlIdentifier =
        projectRoute?.projectUrlIdentifier ?? projectUuid;
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

    const [searchParams] = useSearchParams();
    const savedChartUuid = searchParams.get(SAVED_CHART_PARAM);
    const { data: previewData, retry: retryPreview } = useSavedChartPreviewData(
        { projectUuid, savedChartUuid },
    );
    const liveRun = previewData.status === 'ready' ? previewData : null;
    const itemsMap = liveRun?.itemsMap ?? NO_ITEMS;
    // The run's rows, listable before any version declares a schema.
    const liveRows = useMemo<ChartTypeRows | null>(
        () =>
            liveRun
                ? {
                      rows: liveRun.rows,
                      pivotDetails: liveRun.pivotDetails,
                      labels: Object.fromEntries(
                          Object.entries(liveRun.itemsMap).map(([id, item]) => [
                              id,
                              getItemLabelWithoutTableName(item),
                          ]),
                      ),
                  }
                : null,
        [liveRun],
    );
    const [isRowsModalOpen, setIsRowsModalOpen] = useState(false);
    // Slots the author rebound by hand, layered over the automap.
    const [fieldMappingOverrides, setFieldMappingOverrides] =
        useState<DataAppVizFieldMapping>(NO_MAPPING);

    // The backend resolves the chart so the build sees its fields and
    // formatting; rows only travel when the composer's chip says so.
    const chartReference = useMemo<AppChartReference | undefined>(
        () =>
            savedChartUuid !== null
                ? { uuid: savedChartUuid, includeSampleData: false }
                : undefined,
        [savedChartUuid],
    );

    const workspace = useChartTypeBuilderWorkspace({
        projectUuid,
        dataAppVizUuid: activeVizUuid ?? null,
        creationExperience: 'chart_type_builder',
        itemsMap,
        chartReference,
    });
    const { build, history, isBuilding, isHistoryOpen } = workspace;
    const panel = useConfigurePanelState(activeVizUuid ?? null);

    const setSavedChartParam = useCallback(
        (uuid: string | null) => {
            const next = new URLSearchParams(location.search);
            if (uuid === null) next.delete(SAVED_CHART_PARAM);
            else next.set(SAVED_CHART_PARAM, uuid);
            setFieldMappingOverrides(NO_MAPPING);
            void navigate(
                { pathname: location.pathname, search: next.toString() },
                { replace: true },
            );
        },
        [location.pathname, location.search, navigate],
    );

    const { showToastError } = useToaster();
    const previewError =
        previewData.status === 'error' ? previewData.message : null;
    useEffect(() => {
        if (previewError === null) return;
        showToastError({
            title: 'Could not load the saved chart data',
            subtitle: previewError,
        });
    }, [previewError, showToastError]);

    // On `/new`, move to the edit route as soon as the build claims an app so
    // a refresh mid-build lands on the in-progress version.
    useEffect(() => {
        if (!urlVizUuid && build.appUuid && projectUrlIdentifier) {
            void navigate(
                {
                    pathname: chartTypeBuilderPath(
                        projectUrlIdentifier,
                        build.appUuid,
                    ),
                    search: location.search,
                },
                { replace: true },
            );
        }
    }, [
        urlVizUuid,
        build.appUuid,
        projectUrlIdentifier,
        location.search,
        navigate,
    ]);

    const colorPalette = useResolvedColorPalette(
        projectUuid,
        panel.colorPaletteUuid,
    );
    const schema = workspace.dataAppViz?.schema ?? null;
    // Automap first, then whatever the author rebound in the sidebar.
    const previewFieldMapping = useMemo(() => {
        if (!schema || !liveRun) return NO_MAPPING;
        const automapped = autoMapDataAppVizFields(
            schema.fields,
            liveRun.itemsMap,
        );
        return reconcileDataAppVizFieldMapping(
            schema.fields,
            liveRun.itemsMap,
            {
                ...automapped,
                ...fieldMappingOverrides,
            },
        );
    }, [schema, liveRun, fieldMappingOverrides]);
    const resolvedColors = useDataAppVizResolvedColors({
        itemsMap,
        rows: liveRun?.rows ?? NO_ROWS,
        fieldMapping: previewFieldMapping,
        pivotDetails: liveRun?.pivotDetails ?? null,
        colorPalette,
    });
    // Real rows when the saved chart's query has run; the fabricated sample
    // otherwise. Rebuilt on any option or palette edit.
    const previewContext = useMemo(() => {
        if (!schema) return null;
        if (!liveRun) {
            return buildSampleVizContext(
                schema,
                colorPalette,
                panel.optionValues,
            );
        }
        return buildExplorerVizContext({
            schema,
            itemsMap: liveRun.itemsMap,
            persistedFieldMapping: previewFieldMapping,
            rows: liveRun.rows,
            pivotDetails: liveRun.pivotDetails,
            colorPalette,
            optionValues: panel.optionValues,
            resolvedColors,
        });
    }, [
        schema,
        liveRun,
        colorPalette,
        panel.optionValues,
        resolvedColors,
        previewFieldMapping,
    ]);

    // What the next build is told it is changing: the schema on screen, bound
    // to the columns the run returned.
    const latestReadySchema =
        history.versions.find(
            (version) => version.version === history.latestReadyVersion,
        )?.resources?.vizSchema ??
        (workspace.viewedVersion === null && !workspace.isFetchingSchema
            ? schema
            : null);
    const buildFieldMapping = useMemo(() => {
        if (!latestReadySchema || !liveRun) return NO_MAPPING;
        const automapped = autoMapDataAppVizFields(
            latestReadySchema.fields,
            liveRun.itemsMap,
        );
        return reconcileDataAppVizFieldMapping(
            latestReadySchema.fields,
            liveRun.itemsMap,
            { ...automapped, ...fieldMappingOverrides },
        );
    }, [latestReadySchema, liveRun, fieldMappingOverrides]);
    const currentBuildContext: VizBuildRequest['context'] =
        liveRun && latestReadySchema
            ? { schema: latestReadySchema, fieldMapping: buildFieldMapping }
            : undefined;
    const sampleRows = useMemo(
        () =>
            liveRun
                ? vizBuildSampleRows(liveRun.rows, buildFieldMapping)
                : NO_SAMPLE_ROWS,
        [liveRun, buildFieldMapping],
    );

    const previewDataSource = useMemo<ChartTypePreviewDataSource>(() => {
        switch (previewData.status) {
            case 'notRun':
                return { kind: 'sample' };
            case 'running':
                return { kind: 'loading', chartName: previewData.chartName };
            case 'error':
                return {
                    kind: 'error',
                    chartName: previewData.chartName,
                    message: previewData.message,
                };
            case 'ready':
                return {
                    kind: 'live',
                    chartName: previewData.chartName,
                    rowCount: previewData.rowCount,
                };
            default:
                return assertUnreachable(
                    previewData,
                    'Unknown saved chart preview status',
                );
        }
    }, [previewData]);

    // One object for every surface that offers the saved chart: the canvas
    // card, the composer chip and the sidebar.
    const savedChartSource = useMemo<SavedChartSourceControls>(() => {
        const attach = (chart: PickedSavedChart) =>
            setSavedChartParam(chart.uuid);
        const controls = {
            attach,
            detach: () => setSavedChartParam(null),
            viewRows: () => setIsRowsModalOpen(true),
            retry: retryPreview,
        };
        switch (previewData.status) {
            case 'notRun':
                return { ...controls, attached: null };
            case 'running':
                return {
                    ...controls,
                    attached: {
                        status: 'running',
                        chartName: previewData.chartName ?? 'Saved chart',
                        spaceName: previewData.spaceName,
                        rowCount: null,
                        columns: [],
                        ranAt: null,
                        message: null,
                    },
                };
            case 'error':
                return {
                    ...controls,
                    attached: {
                        status: 'error',
                        chartName: previewData.chartName ?? 'Saved chart',
                        spaceName: previewData.spaceName,
                        rowCount: null,
                        columns: [],
                        ranAt: null,
                        message: previewData.message,
                    },
                };
            case 'ready':
                return {
                    ...controls,
                    attached: {
                        status: 'ready',
                        chartName: previewData.chartName ?? 'Saved chart',
                        spaceName: previewData.spaceName,
                        rowCount: previewData.rowCount,
                        columns: previewData.columns,
                        ranAt: previewData.ranAt,
                        message: null,
                    },
                };
            default:
                return assertUnreachable(
                    previewData,
                    'Unknown saved chart preview status',
                );
        }
    }, [previewData, retryPreview, setSavedChartParam]);

    const inputsBinding = useMemo<ChartInputsBinding | null>(
        () =>
            liveRun
                ? {
                      itemsMap: liveRun.itemsMap,
                      fieldMapping: previewFieldMapping,
                      onFieldChange: (fieldName, fieldId) =>
                          setFieldMappingOverrides((current) => ({
                              ...current,
                              // An empty array is an explicit clear, for a
                              // single slot as much as a multiple one.
                              [fieldName]: fieldId ?? [],
                          })),
                  }
                : null,
        [liveRun, previewFieldMapping],
    );

    const examplePrompts = useMemo(
        () => (liveRun ? savedChartExamplePrompts(liveRun.itemsMap) : null),
        [liveRun],
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

    if (!projectUuid) return null;
    if (dataAppsFlag.isLoading) return null;
    if (!dataAppsFlag.data?.enabled) {
        return (
            <Navigate to={`/projects/${projectUrlIdentifier}/home`} replace />
        );
    }

    const isCreateFlow = urlVizUuid === undefined && build.appUuid === null;
    if (isCreateFlow && !canCreate) {
        return (
            <Navigate
                to={`/projects/${projectUrlIdentifier}/chart-types`}
                replace
            />
        );
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
                                to={`/projects/${projectUrlIdentifier}/chart-types`}
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
                <Navigate
                    to={`/projects/${projectUrlIdentifier}/chart-types`}
                    replace
                />
            );
        }
        // Server-enforced (registry apps are read-only); this only keeps
        // the builder UI from being reached for an official chart type.
        if (appMeta.registrySlug !== null) {
            return (
                <Navigate
                    to={`/projects/${projectUrlIdentifier}/chart-types`}
                    replace
                />
            );
        }
    }

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
            previewContext={previewContext}
            isStale={workspace.isFetchingSchema}
            previewDataSource={previewDataSource}
            savedChartSource={savedChartSource}
            inputsBinding={inputsBinding}
        />
    ) : null;

    const backLink = explorerChart
        ? {
              label: 'Explorer',
              to: explorerDestination ?? {
                  pathname: `/projects/${projectUuid}/tables/${explorerChart.tableName}`,
                  search: location.search,
              },
          }
        : {
              label: 'Chart types',
              to: `/projects/${projectUrlIdentifier}/chart-types`,
          };

    return (
        <Box className={classes.root}>
            <DocumentTitle title="Chart Studio" />
            <ChartTypeBuilderHeader
                projectUuid={projectUuid}
                appUuidOrSlug={urlVizUuid}
                backLink={backLink}
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
                previewInExplorerLink={explorerDestination}
                onPreviewInExplorer={
                    activeVizUuid ? () => setIsPreviewTableOpen(true) : null
                }
            />
            <ChartTypeBuilderWorkspace
                projectUuid={projectUuid}
                workspace={workspace}
                previewContext={previewContext}
                sampleRows={sampleRows}
                currentBuildContext={currentBuildContext}
                savedChartSource={savedChartSource}
                examplePrompts={examplePrompts}
                syncPreviewUrlState
                configurePanel={configurePanel}
            />
            <ChartTypeRowsModal
                data={liveRows}
                opened={isRowsModalOpen && liveRows !== null}
                onClose={() => setIsRowsModalOpen(false)}
                title="Query results"
                subtitle={`Rows returned by ${
                    savedChartSource.attached?.chartName ?? 'the saved chart'
                }.`}
            />
            {isPreviewTableOpen && activeVizUuid && (
                <ChartTypePreviewTableModal
                    projectUuid={projectUuid}
                    dataAppVizUuid={activeVizUuid}
                    registrySlug={appMeta?.registrySlug ?? null}
                    onClose={() => setIsPreviewTableOpen(false)}
                />
            )}
        </Box>
    );
};

export default ChartTypeBuilder;
