import { Icon, Menu, MenuItem, NonIdealState, Portal } from '@blueprintjs/core';
import { Popover2, Popover2TargetProps, Tooltip2 } from '@blueprintjs/popover2';
import {
    ChartType,
    DashboardChartTile as IDashboardChartTile,
    DashboardFilterRule,
    DashboardFilters,
    Field,
    fieldId,
    FilterGroup,
    FilterOperator,
    friendlyName,
    getDimensions,
    getResultValues,
    getVisibleFields,
    isFilterableField,
    SavedChart,
} from '@lightdash/common';
import React, { FC, useCallback, useEffect, useMemo, useState } from 'react';
import { CSVLink } from 'react-csv';
import { useParams } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { useExplore } from '../../hooks/useExplore';
import { getExplorerUrlFromCreateSavedChartVersion } from '../../hooks/useExplorerRoute';
import { useSavedChartResults } from '../../hooks/useQueryResults';
import { useSavedQuery } from '../../hooks/useSavedQuery';
import { useApp } from '../../providers/AppProvider';
import { useDashboardContext } from '../../providers/DashboardProvider';
import { useTracking } from '../../providers/TrackingProvider';
import { EventName } from '../../types/Events';
import { getFilterRuleLabel } from '../common/Filters/configs';
import { FilterValues } from '../DashboardFilter/ActiveFilters/ActiveFilters.styles';
import { Tooltip } from '../DashboardFilter/DashboardFilter.styles';
import LightdashVisualization from '../LightdashVisualization';
import VisualizationProvider from '../LightdashVisualization/VisualizationProvider';
import { EchartSeriesClickEvent } from '../SimpleChart';
import { VisualizationWrapper } from './DashboardChartTile.styles';
import TileBase from './TileBase/index';
import { FilterLabel } from './TileBase/TileBase.styles';

const ValidDashboardChartTile: FC<{
    data: SavedChart;
    project: string;
    onSeriesContextMenu?: (e: EchartSeriesClickEvent) => void;
}> = ({ data, project, onSeriesContextMenu }) => {
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
            <LightdashVisualization />
        </VisualizationProvider>
    );
};

