import { subject } from '@casl/ability';
import {
    ChartType,
    FeatureFlags,
    getComposerChartExportLabels,
    toComposerChartKind,
    type DashboardComposerChartTile as ComposerChartTile,
} from '@lightdash/common';
import { Menu } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import * as Sentry from '@sentry/react';
import {
    IconChartDots3,
    IconHierarchy2,
    IconTableExport,
} from '@tabler/icons-react';
import {
    useCallback,
    useEffect,
    useMemo,
    useState,
    type ComponentProps,
    type FC,
    type ReactElement,
    type ReactNode,
    type RefObject,
} from 'react';
import { CHART_TYPES_WITHOUT_IMAGE_EXPORT } from '../../../components/common/ChartDownload/chartDownloadUtils';
import MantineIcon from '../../../components/common/MantineIcon';
import SuboptimalState from '../../../components/common/SuboptimalState/SuboptimalState';
import { DashboardExportImage } from '../../../components/DashboardTiles/DashboardExportImage';
import ExportDataModal from '../../../components/DashboardTiles/ExportDataModal';
import ExportImageModal from '../../../components/DashboardTiles/ExportImageModal';
import TileBase from '../../../components/DashboardTiles/TileBase/index';
import { TileFiltersPopover } from '../../../components/DashboardTiles/TileFiltersPopover';
import { TileParametersPopover } from '../../../components/DashboardTiles/TileParametersPopover';
import { type EChartsReact } from '../../../components/EChartsReactWrapper';
import { NO_CELL_LIMITED_SCOPES } from '../../../components/ExportResults/exportCellEstimate';
import { AskAiAgentButton } from '../../../ee/features/aiCopilot/components/AskAiAgentMenuItem/AskAiAgentButton';
import { AskAiAgentMenuItem } from '../../../ee/features/aiCopilot/components/AskAiAgentMenuItem/AskAiAgentMenuItem';
import useIsEmbedded from '../../../ee/providers/Embed/useIsEmbedded';
import { useUiString } from '../../../ee/providers/Embed/useUiStrings';
import useDashboardFiltersForTile from '../../../hooks/dashboard/useDashboardFiltersForTile';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import useApp from '../../../providers/App/useApp';
import useDashboardContext from '../../../providers/Dashboard/useDashboardContext';
import useDashboardTileStatusContext from '../../../providers/Dashboard/useDashboardTileStatusContext';
import {
    dashboardParametersActions,
    dashboardTileStatusActions,
    selectSqlChartTilesMetadata,
    selectDashboardParameterDefinitions,
    selectFilterableFieldsByTileUuid,
    selectInvalidateCache,
    selectParameterValues,
    selectRefreshCounter,
    useDashboardDispatch,
    useDashboardSelector,
    useTileDashboardParameterInputs,
} from '../../dashboard/store';
import {
    COMPOSER_CHART_SENTRY_TAGS,
    useComposerChartDraw,
} from '../hooks/useComposerChartDraw';
import {
    useComposerChart,
    useComposerChartRun,
} from '../hooks/useComposerChartRun';
import {
    useComposerTileDateZoom,
    useReportComposerTileDateZoom,
} from '../hooks/useComposerTileDateZoom';
import { getComposerTileFilterItems } from '../utils/composerTileFilterItems';
import { getComposerTileParameterItems } from '../utils/composerTileParameterItems';
import { ComposerChartVisualization } from './ComposerChartVisualization';
import { ComposerTileErrorState } from './ComposerTileErrorState';
import { ComposerTileLineagePanel } from './ComposerTileLineagePanel';

type Props = Pick<
    ComponentProps<typeof TileBase>,
    'onEdit' | 'onDelete' | 'isEditMode' | 'minimal' | 'tabs'
> & { tile: ComposerChartTile };

const noop = () => {};

const getTitle = (tile: ComposerChartTile) =>
    tile.properties.title || tile.properties.chartName || '';

