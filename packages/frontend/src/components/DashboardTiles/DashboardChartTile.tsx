import { Menu, NonIdealState, Portal, Tag } from '@blueprintjs/core';
import {
    MenuItem2,
    Popover2,
    Popover2TargetProps,
} from '@blueprintjs/popover2';
import { subject } from '@casl/ability';
import {
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
import useDashboardFiltersForExplore from '../../hooks/dashboard/useDashboardFiltersForExplore';
import useDashboardStorage from '../../hooks/dashboard/useDashboardStorage';
import useSavedQueryWithDashboardFilters from '../../hooks/dashboard/useSavedQueryWithDashboardFilters';
import { EChartSeries } from '../../hooks/echarts/useEcharts';
import { uploadGsheet } from '../../hooks/gdrive/useGdrive';
import useToaster from '../../hooks/toaster/useToaster';
import { useExplore } from '../../hooks/useExplore';
import { getExplorerUrlFromCreateSavedChartVersion } from '../../hooks/useExplorerRoute';
import { useChartResults } from '../../hooks/useQueryResults';
import { useSavedQuery } from '../../hooks/useSavedQuery';
import { useApp } from '../../providers/AppProvider';
import { useDashboardContext } from '../../providers/DashboardProvider';
import { useTracking } from '../../providers/TrackingProvider';
import { EventName } from '../../types/Events';
import { Can } from '../common/Authorization';
import ErrorState from '../common/ErrorState';
import { getConditionalRuleLabel } from '../common/Filters/configs';
import LinkMenuItem from '../common/LinkMenuItem';
import MantineIcon from '../common/MantineIcon';
import MoveChartThatBelongsToDashboardModal from '../common/modal/MoveChartThatBelongsToDashboardModal';
import ExportCSVModal from '../ExportCSV/ExportCSVModal';
import LightdashVisualization from '../LightdashVisualization';
import VisualizationProvider from '../LightdashVisualization/VisualizationProvider';
import DrillDownMenuItem from '../MetricQueryData/DrillDownMenuItem';
import {
    getDataFromChartClick,
    useMetricQueryDataContext,
} from '../MetricQueryData/MetricQueryDataProvider';
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
    onClose: () => void;
    onConfirm: () => void;
}

