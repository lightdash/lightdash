import { Menu, NonIdealState, Portal } from '@blueprintjs/core';
import {
    MenuItem2,
    Popover2,
    Popover2TargetProps,
    Tooltip2,
} from '@blueprintjs/popover2';
import {
    ChartType,
    DashboardChartTile as IDashboardChartTile,
    DashboardFilterRule,
    Field,
    fieldId,
    FilterGroup,
    FilterOperator,
    friendlyName,
    getDimensions,
    getFields,
    getItemMap,
    getResultValues,
    getVisibleFields,
    isFilterableField,
    PivotReference,
    ResultRow,
    SavedChart,
} from '@lightdash/common';
import React, { FC, useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import useDashboardFiltersForExplore from '../../hooks/dashboard/useDashboardFiltersForExplore';
import { EChartSeries } from '../../hooks/echarts/useEcharts';
import { useExplore } from '../../hooks/useExplore';
import { getExplorerUrlFromCreateSavedChartVersion } from '../../hooks/useExplorerRoute';
import { useSavedChartResults } from '../../hooks/useQueryResults';
import { useSavedQuery } from '../../hooks/useSavedQuery';
import { useApp } from '../../providers/AppProvider';
import { useDashboardContext } from '../../providers/DashboardProvider';
import { useTracking } from '../../providers/TrackingProvider';
import { EventName } from '../../types/Events';
import { getFilterRuleLabel } from '../common/Filters/configs';
import { TableColumn } from '../common/Table/types';
import CSVExporter from '../CSVExporter';
import { FilterValues } from '../DashboardFilter/ActiveFilters/ActiveFilters.styles';
import LightdashVisualization from '../LightdashVisualization';
import VisualizationProvider from '../LightdashVisualization/VisualizationProvider';
import DrillDownMenuItem from '../MetricQueryData/DrillDownMenuItem';
import {
    getDataFromChartClick,
    useMetricQueryDataContext,
} from '../MetricQueryData/MetricQueryDataProvider';
import { EchartSeriesClickEvent } from '../SimpleChart';
import TileBase from './TileBase/index';
import { FilterLabel } from './TileBase/TileBase.styles';

const ValidDashboardChartTile: FC<{
    tileUuid: string;
    data: SavedChart;
    project: string;
    onSeriesContextMenu?: (
        e: EchartSeriesClickEvent,
        series: EChartSeries[],
    ) => void;
}> = ({ tileUuid, data, project, onSeriesContextMenu }) => {
    const { data: resultData, isLoading } = useSavedChartResults(project, data);
    const { addSuggestions } = useDashboardContext();
    const { data: explore } = useExplore(data.tableName);

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
        }
    }, [addSuggestions, resultData]);

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
        >
            <LightdashVisualization
                isDashboard
                tileUuid={tileUuid}
                $padding={0}
            />
        </VisualizationProvider>
    );
};

const DownloadCSV: FC<{
    data: SavedChart;
    project: string;
}> = ({ data, project }) => {
    const { data: resultData } = useSavedChartResults(project, data);
    const rows = resultData?.rows;

    return (
        <CSVExporter
            data={getResultValues(rows || [])}
            filename={`${data?.name}.csv`}
            renderElement={({ handleCsvExport, isDisabled }) => (
                <MenuItem2
                    icon="export"
                    text="Export CSV"
                    disabled={isDisabled}
                    onClick={handleCsvExport}
                />
            )}
        />
    );
};

const InvalidDashboardChartTile: FC = () => (
    <NonIdealState
        title="No chart available"
        description="Chart might have been deleted or you don't have permissions to see it."
        icon="search"
    />
);

type Props = Pick<
    React.ComponentProps<typeof TileBase>,
    'tile' | 'onEdit' | 'onDelete' | 'isEditMode'
> & { tile: IDashboardChartTile };

