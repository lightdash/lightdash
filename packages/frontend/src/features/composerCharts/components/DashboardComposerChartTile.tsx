import { subject } from '@casl/ability';
import {
    ChartType,
    FeatureFlags,
    getChartKind,
    getComposerChartDisplayedQueryUuid,
    getComposerChartExportLabels,
    getComposerChartDraw,
    pickComposerChartRows,
    type ComposerChartDraw,
    type DashboardComposerChartTile as ComposerChartTile,
} from '@lightdash/common';
import { Menu } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import * as Sentry from '@sentry/react';
import { IconChartDots3, IconTableExport } from '@tabler/icons-react';
import {
    useCallback,
    useEffect,
    useMemo,
    type ComponentProps,
    type FC,
} from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import SuboptimalState from '../../../components/common/SuboptimalState/SuboptimalState';
import ExportDataModal from '../../../components/DashboardTiles/ExportDataModal';
import TileBase from '../../../components/DashboardTiles/TileBase/index';
import { TileFiltersPopover } from '../../../components/DashboardTiles/TileFiltersPopover';
import { TileParametersPopover } from '../../../components/DashboardTiles/TileParametersPopover';
import { useUiString } from '../../../ee/providers/Embed/useUiStrings';
import useDashboardFiltersForTile from '../../../hooks/dashboard/useDashboardFiltersForTile';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import { useInfiniteQueryResults } from '../../../hooks/useQueryResults';
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
    useComposerChart,
    useComposerChartRun,
} from '../hooks/useComposerChartRun';
import { getComposerTileFilterItems } from '../utils/composerTileFilterItems';
import { getComposerTileParameterItems } from '../utils/composerTileParameterItems';
import { ComposerChartVisualization } from './ComposerChartVisualization';
import { ComposerTileErrorState } from './ComposerTileErrorState';

type Props = Pick<
    ComponentProps<typeof TileBase>,
    'onEdit' | 'onDelete' | 'isEditMode' | 'minimal' | 'tabs'
> & { tile: ComposerChartTile };

const SENTRY_TAGS = { 'lightdash.chartKind': 'composer' };

type DrawState =
    | { status: 'loading' }
    | { status: 'ready'; draw: ComposerChartDraw }
    | { status: 'error'; message: string };

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
    const { composerChartUuid } = tile.properties;
    const projectUuid = useProjectUuid();
    const dashboardUuid = useDashboardContext((c) => c.dashboard?.uuid);
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
        },
        refreshCounter,
        enabled: !!dashboardUuid,
    });
    const chart = chartQuery.data;
    const run = runQuery.data;
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
    const terminalQueryUuid = run?.queries.find(
        ({ nodeId }) => nodeId === chart?.pipeline.terminalNodeId,
    )?.queryUuid;
    const displayedQueryUuid =
        run && chart
            ? getComposerChartDisplayedQueryUuid(
                  run,
                  chart.pipeline.terminalNodeId,
              )
            : null;
    const drawsFromStage =
        !!displayedQueryUuid && displayedQueryUuid !== terminalQueryUuid;
    const terminal = useInfiniteQueryResults(
        projectUuid,
        terminalQueryUuid,
        title,
        null,
        { toastErrors: false },
    );
    const stage = useInfiniteQueryResults(
        projectUuid,
        drawsFromStage ? displayedQueryUuid : undefined,
        title,
        null,
        { toastErrors: false },
    );
    const results = drawsFromStage ? stage : terminal;
    useEffect(() => {
        if (
            results.queryUuid &&
            !results.hasFetchedAllRows &&
            !results.fetchAll
        )
            results.setFetchAll(true);
    }, [results]);

    const drawState = useMemo((): DrawState => {
        if (!chart || !run || !terminal.columns) return { status: 'loading' };
        try {
            return {
                status: 'ready',
                draw: getComposerChartDraw({
                    pipeline: chart.pipeline,
                    chart: chart.chart,
                    columns: Object.values(terminal.columns),
                    fields: run.fields,
                }),
            };
        } catch (error) {
            Sentry.captureException(error, { tags: SENTRY_TAGS });
            return {
                status: 'error',
                message: error instanceof Error ? error.message : String(error),
            };
        }
    }, [chart, run, terminal.columns]);
    const readyDraw = drawState.status === 'ready' ? drawState.draw : null;

    const rows = useMemo(() => {
        if (!readyDraw) return [];
        return drawsFromStage
            ? results.rows
            : pickComposerChartRows(readyDraw, results.rows);
    }, [readyDraw, drawsFromStage, results.rows]);

    const errorMessage = !composerChartUuid
        ? 'This chart has been deleted.'
        : (chartQuery.error?.error.message ??
          runQuery.error?.error.message ??
          terminal.error?.error.message ??
          stage.error?.error.message ??
          (drawState.status === 'error' ? drawState.message : null));
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

    return (
        <TileBase
            {...props}
            title={title}
            chartName={tile.properties.chartName ?? undefined}
            isLoading={isLoading}
            hasError={errorMessage !== null}
            chartKind={
                readyDraw
                    ? getChartKind(
                          readyDraw.chartConfig.type,
                          readyDraw.chartConfig.config,
                      )
                    : null
            }
            fullWidth={readyDraw?.chartConfig.type === ChartType.TABLE}
            extraMenuItems={
                canExportData && (
                    <Menu.Item
                        leftSection={<MantineIcon icon={IconTableExport} />}
                        disabled={props.isEditMode || !exportQueryUuid}
                        onClick={openExport}
                    >
                        {downloadData}
                    </Menu.Item>
                )
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
                projectUuid && (
                    <Sentry.ErrorBoundary
                        beforeCapture={(scope) => scope.setTags(SENTRY_TAGS)}
                        fallback={({ error }) => (
                            <TileError
                                tileUuid={tile.uuid}
                                minimal={minimal}
                                message={
                                    error instanceof Error
                                        ? error.message
                                        : String(error)
                                }
                            />
                        )}
                    >
                        <ComposerChartVisualization
                            key={chart?.versionUuid}
                            projectUuid={projectUuid}
                            composerChartUuid={composerChartUuid}
                            dashboardUuid={dashboardUuid}
                            tileUuid={tile.uuid}
                            isTitleHidden={!!tile.properties.hideTitle}
                            minimal={minimal}
                            draw={readyDraw}
                            results={results}
                            rows={rows}
                            onScreenshotReady={handleScreenshotReady}
                            onScreenshotError={handleScreenshotError}
                        />
                    </Sentry.ErrorBoundary>
                )
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
