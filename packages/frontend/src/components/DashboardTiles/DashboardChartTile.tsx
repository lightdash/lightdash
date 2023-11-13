import { Menu, NonIdealState, Portal, Tag } from '@blueprintjs/core';
import {
    MenuItem2,
    Popover2,
    Popover2TargetProps,
} from '@blueprintjs/popover2';
import { subject } from '@casl/ability';
import {
    ApiChartAndResults,
    ChartType,
    DashboardChartTile as IDashboardChartTile,
    DashboardFilterRule,
    Field,
    fieldId,
    FilterOperator,
    friendlyName,
    getCustomLabelsFromTableConfig,
    getDimensions,
    getFields,
    getHiddenTableFields,
    getItemMap,
    getVisibleFields,
    hasCustomDimension,
    isChartTile,
    isFilterableField,
    isTableChartConfig,
    PivotReference,
    ResultValue,
    SavedChart,
    TableCalculation,
} from '@lightdash/common';
import { Box, Text, Tooltip } from '@mantine/core';
import { IconFilter, IconFolders } from '@tabler/icons-react';
import React, { FC, useCallback, useEffect, useMemo, useState } from 'react';
import CopyToClipboard from 'react-copy-to-clipboard';
import { useParams } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { downloadCsv } from '../../api/csv';
import { ExportToGoogleSheet } from '../../features/export';
import useDashboardChart from '../../hooks/dashboard/useDashboardChart';
import useDashboardStorage from '../../hooks/dashboard/useDashboardStorage';
import { EChartSeries } from '../../hooks/echarts/useEcharts';
import { uploadGsheet } from '../../hooks/gdrive/useGdrive';
import useToaster from '../../hooks/toaster/useToaster';
import { getExplorerUrlFromCreateSavedChartVersion } from '../../hooks/useExplorerRoute';
import { useApp } from '../../providers/AppProvider';
import { useDashboardContext } from '../../providers/DashboardProvider';
import { useTracking } from '../../providers/TrackingProvider';
import { EventName } from '../../types/Events';
import { Can } from '../common/Authorization';
import { getConditionalRuleLabel } from '../common/Filters/FilterInputs';
import LinkMenuItem from '../common/LinkMenuItem';
import MantineIcon from '../common/MantineIcon';
import MoveChartThatBelongsToDashboardModal from '../common/modal/MoveChartThatBelongsToDashboardModal';
import ExportCSVModal from '../ExportCSV/ExportCSVModal';
import LightdashVisualization from '../LightdashVisualization';
import VisualizationProvider from '../LightdashVisualization/VisualizationProvider';
import DrillDownMenuItem from '../MetricQueryData/DrillDownMenuItem';
import DrillDownModal from '../MetricQueryData/DrillDownModal';
import MetricQueryDataProvider, {
    getDataFromChartClick,
    useMetricQueryDataContext,
} from '../MetricQueryData/MetricQueryDataProvider';
import UnderlyingDataModal from '../MetricQueryData/UnderlyingDataModal';
import { EchartSeriesClickEvent } from '../SimpleChart';
import TileBase from './TileBase/index';
import {
    FilterLabel,
    FilterWrapper,
    GlobalTileStyles,
} from './TileBase/TileBase.styles';

interface ExportResultAsCSVModalProps {
    projectUuid: string;
    savedChart: SavedChart;
    rows: ApiChartAndResults['rows'];
    onClose: () => void;
    onConfirm: () => void;
}

const ExportResultAsCSVModal: FC<ExportResultAsCSVModalProps> = ({
    savedChart,
    rows,
    onClose,
    onConfirm,
}) => {
    const getCsvLink = async (limit: number | null, onlyRaw: boolean) => {
        return downloadCsv({
            projectUuid: savedChart.projectUuid,
            tableId: savedChart.tableName,
            query: savedChart.metricQuery,
            csvLimit: limit,
            onlyRaw: onlyRaw,
            columnOrder: savedChart.tableConfig.columnOrder,
            showTableNames: isTableChartConfig(savedChart.chartConfig.config)
                ? savedChart.chartConfig.config.showTableNames ?? false
                : true,
            customLabels: getCustomLabelsFromTableConfig(
                savedChart.chartConfig.config,
            ),
            hiddenFields: getHiddenTableFields(savedChart.chartConfig),
        });
    };

    return (
        <ExportCSVModal
            isOpen
            rows={rows}
            getCsvLink={getCsvLink}
            onClose={onClose}
            onConfirm={onConfirm}
        />
    );
};

