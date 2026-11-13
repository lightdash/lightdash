import {
    ChartType,
    FeatureFlags,
    getChartKind,
    getComposerChartDraw,
    pickComposerChartRows,
    type ComposerChartDraw,
    type DashboardComposerChartTile as ComposerChartTile,
} from '@lightdash/common';
import * as Sentry from '@sentry/react';
import { IconAlertCircle, IconChartDots3 } from '@tabler/icons-react';
import {
    useCallback,
    useEffect,
    useMemo,
    type ComponentProps,
    type FC,
} from 'react';
import SuboptimalState from '../../../components/common/SuboptimalState/SuboptimalState';
import TileBase from '../../../components/DashboardTiles/TileBase/index';
import { useUiString } from '../../../ee/providers/Embed/useUiStrings';
import useDashboardFiltersForTile from '../../../hooks/dashboard/useDashboardFiltersForTile';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import { useInfiniteQueryResults } from '../../../hooks/useQueryResults';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import useDashboardContext from '../../../providers/Dashboard/useDashboardContext';
import useDashboardTileStatusContext from '../../../providers/Dashboard/useDashboardTileStatusContext';
import {
    dashboardParametersActions,
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
import { ComposerChartVisualization } from './ComposerChartVisualization';

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

const TileError: FC<{ tileUuid: string; message: string }> = ({
    tileUuid,
    message,
}) => {
    const markTileScreenshotErrored = useDashboardTileStatusContext(
        (c) => c.markTileScreenshotErrored,
    );
    useEffect(() => {
        markTileScreenshotErrored(tileUuid);
    }, [markTileScreenshotErrored, tileUuid]);
    return (
        <SuboptimalState
            adaptive
            icon={IconAlertCircle}
            description={message}
            data-testid="composer-chart-error"
        />
    );
};

const DrawnComposerChartTile: FC<Props> = (props) => {
    const { tile, minimal = false } = props;
    const { composerChartUuid } = tile.properties;
    const projectUuid = useProjectUuid();
    const dashboardUuid = useDashboardContext((c) => c.dashboard?.uuid);
    const appliedParameterValues = useDashboardSelector(selectParameterValues);
    const { dashboardValues: parameters, excludedParameterKeys } =
        useTileDashboardParameterInputs(tile.uuid, appliedParameterValues);
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
    useEffect(() => {
        if (!run) return;
        dispatch(
            dashboardParametersActions.addParameterReferences({
                tileUuid: tile.uuid,
                references: run.parameterReferences,
            }),
        );
    }, [dispatch, tile.uuid, run]);
    const title = getTitle(tile);
    const terminal = useInfiniteQueryResults(
        projectUuid,
        run?.queries.find(
            ({ nodeId }) => nodeId === chart?.pipeline.terminalNodeId,
        )?.queryUuid,
        title,
    );
    const stage = useInfiniteQueryResults(
        projectUuid,
        run?.chartStageQueryUuid ?? undefined,
        title,
    );
    const drawsFromStage = !!run?.chartStageQueryUuid;
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
    useEffect(() => {
        // Draw errors are captured where they are thrown
        if (errorMessage && drawState.status !== 'error') {
            Sentry.captureException(new Error(errorMessage), {
                tags: SENTRY_TAGS,
            });
        }
    }, [errorMessage, drawState.status]);
    const isLoading =
        !errorMessage && (!readyDraw || !results.hasFetchedAllRows);
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
            hasError={!!errorMessage}
            chartKind={
                readyDraw
                    ? getChartKind(
                          readyDraw.chartConfig.type,
                          readyDraw.chartConfig.config,
                      )
                    : null
            }
            fullWidth={readyDraw?.chartConfig.type === ChartType.TABLE}
        >
            {errorMessage ? (
                <TileError tileUuid={tile.uuid} message={errorMessage} />
            ) : (
                readyDraw &&
                results.hasFetchedAllRows &&
                projectUuid && (
                    <Sentry.ErrorBoundary
                        beforeCapture={(scope) => scope.setTags(SENTRY_TAGS)}
                        fallback={({ error }) => (
                            <TileError
                                tileUuid={tile.uuid}
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
