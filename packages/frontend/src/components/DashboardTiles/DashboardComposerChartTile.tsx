import {
    ChartType,
    COMPOSER_RESULT_TABLE_NAME,
    FeatureFlags,
    getChartKind,
    getComposerChartRunQueryChart,
    toComposerResultRows,
    type ApiError,
    type ChartConfig,
    type ComposerRunQueryChart,
    type DashboardChartTile as IDashboardChartTile,
    type QueryExecutionContext,
} from '@lightdash/common';
import { Menu, useComputedColorScheme } from '@mantine/core';
import { useElementSize } from '@mantine/hooks';
import { IconAlertCircle, IconTableExport } from '@tabler/icons-react';
import {
    useCallback,
    useEffect,
    useMemo,
    useState,
    type FC,
    type RefObject,
} from 'react';
import { AskAiAgentButton } from '../../ee/features/aiCopilot/components/AskAiAgentMenuItem/AskAiAgentButton';
import { AskAiAgentMenuItem } from '../../ee/features/aiCopilot/components/AskAiAgentMenuItem/AskAiAgentMenuItem';
import useIsEmbedded from '../../ee/providers/Embed/useIsEmbedded';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import { useTileQueryQueueVisibility } from '../../features/dashboard/tileQueryQueue/useTileQueryQueue';
import { useProjectColorPalette } from '../../hooks/appearance/useProjectColorPalette';
import { useDashboardComposerChartReadyQuery } from '../../hooks/dashboard/useDashboardComposerChartReadyQuery';
import { useOrganization } from '../../hooks/organization/useOrganization';
import { useInfiniteQueryResults } from '../../hooks/useQueryResults';
import { useSavedComposerChart } from '../../hooks/useSavedQuery';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import useDashboardTileStatusContext from '../../providers/Dashboard/useDashboardTileStatusContext';
import { useRegisterTileQuery } from '../../providers/Dashboard/useRegisterTileQuery';
import { CHART_TYPES_WITHOUT_IMAGE_EXPORT } from '../common/ChartDownload/chartDownloadUtils';
import MantineIcon from '../common/MantineIcon';
import SuboptimalState from '../common/SuboptimalState/SuboptimalState';
import { type EChartsReact } from '../EChartsReactWrapper';
import LightdashVisualization from '../LightdashVisualization';
import VisualizationProvider from '../LightdashVisualization/VisualizationProvider';
import MetricQueryDataProvider from '../MetricQueryData/MetricQueryDataProvider';
import { DashboardExportImage } from './DashboardExportImage';
import ExportDataModal from './ExportDataModal';
import ExportImageModal from './ExportImageModal';
import { getDashboardChartColorPalette } from './getDashboardChartColorPalette';
import TileBase from './TileBase';
import { type TileBaseProps } from './TileBase/types';

type Props = Pick<
    TileBaseProps<IDashboardChartTile>,
    'tile' | 'onEdit' | 'onDelete' | 'isEditMode'
> & {
    minimal?: boolean;
    canExportCsv?: boolean;
    canExportImages?: boolean;
    queryContextOverride?: QueryExecutionContext;
};

type UnavailableReason = 'embed' | 'disabled';

const EMBED_ERROR_NAME = 'ComposerChartNotAvailableInEmbedError';

const tileTitle = (tile: IDashboardChartTile, chartName?: string) =>
    tile.properties.title || chartName || tile.properties.chartName || '';

const ComposerChartUnavailableTile: FC<
    Props & { reason: UnavailableReason }
> = ({ tile, reason, minimal, isEditMode, onEdit, onDelete }) => {
    const getUiString = useUiStrings();
    return (
        <TileBase
            title={tileTitle(tile)}
            tile={tile}
            isEditMode={isEditMode}
            onEdit={onEdit}
            onDelete={onDelete}
            minimal={minimal}
            hasError
            chartKind={tile.properties.lastVersionChartKind ?? null}
        >
            <SuboptimalState
                adaptive
                icon={IconAlertCircle}
                title={getUiString('composerTile.unavailable.title')}
                description={getUiString(
                    reason === 'embed'
                        ? 'composerTile.unavailable.embed'
                        : 'composerTile.unavailable.disabled',
                )}
            />
        </TileBase>
    );
};

