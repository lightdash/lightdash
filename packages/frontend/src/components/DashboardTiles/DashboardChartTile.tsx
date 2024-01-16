import { subject } from '@casl/ability';
import {
    ApiChartAndResults,
    ApiError,
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
    ItemsMap,
    PivotReference,
    ResultValue,
    SavedChart,
} from '@lightdash/common';
import {
    ActionIcon,
    Badge,
    Box,
    HoverCard,
    Menu,
    Portal,
    Stack,
    Text,
    Tooltip,
} from '@mantine/core';
import { useClipboard } from '@mantine/hooks';
import {
    IconAlertCircle,
    IconCopy,
    IconFilter,
    IconFolders,
    IconStack,
    IconTableExport,
    IconTelescope,
} from '@tabler/icons-react';
import React, { FC, useCallback, useEffect, useMemo, useState } from 'react';
import { useHistory, useParams } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { downloadCsv } from '../../api/csv';
import { DateZoomInfoOnTile } from '../../features/dateZoom';
import { ExportToGoogleSheet } from '../../features/export';
import useDashboardChart from '../../hooks/dashboard/useDashboardChart';
import useDashboardFiltersForTile from '../../hooks/dashboard/useDashboardFiltersForTile';
import { EChartSeries } from '../../hooks/echarts/useEchartsCartesianConfig';
import { uploadGsheet } from '../../hooks/gdrive/useGdrive';
import useToaster from '../../hooks/toaster/useToaster';
import { getExplorerUrlFromCreateSavedChartVersion } from '../../hooks/useExplorerRoute';
import { useCreateShareMutation } from '../../hooks/useShare';
import { useApp } from '../../providers/AppProvider';
import { useDashboardContext } from '../../providers/DashboardProvider';
import { useTracking } from '../../providers/TrackingProvider';
import { EventName } from '../../types/Events';
import { Can } from '../common/Authorization';
import { getConditionalRuleLabel } from '../common/Filters/FilterInputs';
import MantineIcon from '../common/MantineIcon';
import MoveChartThatBelongsToDashboardModal from '../common/modal/MoveChartThatBelongsToDashboardModal';
import SuboptimalState from '../common/SuboptimalState/SuboptimalState';
import ExportCSVModal from '../ExportCSV/ExportCSVModal';
import LightdashVisualization from '../LightdashVisualization';
import VisualizationProvider from '../LightdashVisualization/VisualizationProvider';
import DrillDownMenuItem from '../MetricQueryData/DrillDownMenuItem';
import { DrillDownModal } from '../MetricQueryData/DrillDownModal';
import MetricQueryDataProvider, {
    getDataFromChartClick,
    useMetricQueryDataContext,
} from '../MetricQueryData/MetricQueryDataProvider';
import UnderlyingDataModal from '../MetricQueryData/UnderlyingDataModal';
import { EchartSeriesClickEvent } from '../SimpleChart';
import EditChartMenuItem from './EditChartMenuItem';
import TileBase from './TileBase/index';

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
            projectUuid={savedChart.projectUuid}
            opened
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
            asMenuItem
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
    chartAndResults: { chart, metricQuery, rows, cacheMetadata, fields },
    onSeriesContextMenu,
}) => {
    const addResultsCacheTime = useDashboardContext(
        (c) => c.addResultsCacheTime,
    );

    const dashboardFilters = useDashboardFiltersForTile(tileUuid);
    const invalidateCache = useDashboardContext((c) => c.invalidateCache);

    const { health } = useApp();

    useEffect(() => {
        addResultsCacheTime(cacheMetadata);
    }, [cacheMetadata, addResultsCacheTime]);

    const resultData = useMemo(
        () => ({
            rows,
            metricQuery,
            cacheMetadata,
            fields,
        }),
        [rows, metricQuery, cacheMetadata, fields],
    );

    if (health.isInitialLoading || !health.data) {
        return null;
    }

    return (
        <VisualizationProvider
            chartConfig={chart.chartConfig}
            initialPivotDimensions={chart.pivotConfig?.columns}
            resultsData={resultData}
            isLoading={false}
            onSeriesContextMenu={onSeriesContextMenu}
            columnOrder={chart.tableConfig.columnOrder}
            pivotTableMaxColumnLimit={health.data.pivotTable.maxColumnLimit}
            savedChartUuid={chart.uuid}
            dashboardFilters={dashboardFilters}
            invalidateCache={invalidateCache}
            colorPalette={chart.colorPalette}
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
    chartAndResults: { chart, metricQuery, rows, cacheMetadata, fields },
    isTitleHidden = false,
}) => {
    const { health } = useApp();

    const dashboardFilters = useDashboardFiltersForTile(tileUuid);

    const resultData = useMemo(
        () => ({ rows, metricQuery, cacheMetadata, fields }),
        [rows, metricQuery, cacheMetadata, fields],
    );

    if (health.isInitialLoading || !health.data) {
        return null;
    }

    return (
        <VisualizationProvider
            minimal
            chartConfig={chart.chartConfig}
            initialPivotDimensions={chart.pivotConfig?.columns}
            resultsData={resultData}
            isLoading={false}
            columnOrder={chart.tableConfig.columnOrder}
            pivotTableMaxColumnLimit={health.data.pivotTable.maxColumnLimit}
            savedChartUuid={chart.uuid}
            dashboardFilters={dashboardFilters}
            colorPalette={chart.colorPalette}
        >
            <LightdashVisualization
                isDashboard
                tileUuid={tileUuid}
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
    const clipboard = useClipboard({ timeout: 200 });
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

    const [contextMenuIsOpen, setContextMenuIsOpen] = useState(false);
    const [contextMenuTargetOffset, setContextMenuTargetOffset] = useState<{
        left: number;
        top: number;
    }>();
    const [isMovingChart, setIsMovingChart] = useState(false);
    const { user } = useApp();

    const { openUnderlyingDataModal } = useMetricQueryDataContext();

    const [viewUnderlyingDataOptions, setViewUnderlyingDataOptions] = useState<{
        item: ItemsMap[string] | undefined;
        value: ResultValue;
        fieldValues: Record<string, ResultValue>;
        dimensions: string[];
        pivotReference?: PivotReference;
    }>();
    const { mutateAsync: createShareUrl } = useCreateShareMutation();
    const history = useHistory();

    const handleViewUnderlyingData = useCallback(() => {
        if (!viewUnderlyingDataOptions) return;

        openUnderlyingDataModal({
            ...viewUnderlyingDataOptions,
        });
        track({
            name: EventName.VIEW_UNDERLYING_DATA_CLICKED,
            properties: {
                organizationId: user?.data?.organizationUuid,
                userId: user?.data?.userUuid,
                projectId: projectUuid,
            },
        });
    }, [
        track,
        user,
        projectUuid,
        openUnderlyingDataModal,
        viewUnderlyingDataOptions,
    ]);

    const handleCopyToClipboard = useCallback(() => {
        if (!viewUnderlyingDataOptions) return;
        const value = viewUnderlyingDataOptions.value.formatted;

        clipboard.copy(value);
        showToastSuccess({ title: 'Copied to clipboard!' });
    }, [viewUnderlyingDataOptions, clipboard, showToastSuccess]);

    const handleAddFilter = useCallback(
        (filter: DashboardFilterRule) => {
            track({
                name: EventName.ADD_FILTER_CLICKED,
                properties: {
                    mode: isEditMode ? 'edit' : 'viewer',
                },
            });

            const fields = explore ? getFields(explore) : [];
            const field = fields.find(
                (f) => fieldId(f) === filter.target.fieldId,
            );

            track({
                name: EventName.CROSS_FILTER_DASHBOARD_APPLIED,
                properties: {
                    fieldType: field?.type,
                    projectId: projectUuid,
                    dashboardId: dashboardUuid,
                },
            });

            addDimensionDashboardFilter(filter, !isEditMode);
        },
        [
            track,
            isEditMode,
            addDimensionDashboardFilter,
            explore,
            projectUuid,
            dashboardUuid,
        ],
    );

    const handleCancelContextMenu = useCallback(
        (e: React.SyntheticEvent<HTMLDivElement>) => e.preventDefault(),
        [],
    );

    const [dashboardTileFilterOptions, setDashboardFilterOptions] = useState<
        DashboardFilterRule[]
    >([]);

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

    const chartWithDashboardFilters = useMemo(
        () => ({
            ...chart,
            metricQuery,
        }),
        [chart, metricQuery],
    );
    const { pathname: chartPathname, search: chartSearch } = useMemo(
        () =>
            getExplorerUrlFromCreateSavedChartVersion(
                chartWithDashboardFilters.projectUuid,
                chartWithDashboardFilters,
            ),
        [chartWithDashboardFilters],
    );

    const userCanManageChart = user.data?.ability?.can('manage', 'SavedChart');

    return (
        <>
            <TileBase
                extraHeaderElement={
                    appliedFilterRules.length > 0 && (
                        <HoverCard
                            withArrow
                            withinPortal
                            shadow="md"
                            position="bottom-end"
                            offset={4}
                            arrowOffset={10}
                        >
                            <HoverCard.Dropdown>
                                <Stack spacing="xs" align="flex-start">
                                    <Text color="gray.7" fw={500}>
                                        Dashboard filter
                                        {appliedFilterRules.length > 1
                                            ? 's'
                                            : ''}{' '}
                                        applied:
                                    </Text>

                                    {appliedFilterRules.map((filterRule) => {
                                        const fields: Field[] = explore
                                            ? getVisibleFields(explore)
                                            : [];

                                        const field = fields.find((f) => {
                                            return (
                                                fieldId(f) ===
                                                filterRule.target.fieldId
                                            );
                                        });
                                        if (!field || !isFilterableField(field))
                                            return `Tried to reference field with unknown id: ${filterRule.target.fieldId}`;

                                        const filterRuleLabels =
                                            getConditionalRuleLabel(
                                                filterRule,
                                                field,
                                            );
                                        return (
                                            <Badge
                                                key={filterRule.id}
                                                variant="outline"
                                                color="gray.4"
                                                radius="sm"
                                                size="lg"
                                                fz="xs"
                                                fw="normal"
                                                style={{
                                                    textTransform: 'none',
                                                    color: 'black',
                                                }}
                                            >
                                                <Text fw={600} span>
                                                    {filterRuleLabels.field}:
                                                </Text>{' '}
                                                {filterRule.disabled ? (
                                                    <>is any value</>
                                                ) : (
                                                    <>
                                                        {
                                                            filterRuleLabels.operator
                                                        }{' '}
                                                        <Text fw={600} span>
                                                            {
                                                                filterRuleLabels.value
                                                            }
                                                        </Text>
                                                    </>
                                                )}
                                            </Badge>
                                        );
                                    })}
                                </Stack>
                            </HoverCard.Dropdown>

                            <HoverCard.Target>
                                <ActionIcon size="sm">
                                    <MantineIcon icon={IconFilter} />
                                </ActionIcon>
                            </HoverCard.Target>
                        </HoverCard>
                    )
                }
                titleLeftIcon={
                    metricQuery.metadata?.hasADateDimension ? (
                        <DateZoomInfoOnTile
                            chartUuid={savedChartUuid}
                            dateDimension={
                                metricQuery.metadata.hasADateDimension
                            }
                        />
                    ) : null
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
                                    <EditChartMenuItem
                                        tile={props.tile}
                                        disabled={isEditMode}
                                    />
                                )}

                                {chartPathname && (
                                    <Menu.Item
                                        icon={
                                            <MantineIcon icon={IconTelescope} />
                                        }
                                        disabled={isEditMode}
                                        onClick={() => {
                                            createShareUrl({
                                                path: chartPathname,
                                                params: `?` + chartSearch,
                                            }).then((shareUrl) => {
                                                history.push(
                                                    `/share/${shareUrl.nanoid}`,
                                                );
                                            });
                                        }}
                                    >
                                        Explore from here
                                    </Menu.Item>
                                )}

                                {chart.chartConfig.type === ChartType.TABLE && (
                                    <Menu.Item
                                        icon={
                                            <MantineIcon
                                                icon={IconTableExport}
                                            />
                                        }
                                        disabled={isEditMode}
                                        onClick={() =>
                                            setIsCSVExportModalOpen(true)
                                        }
                                    >
                                        Export CSV
                                    </Menu.Item>
                                )}
                                {chart.chartConfig.type === ChartType.TABLE && (
                                    <ExportGoogleSheet
                                        savedChart={chartWithDashboardFilters}
                                        disabled={isEditMode}
                                    />
                                )}

                                {chart.dashboardUuid && userCanManageChart && (
                                    <Menu.Item
                                        icon={
                                            <MantineIcon icon={IconFolders} />
                                        }
                                        onClick={() => setIsMovingChart(true)}
                                        disabled={isEditMode}
                                    >
                                        Move to space
                                    </Menu.Item>
                                )}
                            </Box>
                        </Tooltip>
                    )
                }
                {...props}
            >
                <>
                    <Menu
                        opened={contextMenuIsOpen}
                        onClose={() => setContextMenuIsOpen(false)}
                        withinPortal
                        closeOnItemClick
                        closeOnEscape
                        shadow="md"
                        radius={0}
                        position="bottom-start"
                        offset={{
                            crossAxis: 0,
                            mainAxis: 0,
                        }}
                    >
                        <Portal>
                            <Menu.Target>
                                <div
                                    onContextMenu={handleCancelContextMenu}
                                    style={{
                                        position: 'absolute',
                                        ...contextMenuTargetOffset,
                                    }}
                                />
                            </Menu.Target>
                        </Portal>

                        <Menu.Dropdown>
                            {viewUnderlyingDataOptions?.value && (
                                <Menu.Item
                                    icon={<MantineIcon icon={IconCopy} />}
                                    onClick={handleCopyToClipboard}
                                >
                                    Copy value
                                </Menu.Item>
                            )}
                            <Can
                                I="view"
                                this={subject('UnderlyingData', {
                                    organizationUuid:
                                        user.data?.organizationUuid,
                                    projectUuid: projectUuid,
                                })}
                            >
                                {!hasCustomDimension(metricQuery) && (
                                    <Menu.Item
                                        icon={<MantineIcon icon={IconStack} />}
                                        onClick={handleViewUnderlyingData}
                                    >
                                        View underlying data
                                    </Menu.Item>
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
                                    trackingData={{
                                        organizationId:
                                            user.data?.organizationUuid,
                                        userId: user.data?.userUuid,
                                        projectId: projectUuid,
                                    }}
                                />
                            </Can>

                            {dashboardTileFilterOptions.length > 0 && (
                                <>
                                    <Menu.Divider />
                                    <Menu.Label>
                                        Filter dashboard to...
                                    </Menu.Label>

                                    {dashboardTileFilterOptions.map(
                                        (filter) => (
                                            <Menu.Item
                                                key={filter.id}
                                                icon={
                                                    <MantineIcon
                                                        icon={IconFilter}
                                                    />
                                                }
                                                onClick={() =>
                                                    handleAddFilter(filter)
                                                }
                                            >
                                                {friendlyName(
                                                    filter.target.fieldId,
                                                )}{' '}
                                                is{' '}
                                                <Text span fw={500}>
                                                    {filter.values &&
                                                        filter.values[0] &&
                                                        String(
                                                            filter.values[0],
                                                        )}
                                                </Text>
                                            </Menu.Item>
                                        ),
                                    )}
                                </>
                            )}
                        </Menu.Dropdown>
                    </Menu>

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

// Abstraction needed for enterprise version
// ts-unused-exports:disable-next-line
export const GenericDashboardChartTile: FC<
    DashboardChartTileProps & {
        isLoading: boolean;
        data: ApiChartAndResults | undefined;
        error: ApiError | null;
    }
> = ({
    minimal = false,
    tile,
    isEditMode,
    isLoading,
    data,
    error,
    ...rest
}) => {
    const { projectUuid } = useParams<{
        projectUuid: string;
        dashboardUuid: string;
    }>();
    const { user } = useApp();
    const userCanManageChart = user.data?.ability?.can('manage', 'SavedChart');

    if (isLoading) {
        return (
            <TileBase
                isEditMode={isEditMode}
                chartName={tile.properties.chartName ?? ''}
                titleHref={`/projects/${projectUuid}/saved/${tile.properties.savedChartUuid}/`}
                description={''}
                belongsToDashboard={tile.properties.belongsToDashboard}
                tile={tile}
                isLoading
                title={tile.properties.title || tile.properties.chartName || ''}
                extraMenuItems={
                    !minimal &&
                    userCanManageChart &&
                    tile.properties.savedChartUuid && (
                        <EditChartMenuItem tile={tile} />
                    )
                }
                {...rest}
            />
        );
    }

    if (error !== null || !data)
        return (
            <TileBase
                title=""
                isEditMode={isEditMode}
                tile={tile}
                extraMenuItems={
                    tile.properties.savedChartUuid && (
                        <Tooltip
                            disabled={!isEditMode}
                            label="Finish editing dashboard to edit this chart"
                        >
                            <Box>
                                <EditChartMenuItem
                                    tile={tile}
                                    disabled={isEditMode}
                                />
                            </Box>
                        </Tooltip>
                    )
                }
                {...rest}
            >
                <SuboptimalState
                    icon={IconAlertCircle}
                    title={error?.error?.message || 'No data available'}
                ></SuboptimalState>
            </TileBase>
        );

    return (
        <MetricQueryDataProvider
            metricQuery={data?.metricQuery}
            tableName={data?.chart.tableName || ''}
            explore={data?.explore}
        >
            {minimal ? (
                <DashboardChartTileMinimal
                    {...rest}
                    tile={tile}
                    isEditMode={isEditMode}
                    chartAndResults={data}
                />
            ) : (
                <DashboardChartTileMain
                    {...rest}
                    tile={tile}
                    isEditMode={isEditMode}
                    chartAndResults={data}
                />
            )}
            <UnderlyingDataModal />
            <DrillDownModal />
        </MetricQueryDataProvider>
    );
};

const DashboardChartTile: FC<DashboardChartTileProps> = (props) => {
    const { isInitialLoading, data, error } = useDashboardChart(
        props.tile.uuid,
        props.tile.properties?.savedChartUuid ?? null,
    );

    return (
        <GenericDashboardChartTile
            {...props}
            isLoading={isInitialLoading}
            data={data}
            error={error}
        />
    );
};

export default DashboardChartTile;