const ExportGoogleSheet: FC<{ savedChart: SavedChart; disabled?: boolean }> = ({
    savedChart,
    disabled,
}) => {
    const getGsheetLink = async () => {
        return uploadGsheet({
            projectUuid: savedChart.projectUuid,
            exploreId: savedChart.tableName,
            metricQuery: savedChart.metricQuery,
            columnOrder: savedChart.tableConfig.columnOrder,
            showTableNames: isTableChartConfig(savedChart.chartConfig.config)
                ? savedChart.chartConfig.config.showTableNames ?? false
                : true,
            customLabels: getCustomLabelsFromTableConfig(
                savedChart.chartConfig.config,
            ),
            hiddenFields: getHiddenTableFields(savedChart.chartConfig),
        });
    };

    return (
        <ExportToGoogleSheet
            getGsheetLink={getGsheetLink}
            asMenuItem={true}
            disabled={disabled}
        />
    );
};

const ValidDashboardChartTile: FC<{
    tileUuid: string;
    chartAndResults: ApiChartAndResults;
    isTitleHidden?: boolean;
    project: string;
    onSeriesContextMenu?: (
        e: EchartSeriesClickEvent,
        series: EChartSeries[],
    ) => void;
}> = ({
    tileUuid,
    isTitleHidden = false,
    chartAndResults: { chart, explore, metricQuery, rows, cacheMetadata },
    onSeriesContextMenu,
}) => {
    const addSuggestions = useDashboardContext((c) => c.addSuggestions);
    const addResultsCacheTime = useDashboardContext(
        (c) => c.addResultsCacheTime,
    );

    const { health } = useApp();

    useEffect(() => {
        addSuggestions(
            metricQuery.dimensions.reduce((sum, dimensionId) => {
                const newSuggestions: string[] =
                    rows.reduce<string[]>((acc, row) => {
                        const value = row[dimensionId]?.value.raw;
                        if (typeof value === 'string') {
                            return [...acc, value];
                        }
                        return acc;
                    }, []) || [];
                return { ...sum, [dimensionId]: newSuggestions };
            }, {}),
        );
        addResultsCacheTime(cacheMetadata);
    }, [addSuggestions, addResultsCacheTime, metricQuery, cacheMetadata, rows]);

    if (health.isLoading || !health.data) {
        return null;
    }

    return (
        <VisualizationProvider
            chartType={chart.chartConfig.type}
            initialChartConfig={chart.chartConfig}
            initialPivotDimensions={chart.pivotConfig?.columns}
            resultsData={{
                rows,
                metricQuery,
                cacheMetadata,
            }}
            explore={explore}
            isLoading={false}
            onSeriesContextMenu={onSeriesContextMenu}
            columnOrder={chart.tableConfig.columnOrder}
            pivotTableMaxColumnLimit={health.data.pivotTable.maxColumnLimit}
        >
            <LightdashVisualization
                isDashboard
                tileUuid={tileUuid}
                isTitleHidden={isTitleHidden}
            />
        </VisualizationProvider>
    );
};

const ValidDashboardChartTileMinimal: FC<{
    tileUuid: string;
    isTitleHidden?: boolean;
    title: string;
    chartAndResults: ApiChartAndResults;
}> = ({
    tileUuid,
    chartAndResults: { chart, metricQuery, explore, rows, cacheMetadata },
    isTitleHidden = false,
}) => {
    const { health } = useApp();

    if (health.isLoading || !health.data) {
        return null;
    }

    return (
        <VisualizationProvider
            minimal
            chartType={chart.chartConfig.type}
            initialChartConfig={chart.chartConfig}
            initialPivotDimensions={chart.pivotConfig?.columns}
            resultsData={{
                rows,
                cacheMetadata,
                metricQuery,
            }}
            isLoading={false}
            explore={explore}
            columnOrder={chart.tableConfig.columnOrder}
            pivotTableMaxColumnLimit={health.data.pivotTable.maxColumnLimit}
        >
            <LightdashVisualization
                tileUuid={tileUuid}
                isDashboard
                isTitleHidden={isTitleHidden}
            />
        </VisualizationProvider>
    );
};