/** Holds the tile's place where composer charts do not draw (flag off, embeds) and reports ready. */
export const ComposerChartNotAvailableTile: FC<Props> = (props) => {
    const { tile } = props;
    const notAvailable = useUiString('tile.composerChart.notAvailable');
    const markTileScreenshotReady = useDashboardTileStatusContext(
        (c) => c.markTileScreenshotReady,
    );

    useEffect(() => {
        markTileScreenshotReady(tile.uuid);
    }, [markTileScreenshotReady, tile.uuid]);

    return (
        <TileBase
            {...props}
            title={getTitle(tile)}
            chartName={tile.properties.chartName ?? undefined}
        >
            <SuboptimalState
                adaptive
                icon={IconChartDots3}
                description={notAvailable}
                data-testid="composer-chart-not-available"
            />
        </TileBase>
    );
};

const TileError: FC<{
    tileUuid: string;
    message: string;
    minimal: boolean;
}> = ({ tileUuid, message, minimal }) => {
    const markTileScreenshotErrored = useDashboardTileStatusContext(
        (c) => c.markTileScreenshotErrored,
    );
    useEffect(() => {
        markTileScreenshotErrored(tileUuid);
    }, [markTileScreenshotErrored, tileUuid]);
    return <ComposerTileErrorState message={message} minimal={minimal} />;
};