const ExportResultAsCSVModal: FC<ExportResultAsCSVModalProps> = ({
    savedChart,
    onClose,
    onConfirm,
}) => {
    const { showToastError } = useToaster();
    const {
        data: resultData,
        isLoading,
        error,
    } = useChartResults(savedChart.uuid, savedChart.metricQuery.filters);

    useEffect(() => {
        if (error) {
            showToastError({
                title: 'Error exporting CSV',
                subtitle: error.error.message,
                key: 'error-exporting-csv',
            });
        }
    }, [error, showToastError]);
    if (isLoading || error || !resultData) return null;

    const rows = resultData?.rows;
    const getCsvLink = async (limit: number | null, onlyRaw: boolean) => {
        const csvResponse = await downloadCsv({
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
        });
        return csvResponse;
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
        const gsheetResponse = await uploadGsheet({
            projectUuid: savedChart.projectUuid,
            exploreId: savedChart.tableName,
            metricQuery: savedChart.metricQuery,
            columnOrder: savedChart.tableConfig.columnOrder,
            showTableNames: true,
        });
        return gsheetResponse;
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
    data: SavedChart;
    isTitleHidden?: boolean;
    project: string;
    onSeriesContextMenu?: (
        e: EchartSeriesClickEvent,
        series: EChartSeries[],
    ) => void;
}> = ({ tileUuid, isTitleHidden = false, data, onSeriesContextMenu }) => {
    const { addSuggestions, addResultsCacheTime, invalidateCache } =
        useDashboardContext();
    const {
        data: resultData,
        isLoading,
        error,
    } = useChartResults(data.uuid, data.metricQuery.filters, invalidateCache);
    const { data: explore } = useExplore(data.tableName);
    const { health } = useApp();

    useEffect(() => {
        if (resultData) {
            addSuggestions(
                resultData.metricQuery.dimensions.reduce((sum, dimensionId) => {
                    const newSuggestions: string[] =
                        resultData.rows.reduce<string[]>((acc, row) => {
                            const value = row[dimensionId]?.value.raw;
                            if (typeof value === 'string') {
                                return [...acc, value];
                            }
                            return acc;
                        }, []) || [];
                    return { ...sum, [dimensionId]: newSuggestions };
                }, {}),
            );
            addResultsCacheTime(resultData.cacheMetadata);
        }
    }, [addSuggestions, addResultsCacheTime, resultData]);

    if (health.isLoading || !health.data) {
        return null;
    }

    if (error) {
        return <ErrorState error={error.error} />;
    }

    return (
        <VisualizationProvider
            chartType={data.chartConfig.type}
            initialChartConfig={data.chartConfig}
            initialPivotDimensions={data.pivotConfig?.columns}
            resultsData={resultData}
            explore={explore}
            isLoading={isLoading}
            onSeriesContextMenu={onSeriesContextMenu}
            columnOrder={data.tableConfig.columnOrder}
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
    data: SavedChart;
}> = ({ tileUuid, data, isTitleHidden = false }) => {
    const {
        data: resultData,
        isLoading,
        error,
    } = useChartResults(data.uuid, data.metricQuery.filters);
    const { data: explore } = useExplore(data.tableName);

    const { health } = useApp();

    if (health.isLoading || !health.data) {
        return null;
    }

    if (error) {
        return <ErrorState error={error.error} />;
    }

    return (
        <VisualizationProvider
            minimal
            chartType={data.chartConfig.type}
            initialChartConfig={data.chartConfig}
            initialPivotDimensions={data.pivotConfig?.columns}
            resultsData={resultData}
            explore={explore}
            isLoading={isLoading}
            columnOrder={data.tableConfig.columnOrder}
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

const InvalidDashboardChartTile: FC<
    Pick<DashboardChartTileMainProps, 'tile'>
> = () => {
    return (
        <NonIdealState
            title="No chart available"
            description="Chart might have been deleted or you don't have permissions to see it."
            icon="search"
        />
    );
};

interface DashboardChartTileMainProps
    extends Pick<
        React.ComponentProps<typeof TileBase>,
        'tile' | 'onEdit' | 'onDelete' | 'isEditMode'
    > {
    tile: IDashboardChartTile;
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
        isEditMode,
    } = props;
    const { projectUuid, dashboardUuid } = useParams<{
        projectUuid: string;
        dashboardUuid: string;
    }>();
    const { data: savedQuery, isLoading } = useSavedQuery({
        id: savedChartUuid || undefined,
        useQueryOptions: { refetchOnMount: false },
    });
    const { data: explore, isLoading: isLoadingExplore } = useExplore(
        savedQuery?.tableName,
    );

    const {
        addDimensionDashboardFilter,
        setDashboardTiles,
        dashboardTiles,
        dashboardFilters: filtersFromCOntext,
        haveTilesChanged,
        haveFiltersChanged,
        dashboard,
    } = useDashboardContext();

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
            const pivot = savedQuery?.pivotConfig?.columns?.[0];
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
                savedQuery?.metricQuery.additionalMetrics,
                savedQuery?.metricQuery.tableCalculations,
            );

            const underlyingData = getDataFromChartClick(
                e,
                allItemsMap,
                series,
            );
            const queryDimensions = savedQuery?.metricQuery.dimensions || [];
            setViewUnderlyingDataOptions({
                ...underlyingData,
                dimensions: queryDimensions,
            });
        },
        [explore, savedQuery],
    );

    const { data: savedQueryWithDashboardFilters, dashboardFilters } =
        useSavedQueryWithDashboardFilters(tileUuid, savedChartUuid);

    const dashboardFiltersThatApplyToChart = useDashboardFiltersForExplore(
        tileUuid,
        explore,
    );

    const appliedFilterRules = dashboardFilters
        ? [...dashboardFilters.dimensions, ...dashboardFilters.metrics]
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

    const exploreFromHereUrl = useMemo(() => {
        if (savedQueryWithDashboardFilters) {
            const { pathname, search } =
                getExplorerUrlFromCreateSavedChartVersion(
                    savedQueryWithDashboardFilters.projectUuid,
                    savedQueryWithDashboardFilters,
                );
            return `${pathname}?${search}`;
        }
    }, [savedQueryWithDashboardFilters]);

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
                title={title || savedQueryWithDashboardFilters?.name || ''}
                chartName={savedQueryWithDashboardFilters?.name}
                titleHref={`/projects/${projectUuid}/saved/${savedChartUuid}/`}
                description={savedQueryWithDashboardFilters?.description}
                isLoading={isLoading || isLoadingExplore}
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
                                                    filtersFromCOntext,
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

                                {savedQueryWithDashboardFilters &&
                                    savedQueryWithDashboardFilters.chartConfig
                                        .type === ChartType.TABLE && (
                                        <MenuItem2
                                            icon="export"
                                            text="Export CSV"
                                            disabled={isEditMode}
                                            onClick={() =>
                                                setIsCSVExportModalOpen(true)
                                            }
                                        />
                                    )}
                                {savedQueryWithDashboardFilters &&
                                    savedQueryWithDashboardFilters.chartConfig
                                        .type === ChartType.TABLE && (
                                        <ExportGoogleSheet
                                            savedChart={
                                                savedQueryWithDashboardFilters
                                            }
                                            disabled={isEditMode}
                                        />
                                    )}

                                {savedQueryWithDashboardFilters?.dashboardUuid &&
                                    userCanManageChart && (
                                        <MenuItem2
                                            icon={<IconFolders size={16} />}
                                            text="Move to space"
                                            onClick={() =>
                                                setIsMovingChart(true)
                                            }
                                            disabled={isEditMode}
                                        />
                                    )}
                            </Box>
                        </Tooltip>
                    )
                }
                {...props}
            >
                {savedQueryWithDashboardFilters ? (
                    <>
                        <Popover2
                            content={
                                <div onContextMenu={cancelContextMenu}>
                                    <Menu>
                                        {viewUnderlyingDataOptions?.value && (
                                            <CopyToClipboard
                                                text={
                                                    viewUnderlyingDataOptions
                                                        .value.formatted
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
                                            {!hasCustomDimension(
                                                savedQuery?.metricQuery,
                                            ) && (
                                                <MenuItem2
                                                    text="View underlying data"
                                                    icon="layers"
                                                    onClick={() => {
                                                        if (
                                                            !viewUnderlyingDataOptions
                                                        ) {
                                                            return;
                                                        }

                                                        openUnderlyingDataModal(
                                                            {
                                                                ...viewUnderlyingDataOptions,
                                                                dashboardFilters:
                                                                    dashboardFiltersThatApplyToChart,
                                                            },
                                                        );
                                                        track({
                                                            name: EventName.VIEW_UNDERLYING_DATA_CLICKED,
                                                            properties: {
                                                                organizationId:
                                                                    user?.data
                                                                        ?.organizationUuid,
                                                                userId: user
                                                                    ?.data
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
                                                    dashboardFiltersThatApplyToChart
                                                }
                                                trackingData={{
                                                    organizationId:
                                                        user.data
                                                            ?.organizationUuid,
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
                                                            filter.target
                                                                .fieldId,
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

                                                            const fields =
                                                                explore
                                                                    ? getFields(
                                                                          explore,
                                                                      )
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
                            data={savedQueryWithDashboardFilters}
                            project={projectUuid}
                            isTitleHidden={hideTitle}
                            onSeriesContextMenu={onSeriesContextMenu}
                        />
                    </>
                ) : (
                    <InvalidDashboardChartTile tile={props.tile} />
                )}
            </TileBase>
            {savedQueryWithDashboardFilters?.spaceUuid && (
                <MoveChartThatBelongsToDashboardModal
                    className={'non-draggable'}
                    uuid={savedQueryWithDashboardFilters.uuid}
                    name={savedQueryWithDashboardFilters.name}
                    spaceUuid={savedQueryWithDashboardFilters.spaceUuid}
                    spaceName={savedQueryWithDashboardFilters.spaceName}
                    opened={isMovingChart}
                    onClose={() => setIsMovingChart(false)}
                    onConfirm={() => {
                        setDashboardTiles((currentDashboardTiles) =>
                            currentDashboardTiles.map((tile) =>
                                tile.uuid === tileUuid && isChartTile(tile)
                                    ? {
                                          ...tile,
                                          properties: {
                                              ...tile.properties,
                                              belongsToDashboard: false,
                                          },
                                      }
                                    : tile,
                            ),
                        );
                    }}
                />
            )}
            {savedQueryWithDashboardFilters && isCSVExportModalOpen ? (
                <ExportResultAsCSVModal
                    projectUuid={projectUuid}
                    savedChart={savedQueryWithDashboardFilters}
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
    } = props;
    const { projectUuid } = useParams<{ projectUuid: string }>();

    const { isLoading, data } = useSavedQueryWithDashboardFilters(
        tileUuid,
        savedChartUuid,
    );
    return (
        <TileBase
            title={title || data?.name || ''}
            titleHref={`/projects/${projectUuid}/saved/${savedChartUuid}/`}
            description={data?.description}
            isLoading={isLoading}
            {...props}
        >
            {data ? (
                <ValidDashboardChartTileMinimal
                    tileUuid={tileUuid}
                    isTitleHidden={hideTitle}
                    data={data}
                    title={title || data.name}
                />
            ) : (
                <InvalidDashboardChartTile tile={props.tile} />
            )}
        </TileBase>
    );
};

interface DashboardChartTileProps extends DashboardChartTileMainProps {
    minimal?: boolean;
}

const DashboardChartTile: FC<DashboardChartTileProps> = ({
    minimal = false,
    ...rest
}) => {
    if (minimal) {
        return <DashboardChartTileMinimal {...rest} />;
    } else {
        return <DashboardChartTileMain {...rest} />;
    }
};

export default DashboardChartTile;
