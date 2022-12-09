import { MenuItem2 } from '@blueprintjs/popover2';
import {
    ChartType,
    CreateSavedChartVersion,
    DashboardFilters,
    Explore,
    FieldId,
    FilterGroupItem,
    FilterOperator,
    FilterRule,
    Filters,
    getItemId,
    MetricQuery,
    PivotReference,
    ResultRow,
} from '@lightdash/common';
import { FC } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { getExplorerUrlFromCreateSavedChartVersion } from '../../hooks/useExplorerRoute';

type CombineFiltersArgs = {
    metricQuery: MetricQuery;
    row: ResultRow;
    pivotReference?: PivotReference;
    dashboardFilters?: DashboardFilters;
    extraFilters?: Filters;
};
const combineFilters = ({
    metricQuery,
    row,
    pivotReference,
    dashboardFilters,
    extraFilters,
}: CombineFiltersArgs): Filters => {
    const combinedDimensionFilters: Array<FilterGroupItem> = [];

    if (metricQuery.filters.dimensions) {
        combinedDimensionFilters.push(metricQuery.filters.dimensions);
    }
    if (dashboardFilters) {
        combinedDimensionFilters.push(...dashboardFilters.dimensions);
    }
    if (pivotReference?.pivotValues) {
        const pivotFilter: FilterRule[] = pivotReference.pivotValues.map(
            (pivot) => ({
                id: uuidv4(),
                target: {
                    fieldId: pivot.field,
                },
                operator: FilterOperator.EQUALS,
                values: [pivot.value],
            }),
        );
        combinedDimensionFilters.push(...pivotFilter);
    }
    if (extraFilters?.dimensions) {
        combinedDimensionFilters.push(extraFilters.dimensions);
    }

    const dimensionFilters: FilterRule[] = metricQuery.dimensions.reduce<
        FilterRule[]
    >((acc, dimension) => {
        const rowValue = row[dimension];
        if (!rowValue) {
            return acc;
        }
        const dimensionFilter: FilterRule = {
            id: uuidv4(),
            target: {
                fieldId: dimension,
            },
            operator:
                rowValue.value.raw === null
                    ? FilterOperator.NULL
                    : FilterOperator.EQUALS,
            values:
                rowValue.value.raw === null ? undefined : [rowValue.value.raw],
        };
        return [...acc, dimensionFilter];
    }, []);
    combinedDimensionFilters.push(...dimensionFilters);

    return {
        dimensions: {
            id: uuidv4(),
            and: combinedDimensionFilters,
        },
    };
};

type DrillDownExploreUrlArgs = {
    projectUuid: string;
    tableName: string;
    metricQuery: MetricQuery;
    row: ResultRow;
    drillByDimension: FieldId;
    dashboardFilters?: DashboardFilters;
    extraFilters?: Filters;
    pivotReference?: PivotReference;
};

export const drillDownExploreUrl = ({
    projectUuid,
    tableName,
    metricQuery,
    row,
    drillByDimension,
    dashboardFilters,
    extraFilters,
    pivotReference,
}: DrillDownExploreUrlArgs) => {
    const createSavedChartVersion: CreateSavedChartVersion = {
        tableName,
        metricQuery: {
            ...metricQuery,
            dimensions: [drillByDimension, ...metricQuery.dimensions],
            filters: combineFilters({
                metricQuery,
                row,
                dashboardFilters,
                extraFilters,
                pivotReference,
            }),
            limit: 500,
        },
        pivotConfig: undefined,
        tableConfig: {
            columnOrder: [],
        },
        chartConfig: {
            type: ChartType.CARTESIAN,
            config: { layout: {}, eChartsConfig: {} },
        },
    };
    const { pathname, search } = getExplorerUrlFromCreateSavedChartVersion(
        projectUuid,
        createSavedChartVersion,
    );
    return `${pathname}?${search}`;
};

export const DrillDownMenuItem: FC<{
    projectUuid: string;
    explore: Explore;
    metricQuery: MetricQuery;
    row: ResultRow;
    dashboardFilters?: DashboardFilters;
    pivotReference?: PivotReference;
}> = ({
    projectUuid,
    explore,
    metricQuery,
    row,
    dashboardFilters,
    pivotReference,
}) => {
    return (
        <MenuItem2 text="Drill by" icon="path">
            {Object.values(explore.tables).map((table) => (
                <MenuItem2 key={table.name} text={table.label}>
                    {Object.values(table.dimensions)
                        .filter((dimension) => !dimension.hidden)
                        .sort((a, b) => a.label.localeCompare(b.label))
                        .map((dimension) => (
                            <MenuItem2
                                key={getItemId(dimension)}
                                text={dimension.label}
                                href={drillDownExploreUrl({
                                    projectUuid,
                                    tableName: explore.name,
                                    metricQuery,
                                    row,
                                    drillByDimension: getItemId(dimension),
                                    dashboardFilters,
                                    pivotReference,
                                })}
                                target="_blank"
                            />
                        ))}
                </MenuItem2>
            ))}
        </MenuItem2>
    );
};

export default DrillDownMenuItem;