const DrawnComposerChartTile: FC<Props> = (props) => {
    const { tile, minimal = false } = props;
    // The dashboard read names only live charts: no name means the chart is trashed
    const composerChartUuid =
        tile.properties.chartName === null
            ? null
            : tile.properties.composerChartUuid;
    const projectUuid = useProjectUuid();
    const dashboardUuid = useDashboardContext((c) => c.dashboard?.uuid);
    const isEmbedded = useIsEmbedded();
    const appliedParameterValues = useDashboardSelector(selectParameterValues);
    const {
        dashboardValues: parameters,
        excludedKeys,
        excludedParameterKeys,
    } = useTileDashboardParameterInputs(tile.uuid, appliedParameterValues);
    const parameterDefinitions = useDashboardSelector(
        selectDashboardParameterDefinitions,
    );
    const filterableFields = useDashboardSelector(
        (state) => selectFilterableFieldsByTileUuid(state)?.[tile.uuid],
    );
    const invalidateCache = useDashboardSelector(selectInvalidateCache);
    const refreshCounter = useDashboardSelector(selectRefreshCounter);
    const dashboardFilters = useDashboardFiltersForTile(tile.uuid);
    const markTileScreenshotReady = useDashboardTileStatusContext(
        (c) => c.markTileScreenshotReady,
    );
    const markTileScreenshotErrored = useDashboardTileStatusContext(
        (c) => c.markTileScreenshotErrored,
    );

    const dateZoom = useComposerTileDateZoom(tile.uuid);
    const chartQuery = useComposerChart(projectUuid, composerChartUuid);
    const runQuery = useComposerChartRun({
        projectUuid,
        composerChartUuid,
        request: {
            dashboardUuid: dashboardUuid ?? '',
            tileUuid: tile.uuid,
            dashboardFilters,
            parameters,
            excludedParameterKeys: excludedParameterKeys ?? [],
            invalidateCache: !!invalidateCache,
            dateZoom,
        },
        refreshCounter,
        enabled: !!dashboardUuid,
    });
    const chart = chartQuery.data;
    const run = runQuery.data;
    useReportComposerTileDateZoom(tile.uuid, run);
    const dispatch = useDashboardDispatch();
    const hasReportedSqlColumns = useDashboardSelector(
        (state) => selectSqlChartTilesMetadata(state)[tile.uuid] !== undefined,
    );
    useEffect(() => {
        if (!run) return;
        dispatch(
            dashboardParametersActions.addParameterReferences({
                tileUuid: tile.uuid,
                references: run.parameterReferences,
            }),
        );
        // Offered to the filter editor as on a SQL chart tile, once a run discovered them
        if (run.sqlColumns.length > 0 || hasReportedSqlColumns) {
            dispatch(
                dashboardTileStatusActions.updateSqlChartTilesMetadata({
                    tileUuid: tile.uuid,
                    metadata: { columns: run.sqlColumns },
                }),
            );
        }
    }, [dispatch, tile.uuid, run, hasReportedSqlColumns]);
    const filterItems = useMemo(
        () =>
            chart && run
                ? getComposerTileFilterItems({
                      nodes: chart.pipeline.nodes,
                      appliedDashboardFiltersByNodeId:
                          run.appliedDashboardFiltersByNodeId,
                      fields: filterableFields ?? [],
                      sqlColumns: run.sqlColumns,
                  })
                : [],
        [chart, run, filterableFields],
    );
    const parameterItems = useMemo(
        () =>
            chart && run
                ? getComposerTileParameterItems({
                      nodes: chart.pipeline.nodes,
                      usedParameterValuesByNodeId:
                          run.usedParameterValuesByNodeId,
                      definitions: parameterDefinitions,
                      dashboardValues: parameters,
                      excludedKeys,
                  })
                : [],
        [chart, run, parameterDefinitions, parameters, excludedKeys],
    );
    const title = getTitle(tile);
    const {
        draw: readyDraw,
        results,
        rows,
        displayedQueryUuid,
        error: drawError,
    } = useComposerChartDraw({
        projectUuid,
        chart: chart ?? null,
        run: run ?? null,
        title,
    });

    const errorMessage = !composerChartUuid
        ? 'This chart has been deleted.'
        : (chartQuery.error?.error.message ??
          runQuery.error?.error.message ??
          drawError);
    const isLoading =
        errorMessage === null && (!readyDraw || !results.hasFetchedAllRows);
    const { user } = useApp();
    const canExportData = !!user.data?.ability?.can(
        'manage',
        subject('ExportCsv', {
            organizationUuid: user.data?.organizationUuid,
            projectUuid,
        }),
    );
    const downloadData = useUiString('tileMenu.downloadData');
    const [exportOpened, { open: openExport, close: closeExport }] =
        useDisclosure(false);
    const viewLineage = useUiString('tileMenu.viewLineage');
    const [lineageOpened, { open: openLineage, close: closeLineage }] =
        useDisclosure(false);
    const [echartRef, setEchartRef] = useState<
        RefObject<EChartsReact | null> | undefined
    >();
    const [
        imageExportOpened,
        { open: openImageExport, close: closeImageExport },
    ] = useDisclosure(false);
    // Same rule as the classic chart tile; needs the chart drawn to capture it
    const canExportImage =
        canExportData &&
        !minimal &&
        errorMessage === null &&
        results.hasFetchedAllRows &&
        !!readyDraw &&
        !CHART_TYPES_WITHOUT_IMAGE_EXPORT.includes(readyDraw.chartConfig.type);
    const exportQueryUuid =
        errorMessage === null && results.hasFetchedAllRows
            ? displayedQueryUuid
            : null;
    const handleScreenshotReady = useCallback(
        () => markTileScreenshotReady(tile.uuid),
        [markTileScreenshotReady, tile.uuid],
    );
    const handleScreenshotError = useCallback(
        () => markTileScreenshotErrored(tile.uuid),
        [markTileScreenshotErrored, tile.uuid],
    );

    const askAiProps =
        !minimal && !isEmbedded && composerChartUuid
            ? ({
                  projectUuid,
                  composerChartUuid,
                  dashboardUuid,
                  clickedFrom: 'dashboard_composer_chart_tile',
              } as const)
            : null;
    const askAiTileActions = askAiProps
        ? {
              titleLeftIcon: <AskAiAgentButton {...askAiProps} />,
              mobileMenuItems: <AskAiAgentMenuItem {...askAiProps} />,
          }
        : {};

    // The Lineage panel draws the chart too, outside the tile body
    const withChartBoundary = (
        chartNode: ReactNode,
        renderError: (message: string) => ReactElement,
    ) => (
        <Sentry.ErrorBoundary
            beforeCapture={(scope) => scope.setTags(COMPOSER_CHART_SENTRY_TAGS)}
            fallback={({ error }) =>
                renderError(
                    error instanceof Error ? error.message : String(error),
                )
            }
        >
            {chartNode}
        </Sentry.ErrorBoundary>
    );

    return (
        <TileBase
            {...props}
            {...askAiTileActions}
            title={title}
            chartName={tile.properties.chartName ?? undefined}
            isLoading={isLoading}
            hasError={errorMessage !== null}
            chartKind={
                readyDraw ? toComposerChartKind(readyDraw.chartConfig) : null
            }
            fullWidth={readyDraw?.chartConfig.type === ChartType.TABLE}
            extraMenuItems={
                <>
                    <Menu.Item
                        leftSection={<MantineIcon icon={IconHierarchy2} />}
                        disabled={!chart}
                        onClick={openLineage}
                    >
                        {viewLineage}
                    </Menu.Item>
                    {canExportData && (
                        <Menu.Item
                            leftSection={<MantineIcon icon={IconTableExport} />}
                            disabled={props.isEditMode || !exportQueryUuid}
                            onClick={openExport}
                        >
                            {downloadData}
                        </Menu.Item>
                    )}
                    {canExportImage && (
                        <DashboardExportImage
                            onClick={openImageExport}
                            isMinimal={false}
                        />
                    )}
                </>
            }
            extraHeaderElement={
                <>
                    <TileFiltersPopover
                        dashboardFilters={filterItems}
                        chartFilters={[]}
                    />
                    <TileParametersPopover items={parameterItems} />
                </>
            }
        >
            {errorMessage !== null ? (
                <TileError
                    tileUuid={tile.uuid}
                    message={errorMessage}
                    minimal={minimal}
                />
            ) : (
                readyDraw &&
                results.hasFetchedAllRows &&
                projectUuid &&
                withChartBoundary(
                    <ComposerChartVisualization
                        key={chart?.versionUuid}
                        projectUuid={projectUuid}
                        composerChartUuid={composerChartUuid}
                        dashboardUuid={dashboardUuid ?? null}
                        tileUuid={tile.uuid}
                        isDashboard
                        isTitleHidden={!!tile.properties.hideTitle}
                        minimal={minimal}
                        draw={readyDraw}
                        results={results}
                        rows={rows}
                        onScreenshotReady={handleScreenshotReady}
                        onScreenshotError={handleScreenshotError}
                        setEchartsRef={setEchartRef}
                    />,
                    (message) => (
                        <TileError
                            tileUuid={tile.uuid}
                            minimal={minimal}
                            message={message}
                        />
                    ),
                )
            )}
            {chart && projectUuid && (
                <ComposerTileLineagePanel
                    opened={lineageOpened}
                    onClose={closeLineage}
                    chartTitle={title}
                    projectUuid={projectUuid}
                    pipeline={chart.pipeline}
                    run={run ?? null}
                    runError={runQuery.error?.error.message ?? null}
                    chart={
                        readyDraw && results.hasFetchedAllRows
                            ? withChartBoundary(
                                  <ComposerChartVisualization
                                      projectUuid={projectUuid}
                                      composerChartUuid={composerChartUuid}
                                      dashboardUuid={dashboardUuid ?? null}
                                      tileUuid={tile.uuid}
                                      isDashboard
                                      isTitleHidden
                                      minimal
                                      draw={readyDraw}
                                      results={results}
                                      rows={rows}
                                      onScreenshotReady={noop}
                                      onScreenshotError={noop}
                                  />,
                                  (message) => (
                                      <ComposerTileErrorState
                                          message={message}
                                          minimal={false}
                                      />
                                  ),
                              )
                            : null
                    }
                />
            )}
            {exportQueryUuid && projectUuid && run && (
                <ExportDataModal
                    isOpen={exportOpened}
                    onClose={closeExport}
                    projectUuid={projectUuid}
                    totalResults={results.totalResults}
                    getDownloadQueryUuid={async () => exportQueryUuid}
                    customLabels={getComposerChartExportLabels(run.fields)}
                    chartName={title}
                    hideLimitSelection
                    cellLimitedScopes={NO_CELL_LIMITED_SCOPES}
                />
            )}
            {canExportImage && (
                <ExportImageModal
                    echartRef={echartRef}
                    chartName={title}
                    isOpen={imageExportOpened}
                    onClose={closeImageExport}
                />
            )}
        </TileBase>
    );
};

/** A composer chart drawn on its dashboard tile; "not available" while the flag is off. */
const DashboardComposerChartTile: FC<Props> = (props) => {
    const flag = useServerFeatureFlag(FeatureFlags.ComposerCharts);
    if (flag.isLoading) {
        return <TileBase {...props} title={getTitle(props.tile)} isLoading />;
    }
    if (!flag.data?.enabled)
        return <ComposerChartNotAvailableTile {...props} />;
    return <DrawnComposerChartTile {...props} />;
};

export default DashboardComposerChartTile;