const getErrorMessage = (error: ApiError | Error): string | undefined =>
    error instanceof Error ? error.message : error.error?.message;

// The chart draws the stage result when the stored pivot splits series,
// otherwise the terminal node's rows renamed to the chart's field ids.
const LiveComposerChartTile: FC<Props & { chartUuid: string }> = ({
    tile,
    chartUuid,
    minimal = false,
    canExportCsv = false,
    canExportImages = false,
    queryContextOverride,
    isEditMode,
    onEdit,
    onDelete,
}) => {
    const getUiString = useUiStrings();
    const projectUuid = useDashboardContext((c) => c.projectUuid);
    const dashboardUuid = useDashboardContext((c) => c.dashboard?.uuid);
    const colorScheme = useComputedColorScheme();
    const { data: org } = useOrganization();
    const [isDataExportModalOpen, setIsDataExportModalOpen] = useState(false);
    const [isImageExportModalOpen, setIsImageExportModalOpen] = useState(false);
    const [echartRef, setEchartRef] = useState<
        RefObject<EChartsReact | null> | undefined
    >();
    const [expandedChartConfig, setExpandedChartConfig] =
        useState<ChartConfig | null>(null);
    const {
        ref: measureRef,
        width: containerWidth,
        height: containerHeight,
    } = useElementSize();

    const savedChart = useSavedComposerChart(chartUuid, projectUuid);
    const readyQuery = useDashboardComposerChartReadyQuery(
        tile.uuid,
        chartUuid,
        queryContextOverride,
    );
    const run = readyQuery.data?.executeQueryResponse;
    const nodeResults = useInfiniteQueryResults(
        projectUuid,
        run?.queryUuid,
        tile.properties.chartName ?? undefined,
    );
    const stageResults = useInfiniteQueryResults(
        projectUuid,
        run?.chartStage?.queryUuid,
    );
    const results = run?.chartStage ? stageResults : nodeResults;
    useTileQueryQueueVisibility(tile.uuid);

    useEffect(() => {
        if (run && !results.hasFetchedAllRows && !results.fetchAll) {
            results.setFetchAll(true);
        }
    }, [run, results]);

    const columns = useMemo(
        () => Object.values(nodeResults.columns ?? {}),
        [nodeResults.columns],
    );
    const chart = useMemo((): ComposerRunQueryChart | Error | null => {
        if (!run || columns.length === 0) return null;
        try {
            return getComposerChartRunQueryChart({
                chartVisualization: run.chartVisualization,
                columns,
            });
        } catch (error) {
            return error instanceof Error ? error : new Error(String(error));
        }
    }, [run, columns]);
    const readyChart = chart instanceof Error ? null : chart;

    const rows = useMemo(
        () =>
            readyChart && !run?.chartStage
                ? toComposerResultRows(readyChart, results.rows)
                : results.rows,
        [readyChart, run?.chartStage, results.rows],
    );
    const resultsData = useMemo(
        () =>
            readyChart
                ? {
                      ...results,
                      rows,
                      metricQuery: readyChart.metricQuery,
                      fields: readyChart.fields,
                  }
                : null,
        [readyChart, results, rows],
    );

    const error: ApiError | Error | null =
        readyQuery.error ??
        nodeResults.error ??
        stageResults.error ??
        (chart instanceof Error ? chart : null);
    const isLoading =
        !error &&
        (readyQuery.isFetching ||
            !run ||
            !readyChart ||
            !results.hasFetchedAllRows);

    const markTileScreenshotReady = useDashboardTileStatusContext(
        (c) => c.markTileScreenshotReady,
    );
    const markTileScreenshotErrored = useDashboardTileStatusContext(
        (c) => c.markTileScreenshotErrored,
    );
    useEffect(() => {
        if (error) markTileScreenshotErrored(tile.uuid);
    }, [error, markTileScreenshotErrored, tile.uuid]);
    const handleScreenshotReady = useCallback(() => {
        markTileScreenshotReady(tile.uuid);
    }, [markTileScreenshotReady, tile.uuid]);

    const title = tileTitle(tile, savedChart.data?.name);
    useRegisterTileQuery(
        useMemo(() => {
            if (isLoading) return null;
            return {
                tileUuid: tile.uuid,
                queryUuid: run?.queryUuid ?? null,
                label: title || 'Chart',
                status: error ? ('error' as const) : ('ready' as const),
            };
        }, [isLoading, tile.uuid, run?.queryUuid, title, error]),
    );

    const { data: resolvedPalette } = useProjectColorPalette(projectUuid, {
        dashboardUuid,
        chartUuid,
    });
    const colorPalette = useMemo(
        () =>
            getDashboardChartColorPalette({
                colorScheme,
                chartColorPalette: savedChart.data?.colorPalette ?? [],
                selectedPaletteColors: resolvedPalette?.colors,
                selectedPaletteDarkColors: resolvedPalette?.darkColors,
                orgColorPalette: org?.chartColors,
                orgDarkColorPalette: org?.chartDarkColors,
            }),
        [
            colorScheme,
            savedChart.data?.colorPalette,
            resolvedPalette?.colors,
            resolvedPalette?.darkColors,
            org?.chartColors,
            org?.chartDarkColors,
        ],
    );

    const getDownloadQueryUuid = useCallback(async () => {
        if (!run) throw new Error('The chart has not run yet');
        return run.queryUuid;
    }, [run]);

    if (error) {
        const errorName = error instanceof Error ? null : error.error?.name;
        if (errorName === EMBED_ERROR_NAME) {
            return (
                <ComposerChartUnavailableTile
                    tile={tile}
                    reason="embed"
                    minimal={minimal}
                    isEditMode={isEditMode}
                    onEdit={onEdit}
                    onDelete={onDelete}
                />
            );
        }
        return (
            <TileBase
                title={title}
                tile={tile}
                isEditMode={isEditMode}
                onEdit={onEdit}
                onDelete={onDelete}
                minimal={minimal}
                hasError
                chartKind={tile.properties.lastVersionChartKind ?? null}
            >
                <SuboptimalState
                    adaptive
                    icon={IconAlertCircle}
                    title={title}
                    description={
                        getErrorMessage(error) ||
                        getUiString('composerTile.runError')
                    }
                />
            </TileBase>
        );
    }

    if (isLoading || !run || !readyChart || !resultsData) {
        return (
            <TileBase
                title={title}
                tile={tile}
                isEditMode={isEditMode}
                onEdit={onEdit}
                onDelete={onDelete}
                minimal={minimal}
                isLoading
                chartKind={tile.properties.lastVersionChartKind ?? null}
            />
        );
    }

    const { chartConfig, metricQuery, pivotColumns } = readyChart;
    const canDownload = minimal ? canExportCsv : true;
    const canExportImage =
        (minimal ? canExportImages : true) &&
        !CHART_TYPES_WITHOUT_IMAGE_EXPORT.includes(chartConfig.type);

    return (
        <>
            <TileBase
                title={title}
                description={savedChart.data?.description}
                tile={tile}
                isEditMode={isEditMode}
                onEdit={onEdit}
                onDelete={onDelete}
                minimal={minimal}
                chartKind={getChartKind(chartConfig.type, chartConfig.config)}
                fullWidth={chartConfig.type === ChartType.TABLE}
                titleLeftIcon={
                    minimal ? undefined : (
                        <AskAiAgentButton
                            projectUuid={projectUuid}
                            chartUuid={chartUuid}
                            dashboardUuid={dashboardUuid}
                            clickedFrom="dashboard_chart_tile"
                        />
                    )
                }
                mobileMenuItems={
                    minimal ? undefined : (
                        <AskAiAgentMenuItem
                            projectUuid={projectUuid}
                            chartUuid={chartUuid}
                            dashboardUuid={dashboardUuid}
                            clickedFrom="dashboard_chart_tile"
                        />
                    )
                }
                extraMenuItems={
                    canDownload || canExportImage ? (
                        <>
                            {canDownload && (
                                <Menu.Item
                                    leftSection={
                                        <MantineIcon icon={IconTableExport} />
                                    }
                                    disabled={isEditMode}
                                    onClick={() =>
                                        setIsDataExportModalOpen(true)
                                    }
                                >
                                    {getUiString('tileMenu.downloadData')}
                                </Menu.Item>
                            )}
                            {canExportImage && (
                                <DashboardExportImage
                                    onClick={() =>
                                        setIsImageExportModalOpen(true)
                                    }
                                    isMinimal={minimal}
                                />
                            )}
                        </>
                    ) : undefined
                }
            >
                <MetricQueryDataProvider
                    metricQuery={metricQuery}
                    tableName={COMPOSER_RESULT_TABLE_NAME}
                    explore={undefined}
                    queryUuid={run.queryUuid}
                    parameters={run.usedParametersValues}
                    resolvedTimezone={run.resolvedTimezone}
                >
                    <VisualizationProvider
                        hasExplorerStore={false}
                        minimal={minimal}
                        isDashboard
                        resultsData={resultsData}
                        chartConfig={expandedChartConfig ?? chartConfig}
                        onChartConfigChange={setExpandedChartConfig}
                        columnOrder={[
                            ...metricQuery.dimensions,
                            ...metricQuery.metrics,
                        ]}
                        initialPivotDimensions={
                            pivotColumns.length > 0 ? pivotColumns : undefined
                        }
                        unsavedMetricQuery={metricQuery}
                        savedChartUuid={chartUuid}
                        colorPalette={colorPalette}
                        isLoading={results.isFetchingRows}
                        setEchartsRef={setEchartRef}
                        containerWidth={containerWidth}
                        containerHeight={containerHeight}
                    >
                        <LightdashVisualization
                            ref={measureRef}
                            isDashboard
                            tileUuid={tile.uuid}
                            isTitleHidden={tile.properties.hideTitle}
                            description={savedChart.data?.description}
                            enableContextMenu={false}
                            onScreenshotReady={handleScreenshotReady}
                        />
                    </VisualizationProvider>
                </MetricQueryDataProvider>
            </TileBase>
            {canExportImage && (
                <ExportImageModal
                    echartRef={echartRef}
                    chartName={title}
                    isOpen={isImageExportModalOpen}
                    onClose={() => setIsImageExportModalOpen(false)}
                />
            )}
            {canDownload && projectUuid && (
                <ExportDataModal
                    isOpen={isDataExportModalOpen}
                    onClose={() => setIsDataExportModalOpen(false)}
                    projectUuid={projectUuid}
                    totalResults={nodeResults.totalResults}
                    getDownloadQueryUuid={getDownloadQueryUuid}
                    hideLimitSelection
                    chartName={title}
                    columnOrder={columns.map((column) => column.reference)}
                />
            )}
        </>
    );
};

// A composer chart tile: drawn from the run's live columns, never an explore.
const DashboardComposerChartTile: FC<Props> = (props) => {
    const isEmbedded = useIsEmbedded();
    const flag = useServerFeatureFlag(FeatureFlags.ComposeSqlRunner, {
        enabled: !isEmbedded,
    });
    const chartUuid = props.tile.properties.savedChartUuid;

    if (isEmbedded) {
        return <ComposerChartUnavailableTile {...props} reason="embed" />;
    }
    if (flag.data === undefined) {
        return (
            <TileBase
                title={tileTitle(props.tile)}
                tile={props.tile}
                isEditMode={props.isEditMode}
                onEdit={props.onEdit}
                onDelete={props.onDelete}
                minimal={props.minimal}
                isLoading
                chartKind={props.tile.properties.lastVersionChartKind ?? null}
            />
        );
    }
    if (!flag.data.enabled || !chartUuid) {
        return <ComposerChartUnavailableTile {...props} reason="disabled" />;
    }
    return <LiveComposerChartTile {...props} chartUuid={chartUuid} />;
};

export default DashboardComposerChartTile;