const DashboardChartTile: FC<Props> = (props) => {
    const { track } = useTracking();
    const {
        tile: {
            uuid: tileUuid,
            properties: { savedChartUuid },
        },
        isEditMode,
    } = props;
    const { projectUuid, dashboardUuid } = useParams<{
        projectUuid: string;
        dashboardUuid: string;
    }>();
    const { data: savedQuery, isLoading } = useSavedQuery({
        id: savedChartUuid || undefined,
    });
    const { data: explore } = useExplore(savedQuery?.tableName);
    const { addDimensionDashboardFilter } = useDashboardContext();
    const [contextMenuIsOpen, setContextMenuIsOpen] = useState(false);
    const [contextMenuTargetOffset, setContextMenuTargetOffset] = useState<{
        left: number;
        top: number;
    }>();
    const { openUnderlyingDataModel } = useMetricQueryDataContext();

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
        value: ResultRow[0]['value'];
        meta: TableColumn['meta'];
        row: ResultRow;
        dimensions: string[];
        pivotReference?: PivotReference;
    }>();
    const { user } = useApp();

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
    // START DASHBOARD FILTER LOGIC
    // TODO: move this logic out of component
    let savedQueryWithDashboardFilters: SavedChart | undefined;

    const dashboardFiltersThatApplyToChart = useDashboardFiltersForExplore(
        tileUuid,
        explore,
    );

    if (savedQuery) {
        const dimensionFilters: FilterGroup = {
            id: 'yes',
            and: [
                ...(savedQuery.metricQuery.filters.dimensions
                    ? [savedQuery.metricQuery.filters.dimensions]
                    : []),
                ...dashboardFiltersThatApplyToChart.dimensions,
            ],
        };
        const metricFilters: FilterGroup = {
            id: 'no',
            and: [
                ...(savedQuery.metricQuery.filters.metrics
                    ? [savedQuery.metricQuery.filters.metrics]
                    : []),
                ...dashboardFiltersThatApplyToChart.metrics,
            ],
        };
        savedQueryWithDashboardFilters = {
            ...savedQuery,
            metricQuery: {
                ...savedQuery.metricQuery,
                filters: {
                    dimensions: dimensionFilters,
                    metrics: metricFilters,
                },
            },
        };
    }
    // END DASHBOARD FILTER LOGIC

    const appliedFilterRules = [
        ...dashboardFiltersThatApplyToChart.dimensions,
        ...dashboardFiltersThatApplyToChart.metrics,
    ];

    const renderFilterRule = useCallback(
        (filterRule: DashboardFilterRule) => {
            const fields: Field[] = explore ? getVisibleFields(explore) : [];
            const field = fields.find(
                (f) => fieldId(f) === filterRule.target.fieldId,
            );
            if (field && isFilterableField(field)) {
                const filterRuleLabels = getFilterRuleLabel(filterRule, field);
                return (
                    <div key={field.name}>
                        {filterRuleLabels.field}: {filterRuleLabels.operator}{' '}
                        <FilterValues>{filterRuleLabels.value}</FilterValues>
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

    return (
        <TileBase
            extraHeaderElement={
                appliedFilterRules.length > 0 && (
                    <div>
                        <Tooltip2
                            content={
                                <div
                                    style={{
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '4px',
                                    }}
                                >
                                    {appliedFilterRules.map(renderFilterRule)}
                                </div>
                            }
                            interactionKind="hover"
                            placement={'bottom-start'}
                        >
                            <FilterLabel>
                                Dashboard filter
                                {appliedFilterRules.length > 1 ? 's' : ''}{' '}
                                applied
                            </FilterLabel>
                        </Tooltip2>
                    </div>
                )
            }
            title={savedQueryWithDashboardFilters?.name || ''}
            description={savedQueryWithDashboardFilters?.description}
            isLoading={isLoading}
            extraMenuItems={
                savedChartUuid !== null && (
                    <>
                        {user.data?.ability?.can('manage', 'SavedChart') && (
                            <MenuItem2
                                icon="document-open"
                                text="Edit chart"
                                href={`/projects/${projectUuid}/saved/${savedChartUuid}/edit?fromDashboard=${dashboardUuid}`}
                            />
                        )}
                        <MenuItem2
                            icon="series-search"
                            text="Explore from here"
                            href={exploreFromHereUrl}
                        />
                        {savedQueryWithDashboardFilters &&
                            savedQueryWithDashboardFilters.chartConfig.type ===
                                ChartType.TABLE && (
                                <DownloadCSV
                                    data={savedQueryWithDashboardFilters}
                                    project={projectUuid}
                                />
                            )}
                    </>
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
                                    <MenuItem2
                                        text={`View underlying data`}
                                        icon={'layers'}
                                        onClick={(e) => {
                                            if (
                                                viewUnderlyingDataOptions !==
                                                undefined
                                            ) {
                                                const {
                                                    value,
                                                    meta,
                                                    row,
                                                    dimensions,
                                                    pivotReference,
                                                } = viewUnderlyingDataOptions;
                                                openUnderlyingDataModel(
                                                    value,
                                                    meta,
                                                    row,
                                                    dimensions,
                                                    pivotReference,
                                                    dashboardFiltersThatApplyToChart,
                                                );
                                            }
                                        }}
                                    />
                                    <DrillDownMenuItem
                                        row={viewUnderlyingDataOptions?.row}
                                        metricQuery={savedQuery?.metricQuery}
                                        selectedItem={
                                            viewUnderlyingDataOptions?.meta
                                                ?.item
                                        }
                                        pivotReference={
                                            viewUnderlyingDataOptions?.pivotReference
                                        }
                                        dashboardFilters={
                                            dashboardFiltersThatApplyToChart
                                        }
                                    />
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
                        data={savedQueryWithDashboardFilters}
                        project={projectUuid}
                        onSeriesContextMenu={onSeriesContextMenu}
                    />
                </>
            ) : (
                <InvalidDashboardChartTile />
            )}
        </TileBase>
    );
};

export default DashboardChartTile;
