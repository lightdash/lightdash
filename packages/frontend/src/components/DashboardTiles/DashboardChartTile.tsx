import { Menu, MenuItem, NonIdealState, Portal } from '@blueprintjs/core';
import { Popover2, Popover2TargetProps, Tooltip2 } from '@blueprintjs/popover2';
import {
    DashboardChartTile as IDashboardChartTile,
    DashboardFilterRule,
    DashboardFilters,
    Field,
    fieldId,
    FilterGroup,
    FilterOperator,
    friendlyName,
    getDimensions,
    getVisibleFields,
    isFilterableField,
    SavedChart,
} from 'common';
import React, { FC, useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { useExplore } from '../../hooks/useExplore';
import { convertExplorerStateToExploreUrl } from '../../hooks/useExplorerRoute';
import { useSavedChartResults } from '../../hooks/useQueryResults';
import { useSavedQuery } from '../../hooks/useSavedQuery';
import { useDashboardContext } from '../../providers/DashboardProvider';
import { ExplorerReduceState } from '../../providers/ExplorerProvider';
import { useTracking } from '../../providers/TrackingProvider';
import { EventName } from '../../types/Events';
import { getFilterRuleLabel } from '../common/Filters/configs';
import { FilterValues } from '../DashboardFilter/ActiveFilters/ActiveFilters.styles';
import { Tooltip } from '../DashboardFilter/DashboardFilter.styles';
import LightdashVisualization from '../LightdashVisualization';
import VisualizationProvider from '../LightdashVisualization/VisualizationProvider';
import { EchartSeriesClickEvent } from '../SimpleChart';
import TileBase from './TileBase/index';
import { FilterLabel } from './TileBase/TileBase.styles';

const ValidDashboardChartTile: FC<{
    data: SavedChart;
    project: string;
    onSeriesContextMenu?: (e: EchartSeriesClickEvent) => void;
}> = ({ data, project, onSeriesContextMenu }) => {
    const { data: resultData, isLoading } = useSavedChartResults(project, data);
    const { addSuggestions } = useDashboardContext();

    useEffect(() => {
        if (resultData) {
            addSuggestions(
                resultData.metricQuery.dimensions.reduce((sum, dimensionId) => {
                    const newSuggestions: string[] =
                        resultData.rows.reduce<string[]>((acc, row) => {
                            const value = row[dimensionId];
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
            chartConfigs={data?.chartConfig}
            pivotDimensions={data.pivotConfig?.columns}
            resultsData={resultData}
            tableName={data.tableName}
            isLoading={isLoading}
            onSeriesContextMenu={onSeriesContextMenu}
        >
            <LightdashVisualization />
        </VisualizationProvider>
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
    const { dashboardFilters, addDimensionDashboardFilter } =
        useDashboardContext();
    const [contextMenuIsOpen, setContextMenuIsOpen] = useState(false);
    const [contextMenuTargetOffset, setContextMenuTargetOffset] =
        useState<{ left: number; top: number }>();
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

    const onSeriesContextMenu = useCallback(
        (e: EchartSeriesClickEvent) => {
            if (explore === undefined) {
                return;
            }
            const dimensions = getDimensions(explore).filter((dimension) =>
                e.dimensionNames.includes(fieldId(dimension)),
            );
            setDashboardFilterOptions(
                dimensions.map((dimension) => ({
                    id: uuidv4(),
                    target: {
                        fieldId: fieldId(dimension),
                        tableName: dimension.table,
                    },
                    operator: FilterOperator.EQUALS,
                    values: [e.data[fieldId(dimension)]],
                })),
            );
            setContextMenuIsOpen(true);
            setContextMenuTargetOffset({
                left: e.event.event.pageX,
                top: e.event.event.pageY,
            });
        },
        [explore],
    );

    // START DASHBOARD FILTER LOGIC
    // TODO: move this logic out of component
    let savedQueryWithDashboardFilters: SavedChart | undefined;

    const dashboardFiltersThatApplyToChart: DashboardFilters = useMemo(() => {
        const tables = explore ? Object.keys(explore.tables) : [];
        return {
            dimensions: dashboardFilters.dimensions.filter((filter) =>
                tables.includes(filter.target.tableName),
            ),
            metrics: dashboardFilters.metrics.filter((filter) =>
                tables.includes(filter.target.tableName),
            ),
        };
    }, [explore, dashboardFilters]);

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

    /*
    // http://localhost:3000/projects/3675b69e-8324-4110-bdca-059031aa8da3/tables/customers?
    dimensions=customers_customer_id%2Ccustomers_days_between_created_and_first_order
    &metrics=customers_unique_customer_count%2Ccustomers_date_of_first_created_customer
    &sort=%5B%7B"fieldId"%3A"customers_unique_customer_count"%2C"descending"%3Atrue%7D%2C%7B"fieldId"%3A"customers_customer_id"%2C"descending"%3Afalse%7D%5D
    &filters=%7B"dimensions"%3A%7B"id"%3A"1abdd3f7-9680-41a6-af46-6bd544f74175"%2C"and"%3A%5B%7B"id"%3A"2342d7c8-4604-46e1-93a2-2b965c183a76"%2C"target"%3A%7B"fieldId"%3A"customers_customer_id"%7D%2C"operator"%3A"equals"%2C"values"%3A%5B"4"%5D%7D%5D%7D%7D
    &limit=500
    &column_order=customers_unique_customer_count%2Ccustomers_customer_id%2Ccustomers_days_between_created_and_first_order%2Ccustomers_date_of_first_created_customer
    */
    let exploreUrl = '';

    if (savedQuery) {
        // Reversing method in useExplorerRoute to convert savedChart into explore URL
        /*const metric = savedQuery.metricQuery
        const queryDimensions = encodeURIComponent(metric.dimensions.join(','))
        const queryMetrics = encodeURIComponent(metric.metrics.join(',')) 
        const querySort= JSON.stringify(metric.sorts)
        const queryFilters= JSON.stringify(metric.filters)
*/
        const explorerState: ExplorerReduceState = {
            ...savedQuery.metricQuery,
            chartName: savedQuery.name,
            tableName: savedQuery.tableName,
            sorting: true,
            selectedTableCalculations: [],
            columnOrder: [],
            limit: savedQuery.metricQuery.limit,
            tableCalculations: savedQuery.metricQuery.tableCalculations,
        };
        const exploreParams = convertExplorerStateToExploreUrl(explorerState);

        exploreUrl = `/projects/${projectUuid}/tables/${
            savedQuery.tableName
        }?${exploreParams.toString()}`;
    }
    return (
        <TileBase
            isChart
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
            isLoading={isLoading}
            extraMenuItems={
                savedChartUuid !== null && (
                    <>
                        <MenuItem
                            icon="document-open"
                            text="Edit chart"
                            href={`/projects/${projectUuid}/saved/${savedChartUuid}`}
                        />
                        <MenuItem
                            icon="series-search"
                            text="Explore from here"
                            href={exploreUrl}
                        />
                    </>
                )
            }
            {...props}
        >
            <div style={{ flex: 1 }}>
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
            </div>
        </TileBase>
    );
};

export default DashboardChartTile;