interface DashboardChartTileMainProps
    extends Pick<
        React.ComponentProps<typeof TileBase>,
        'tile' | 'onEdit' | 'onDelete' | 'isEditMode'
    > {
    tile: IDashboardChartTile;
    chartAndResults: ApiChartAndResults;
}

const DashboardChartTileMain: FC<DashboardChartTileMainProps> = (props) => {
    const { showToastSuccess } = useToaster();
    const { track } = useTracking();
    const {
        tile: {
            uuid: tileUuid,
            properties: {
                savedChartUuid,
                hideTitle,
                title,
                belongsToDashboard,
            },
        },
        chartAndResults,
        isEditMode,
    } = props;
    const { chart, explore, metricQuery, rows, appliedDashboardFilters } =
        chartAndResults;

    const { projectUuid, dashboardUuid } = useParams<{
        projectUuid: string;
        dashboardUuid: string;
    }>();

    const addDimensionDashboardFilter = useDashboardContext(
        (c) => c.addDimensionDashboardFilter,
    );

    const setDashboardTiles = useDashboardContext((c) => c.setDashboardTiles);
    const dashboardTiles = useDashboardContext((c) => c.dashboardTiles);
    const filtersFromContext = useDashboardContext((c) => c.dashboardFilters);
    const haveTilesChanged = useDashboardContext((c) => c.haveTilesChanged);
    const haveFiltersChanged = useDashboardContext((c) => c.haveFiltersChanged);
    const dashboard = useDashboardContext((c) => c.dashboard);

    const { storeDashboard } = useDashboardStorage();

    const [contextMenuIsOpen, setContextMenuIsOpen] = useState(false);
    const [contextMenuTargetOffset, setContextMenuTargetOffset] = useState<{
        left: number;
        top: number;
    }>();
    const [isMovingChart, setIsMovingChart] = useState(false);
    const { user } = useApp();

    const { openUnderlyingDataModal } = useMetricQueryDataContext();
    const contextMenuRenderTarget = useCallback(
        ({ ref }: Popover2TargetProps) => (
            <Portal>
                <div
                    style={{ position: 'absolute', ...contextMenuTargetOffset }}
                    ref={ref}
                />
            </Portal>
        ),
        [contextMenuTargetOffset],
    );
    const cancelContextMenu = React.useCallback(
        (e: React.SyntheticEvent<HTMLDivElement>) => e.preventDefault(),
        [],
    );
    const [dashboardTileFilterOptions, setDashboardFilterOptions] = useState<
        DashboardFilterRule[]
    >([]);
    const [viewUnderlyingDataOptions, setViewUnderlyingDataOptions] = useState<{
        item: Field | TableCalculation | undefined;
        value: ResultValue;
        fieldValues: Record<string, ResultValue>;
        dimensions: string[];
        pivotReference?: PivotReference;
    }>();
    const [isCSVExportModalOpen, setIsCSVExportModalOpen] = useState(false);

    const onSeriesContextMenu = useCallback(
        (e: EchartSeriesClickEvent, series: EChartSeries[]) => {
            if (explore === undefined) {
                return;
            }
            const dimensions = getDimensions(explore).filter((dimension) =>
                e.dimensionNames.includes(fieldId(dimension)),
            );

            const dimensionOptions = dimensions.map((dimension) => ({
                id: uuidv4(),
                target: {
                    fieldId: fieldId(dimension),
                    tableName: dimension.table,
                },
                operator: FilterOperator.EQUALS,
                values: [e.data[fieldId(dimension)]],
                label: undefined,
            }));
            const serie = series[e.seriesIndex];
            const fields = getFields(explore);
            const pivot = chart.pivotConfig?.columns?.[0];
            const pivotField = fields.find(
                (field) => `${field.table}_${field.name}` === pivot,
            );
            const seriesName = serie.encode?.seriesName;

            const pivotValue =
                pivot && seriesName?.includes(`.${pivot}.`)
                    ? seriesName?.split(`.${pivot}.`)[1]
                    : undefined;

            const pivotOptions =
                pivot && pivotField && pivotValue
                    ? [
                          {
                              id: uuidv4(),
                              target: {
                                  fieldId: pivot,
                                  tableName: pivotField.table,
                              },
                              operator: FilterOperator.EQUALS,
                              values: [pivotValue],
                              label: undefined,
                          },
                      ]
                    : [];

            setDashboardFilterOptions([...dimensionOptions, ...pivotOptions]);
            setContextMenuIsOpen(true);
            setContextMenuTargetOffset({
                left: e.event.event.pageX,
                top: e.event.event.pageY,
            });

            const allItemsMap = getItemMap(
                explore,
                chart.metricQuery.additionalMetrics,
                chart.metricQuery.tableCalculations,
            );

            const underlyingData = getDataFromChartClick(
                e,
                allItemsMap,
                series,
            );
            const queryDimensions = chart.metricQuery.dimensions || [];
            setViewUnderlyingDataOptions({
                ...underlyingData,
                dimensions: queryDimensions,
            });
        },
        [explore, chart],
    );
    const appliedFilterRules = appliedDashboardFilters
        ? [
              ...appliedDashboardFilters.dimensions,
              ...appliedDashboardFilters.metrics,
          ]
        : [];

    const renderFilterRule = useCallback(
        (filterRule: DashboardFilterRule) => {
            const fields: Field[] = explore ? getVisibleFields(explore) : [];
            const field = fields.find(
                (f) => fieldId(f) === filterRule.target.fieldId,
            );
            if (field && isFilterableField(field)) {
                const filterRuleLabels = getConditionalRuleLabel(
                    filterRule,
                    field,
                );
                return (
                    <div key={field.name}>
                        <Tag minimal style={{ color: 'white' }}>
                            {filterRuleLabels.field}:{' '}
                            {filterRule.disabled ? (
                                <>is any value</>
                            ) : (
                                <>
                                    {filterRuleLabels.operator}{' '}
                                    <Text fw={700} span>
                                        {filterRuleLabels.value}
                                    </Text>
                                </>
                            )}
                        </Tag>
                    </div>
                );
            }
            return `Tried to reference field with unknown id: ${filterRule.target.fieldId}`;
        },
        [explore],
    );

    const chartWithDashboardFilters = useMemo(
        () => ({
            ...chart,
            metricQuery,
        }),
        [chart, metricQuery],
    );
    const exploreFromHereUrl = useMemo(() => {
        const { pathname, search } = getExplorerUrlFromCreateSavedChartVersion(
            chartWithDashboardFilters.projectUuid,
            chartWithDashboardFilters,
        );
        return `${pathname}?${search}`;
    }, [chartWithDashboardFilters]);

    const userCanManageChart = user.data?.ability?.can('manage', 'SavedChart');

    return (
        <>
            <GlobalTileStyles />

            <TileBase
                extraHeaderElement={
                    appliedFilterRules.length > 0 && (
                        <Tooltip
                            label={
                                <FilterWrapper>
                                    <FilterLabel>
                                        Dashboard filter
                                        {appliedFilterRules.length > 1
                                            ? 's'
                                            : ''}{' '}
                                        applied:
                                    </FilterLabel>
                                    {appliedFilterRules.map(renderFilterRule)}
                                </FilterWrapper>
                            }
                            position="bottom-end"
                            withArrow
                            withinPortal
                        >
                            <MantineIcon icon={IconFilter} />
                        </Tooltip>
                    )
                }
                title={title || chart.name || ''}
                chartName={chart.name}
                titleHref={`/projects/${projectUuid}/saved/${savedChartUuid}/`}
                description={chart.description}
                belongsToDashboard={belongsToDashboard}
                extraMenuItems={
                    savedChartUuid !== null &&
                    user.data?.ability?.can('manage', 'Explore') && (
                        <Tooltip
                            disabled={!isEditMode}
                            label="Finish editing dashboard to use these actions"
                        >
                            <Box>
                                {userCanManageChart && (
                                    <LinkMenuItem
                                        icon="document-open"
                                        text="Edit chart"
                                        disabled={isEditMode}
                                        onClick={() => {
                                            if (belongsToDashboard) {
                                                storeDashboard(
                                                    dashboardTiles,
                                                    filtersFromContext,
                                                    haveTilesChanged,
                                                    haveFiltersChanged,
                                                    dashboard?.uuid,
                                                    dashboard?.name,
                                                );
                                            }
                                        }}
                                        href={`/projects/${projectUuid}/saved/${savedChartUuid}/edit?fromDashboard=${dashboardUuid}`}
                                    />
                                )}

                                {exploreFromHereUrl && (
                                    <LinkMenuItem
                                        icon="series-search"
                                        text="Explore from here"
                                        disabled={isEditMode}
                                        href={exploreFromHereUrl}
                                    />
                                )}

                                {chart.chartConfig.type === ChartType.TABLE && (
                                    <MenuItem2
                                        icon="export"
                                        text="Export CSV"
                                        disabled={isEditMode}
                                        onClick={() =>
                                            setIsCSVExportModalOpen(true)
                                        }
                                    />
                                )}
                                {chart.chartConfig.type === ChartType.TABLE && (
                                    <ExportGoogleSheet
                                        savedChart={chartWithDashboardFilters}
                                        disabled={isEditMode}
                                    />
                                )}

                                {chart.dashboardUuid && userCanManageChart && (
                                    <MenuItem2
                                        icon={<IconFolders size={16} />}
                                        text="Move to space"
                                        onClick={() => setIsMovingChart(true)}
                                        disabled={isEditMode}
                                    />
                                )}
                            </Box>
                        </Tooltip>
                    )
                }
                {...props}
            >
                <>
                    <Popover2
                        content={
                            <div onContextMenu={cancelContextMenu}>
                                <Menu>
                                    {viewUnderlyingDataOptions?.value && (
                                        <CopyToClipboard
                                            text={
                                                viewUnderlyingDataOptions.value
                                                    .formatted
                                            }
                                            onCopy={() => {
                                                showToastSuccess({
                                                    title: 'Copied to clipboard!',
                                                });
                                            }}
                                        >
                                            <MenuItem2
                                                text="Copy value"
                                                icon="duplicate"
                                            />
                                        </CopyToClipboard>
                                    )}
                                    <Can
                                        I="view"
                                        this={subject('UnderlyingData', {
                                            organizationUuid:
                                                user.data?.organizationUuid,
                                            projectUuid: projectUuid,
                                        })}
                                    >
                                        {' '}
                                        {!hasCustomDimension(metricQuery) && (
                                            <MenuItem2
                                                text="View underlying data"
                                                icon="layers"
                                                onClick={() => {
                                                    if (
                                                        !viewUnderlyingDataOptions
                                                    ) {
                                                        return;
                                                    }

                                                    openUnderlyingDataModal({
                                                        ...viewUnderlyingDataOptions,
                                                        dashboardFilters:
                                                            appliedDashboardFilters,
                                                    });
                                                    track({
                                                        name: EventName.VIEW_UNDERLYING_DATA_CLICKED,
                                                        properties: {
                                                            organizationId:
                                                                user?.data
                                                                    ?.organizationUuid,
                                                            userId: user?.data
                                                                ?.userUuid,
                                                            projectId:
                                                                projectUuid,
                                                        },
                                                    });
                                                }}
                                            />
                                        )}
                                    </Can>

                                    <Can
                                        I="manage"
                                        this={subject('Explore', {
                                            organizationUuid:
                                                user.data?.organizationUuid,
                                            projectUuid: projectUuid,
                                        })}
                                    >
                                        <DrillDownMenuItem
                                            {...viewUnderlyingDataOptions}
                                            dashboardFilters={
                                                appliedDashboardFilters
                                            }
                                            trackingData={{
                                                organizationId:
                                                    user.data?.organizationUuid,
                                                userId: user.data?.userUuid,
                                                projectId: projectUuid,
                                            }}
                                        />
                                    </Can>
                                    <MenuItem2
                                        icon="filter"
                                        text="Filter dashboard to..."
                                    >
                                        {dashboardTileFilterOptions.map(
                                            (filter) => (
                                                <MenuItem2
                                                    key={filter.id}
                                                    text={`${friendlyName(
                                                        filter.target.fieldId,
                                                    )} is ${
                                                        filter.values &&
                                                        filter.values[0]
                                                    }`}
                                                    onClick={() => {
                                                        track({
                                                            name: EventName.ADD_FILTER_CLICKED,
                                                            properties: {
                                                                mode: isEditMode
                                                                    ? 'edit'
                                                                    : 'viewer',
                                                            },
                                                        });

                                                        const fields = explore
                                                            ? getFields(explore)
                                                            : [];
                                                        const field =
                                                            fields.find(
                                                                (f) =>
                                                                    fieldId(
                                                                        f,
                                                                    ) ===
                                                                    filter
                                                                        .target
                                                                        .fieldId,
                                                            );

                                                        track({
                                                            name: EventName.CROSS_FILTER_DASHBOARD_APPLIED,
                                                            properties: {
                                                                fieldType:
                                                                    field?.type,
                                                                projectId:
                                                                    projectUuid,
                                                                dashboardId:
                                                                    dashboardUuid,
                                                            },
                                                        });

                                                        addDimensionDashboardFilter(
                                                            filter,
                                                            !isEditMode,
                                                        );
                                                    }}
                                                />
                                            ),
                                        )}
                                    </MenuItem2>
                                </Menu>
                            </div>
                        }
                        enforceFocus={false}
                        hasBackdrop={true}
                        isOpen={contextMenuIsOpen}
                        minimal={true}
                        onClose={() => setContextMenuIsOpen(false)}
                        placement="right-start"
                        positioningStrategy="fixed"
                        rootBoundary={'viewport'}
                        renderTarget={contextMenuRenderTarget}
                        transitionDuration={100}
                    />
                    <ValidDashboardChartTile
                        tileUuid={tileUuid}
                        chartAndResults={chartAndResults}
                        project={projectUuid}
                        isTitleHidden={hideTitle}
                        onSeriesContextMenu={onSeriesContextMenu}
                    />
                </>
            </TileBase>
            {chart.spaceUuid && (
                <MoveChartThatBelongsToDashboardModal
                    className={'non-draggable'}
                    uuid={chart.uuid}
                    name={chart.name}
                    spaceUuid={chart.spaceUuid}
                    spaceName={chart.spaceName}
                    opened={isMovingChart}
                    onClose={() => setIsMovingChart(false)}
                    onConfirm={() => {
                        setDashboardTiles(
                            (currentDashboardTiles) =>
                                currentDashboardTiles?.map((tile) =>
                                    tile.uuid === tileUuid && isChartTile(tile)
                                        ? {
                                              ...tile,
                                              properties: {
                                                  ...tile.properties,
                                                  belongsToDashboard: false,
                                              },
                                          }
                                        : tile,
                                ) ?? [],
                        );
                    }}
                />
            )}
            {isCSVExportModalOpen ? (
                <ExportResultAsCSVModal
                    projectUuid={projectUuid}
                    savedChart={chartWithDashboardFilters}
                    rows={rows}
                    onClose={() => setIsCSVExportModalOpen(false)}
                    onConfirm={() => setIsCSVExportModalOpen(false)}
                />
            ) : null}
        </>
    );
};