const DownloadCSV: FC<{
    data: SavedChart;
    project: string;
}> = ({ data, project }) => {
    const { data: resultData } = useSavedChartResults(project, data);

    const rows = resultData?.rows;
    if (!rows || rows.length <= 0) {
        return <MenuItem icon="download" text=".csv" disabled />;
    }

    return (
        <CSVLink
            role="menuitem"
            tabIndex={0}
            className="bp4-menu-item"
            data={getResultValues(rows)}
            filename={`${data?.name}.csv`}
            target="_blank"
        >
            <Icon icon="download" />
            <span>Download CSV</span>
        </CSVLink>
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
            properties: { savedChartUuid },
        },
        isEditMode,
    } = props;
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { data: savedQuery, isLoading } = useSavedQuery({
        id: savedChartUuid || undefined,
    });
    const { data: explore } = useExplore(savedQuery?.tableName);
    const {
        dashboardFilters,
        dashboardTemporaryFilters,
        addDimensionDashboardFilter,
    } = useDashboardContext();
    const [contextMenuIsOpen, setContextMenuIsOpen] = useState(false);
    const [contextMenuTargetOffset, setContextMenuTargetOffset] = useState<{
        left: number;
        top: number;
    }>();
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
    const { user } = useApp();

    type FilterPivot = {
        field: string;
        table: string;
        value: string;
    };
    const getPivots = useCallback(
        (data) => {
            const keys = Object.keys(data);
            const pivotDimension = savedQuery?.pivotConfig?.columns?.[0];
            return keys.reduce((results: FilterPivot[], key) => {
                const pivotKey = key.split('.');

                if (
                    pivotDimension &&
                    pivotKey.includes(pivotDimension) &&
                    pivotKey.length === 3
                ) {
                    const pivot = pivotKey[1];
                    results.push({
                        table: pivot.split('_')[0],
                        field: pivotKey[1],
                        value: pivotKey[2],
                    });
                }
                return results;
            }, []);
        },
        [savedQuery],
    );

    const onSeriesContextMenu = useCallback(
        (e: EchartSeriesClickEvent) => {
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
            const pivotOptions = getPivots(e.data).map((pivot) => ({
                id: uuidv4(),
                target: {
                    fieldId: pivot.field,
                    tableName: pivot.table,
                },
                operator: FilterOperator.EQUALS,
                values: [pivot.value],
            }));

            setDashboardFilterOptions([...dimensionOptions, ...pivotOptions]);
            setContextMenuIsOpen(true);
            setContextMenuTargetOffset({
                left: e.event.event.pageX,
                top: e.event.event.pageY,
            });
        },
        [explore, getPivots],
    );
    // START DASHBOARD FILTER LOGIC
    // TODO: move this logic out of component
    let savedQueryWithDashboardFilters: SavedChart | undefined;

    const dashboardFiltersThatApplyToChart: DashboardFilters = useMemo(() => {
        const tables = explore ? Object.keys(explore.tables) : [];
        return {
            dimensions: [
                ...dashboardFilters.dimensions,
                ...dashboardTemporaryFilters.dimensions,
            ].filter((filter) => tables.includes(filter.target.tableName)),
            metrics: [
                ...dashboardFilters.metrics,
                ...dashboardTemporaryFilters.metrics,
            ].filter((filter) => tables.includes(filter.target.tableName)),
        };
    }, [explore, dashboardFilters, dashboardTemporaryFilters]);

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
                    <Tooltip key={field.name}>
                        {filterRuleLabels.field}: {filterRuleLabels.operator}{' '}
                        <FilterValues>{filterRuleLabels.value}</FilterValues>
                    </Tooltip>
                );
            }
            return `Tried to reference field with unknown id: ${filterRule.target.fieldId}`;
        },
        [explore],
    );

    const exploreFromHereUrl = useMemo(() => {
        if (savedQuery) {
            const { pathname, search } =
                getExplorerUrlFromCreateSavedChartVersion(
                    savedQuery.projectUuid,
                    savedQuery,
                );
            return `${pathname}?${search}`;
        }
    }, [savedQuery]);

    return (
        <TileBase
            extraHeaderElement={
                appliedFilterRules.length > 0 && (
                    <div>
                        <Tooltip2
                            content={
                                <>{appliedFilterRules.map(renderFilterRule)}</>
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
            description={savedQuery?.description}
            isLoading={isLoading}
            extraMenuItems={
                savedChartUuid !== null && (
                    <>
                        {user.data?.ability?.can('manage', 'SavedChart') && (
                            <MenuItem
                                icon="document-open"
                                text="Edit chart"
                                href={`/projects/${projectUuid}/saved/${savedChartUuid}/edit`}
                            />
                        )}
                        <MenuItem
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
            <VisualizationWrapper>
                {savedQueryWithDashboardFilters ? (
                    <>
                        <Popover2
                            content={
                                <div onContextMenu={cancelContextMenu}>
                                    <Menu>
                                        <MenuItem text="Filter dashboard to...">
                                            {dashboardTileFilterOptions.map(
                                                (filter) => (
                                                    <MenuItem
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
                                                            addDimensionDashboardFilter(
                                                                filter,
                                                                !isEditMode,
                                                            );
                                                        }}
                                                    />
                                                ),
                                            )}
                                        </MenuItem>
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
                            data={savedQueryWithDashboardFilters}
                            project={projectUuid}
                            onSeriesContextMenu={onSeriesContextMenu}
                        />
                    </>
                ) : (
                    <InvalidDashboardChartTile />
                )}
            </VisualizationWrapper>
        </TileBase>
    );
};

export default DashboardChartTile;