const DashboardChartTileMinimal: FC<DashboardChartTileMainProps> = (props) => {
    const {
        tile: {
            uuid: tileUuid,
            properties: { savedChartUuid, hideTitle, title },
        },
        chartAndResults,
    } = props;
    const { chart } = chartAndResults;
    const { projectUuid } = useParams<{ projectUuid: string }>();

    return (
        <TileBase
            title={title || chart.name || ''}
            titleHref={`/projects/${projectUuid}/saved/${savedChartUuid}/`}
            description={chart.description}
            isLoading={false}
            {...props}
        >
            <ValidDashboardChartTileMinimal
                tileUuid={tileUuid}
                isTitleHidden={hideTitle}
                chartAndResults={chartAndResults}
                title={title || chart.name}
            />
        </TileBase>
    );
};

type DashboardChartTileProps = Omit<
    DashboardChartTileMainProps,
    'chartAndResults'
> & {
    minimal?: boolean;
};

const DashboardChartTile: FC<DashboardChartTileProps> = ({
    minimal = false,
    ...rest
}) => {
    const { isError, isLoading, data } = useDashboardChart(
        rest.tile.uuid,
        rest.tile.properties?.savedChartUuid ?? null,
    );
    if (isLoading) return <TileBase isLoading={true} title={''} {...rest} />;
    if (isError || !data)
        return (
            <TileBase title={''} {...rest}>
                <NonIdealState
                    icon="lock"
                    title={`You don't have access to view this chart`}
                ></NonIdealState>
            </TileBase>
        );

    return (
        <MetricQueryDataProvider
            metricQuery={data?.metricQuery}
            tableName={data?.chart.tableName || ''}
        >
            {minimal ? (
                <DashboardChartTileMinimal {...rest} chartAndResults={data} />
            ) : (
                <DashboardChartTileMain {...rest} chartAndResults={data} />
            )}
            <UnderlyingDataModal />
            <DrillDownModal />
        </MetricQueryDataProvider>
    );
};

export default DashboardChartTile;
