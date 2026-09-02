import {
    ChartType,
    FilterOperator,
    getDimensions,
    getFieldsFromMetricQuery,
    getItemId,
    hashFieldReference,
    isField,
    normalizeCellRawForFilter,
    type CompiledDimension,
    type CreateSavedChartVersion,
    type DashboardFilters,
    type Explore,
    type FieldId,
    type FilterGroupItem,
    type FilterRule,
    type Filters,
    type MetricQuery,
    type PivotReference,
    type ResultValue,
} from '@lightdash/common';
import { Button } from '@mantine/core';
import { IconArrowBarToDown, IconExternalLink } from '@tabler/icons-react';
import { useCallback, useMemo, useState, type FC } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useExplore } from '../../hooks/useExplore';
import { getExplorerUrlFromCreateSavedChartVersion } from '../../hooks/useExplorerRoute';
import { useProjectUuid } from '../../hooks/useProjectUuid';
import FieldSelect from '../common/FieldSelect';
import MantineIcon from '../common/MantineIcon';
import MantineModal from '../common/MantineModal';
import { useMetricQueryDataContext } from './useMetricQueryDataContext';

type CombineFiltersArgs = {
    fieldValues: Record<string, ResultValue>;
    metricQuery: MetricQuery;
    pivotReference?: PivotReference;
    dashboardFilters?: DashboardFilters;
    extraFilters?: Filters;
    explore?: Explore;
    timezone?: string;
};

// eslint-disable-next-line react-refresh/only-export-components
export const combineFilters = ({
    fieldValues,
    metricQuery,
    pivotReference,
    dashboardFilters,
    extraFilters,
    explore,
    timezone,
}: CombineFiltersArgs): Filters => {
    const combinedDimensionFilters: Array<FilterGroupItem> = [];
    const combinedMetricFilters: Array<FilterGroupItem> = [];

    if (metricQuery.filters.dimensions) {
        combinedDimensionFilters.push(metricQuery.filters.dimensions);
    }
    if (metricQuery.filters.metrics) {
        combinedMetricFilters.push(metricQuery.filters.metrics);
    }
    if (dashboardFilters) {
        combinedDimensionFilters.push(...dashboardFilters.dimensions);
        if (dashboardFilters.metrics?.length) {
            combinedMetricFilters.push(...dashboardFilters.metrics);
        }
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
    if (extraFilters?.metrics) {
        combinedMetricFilters.push(extraFilters.metrics);
    }

    const itemsMap = explore
        ? getFieldsFromMetricQuery(metricQuery, explore)
        : undefined;

    const dimensionFilters: FilterRule[] = metricQuery.dimensions.reduce<
        FilterRule[]
    >((acc, dimension) => {
        const rowValue = fieldValues[dimension];
        if (!rowValue) {
            return acc;
        }
        const dimensionFilter: FilterRule = {
            id: uuidv4(),
            target: {
                fieldId: dimension,
            },
            operator:
                rowValue.raw === null
                    ? FilterOperator.NULL
                    : FilterOperator.EQUALS,
            values:
                rowValue.raw === null
                    ? undefined
                    : [
                          normalizeCellRawForFilter(
                              rowValue.raw,
                              itemsMap?.[dimension],
                              timezone,
                          ),
                      ],
        };
        return [...acc, dimensionFilter];
    }, []);
    combinedDimensionFilters.push(...dimensionFilters);

    return {
        dimensions: {
            id: uuidv4(),
            and: combinedDimensionFilters,
        },
        ...(combinedMetricFilters.length > 0 && {
            metrics: {
                id: uuidv4(),
                and: combinedMetricFilters,
            },
        }),
    };
};

type DrillDownExploreArgs = {
    fieldValues: Record<string, ResultValue>;
    projectUuid: string;
    tableName: string;
    metricQuery: MetricQuery;
    drillByMetric: FieldId;
    drillByDimension: FieldId;
    extraFilters?: Filters;
    pivotReference?: PivotReference;
    explore?: Explore;
    timezone?: string;
};

const getDrillDownExplore = ({
    fieldValues,
    projectUuid,
    tableName,
    metricQuery,
    drillByMetric,
    drillByDimension,
    extraFilters,
    pivotReference,
    explore,
    timezone,
}: DrillDownExploreArgs) => {
    const createSavedChartVersion: CreateSavedChartVersion = {
        tableName,
        metricQuery: {
            exploreName: tableName,
            tableCalculations: [],
            dimensions: [drillByDimension],
            metrics: [drillByMetric],
            filters: combineFilters({
                metricQuery,
                fieldValues,
                extraFilters,
                pivotReference,
                explore,
                timezone,
            }),
            limit: 500,
            additionalMetrics: metricQuery.additionalMetrics,
            customDimensions: metricQuery.customDimensions,
            sorts: [
                {
                    fieldId: drillByDimension,
                    descending: false,
                },
            ],
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
    return {
        chart: createSavedChartVersion,
        url: `${pathname}?${search}`,
    };
};

type DrillDownModalProps = {
    onExplore?: (options: { chart: CreateSavedChartVersion }) => void;
};

export const DrillDownModal: FC<DrillDownModalProps> = ({ onExplore }) => {
    const projectUuid = useProjectUuid();

    const [selectedDimension, setSelectedDimension] =
        useState<CompiledDimension>();

    const {
        isDrillDownModalOpen,
        closeDrillDownModal,
        explore: contextExplore,
        metricQuery: contextMetricQuery,
        tableName,
        drillDownConfig,
        resolvedTimezone,
    } = useMetricQueryDataContext();
    const source = drillDownConfig?.source;
    const metricQuery = source?.metricQuery ?? contextMetricQuery;
    const { data: sourceExplore } = useExplore(source?.tableName ?? tableName, {
        refetchOnMount: false,
    });
    const explore = source ? sourceExplore : contextExplore;

    const dimensionsAvailable = useMemo(() => {
        if (!explore) return [];

        return getDimensions(explore).filter((dimension) => !dimension.hidden);
    }, [explore]);

    const value = useMemo(() => {
        if (drillDownConfig && isField(drillDownConfig.item)) {
            const fieldId =
                drillDownConfig.pivotReference !== undefined
                    ? hashFieldReference(drillDownConfig.pivotReference)
                    : getItemId(drillDownConfig.item);
            return drillDownConfig.fieldValues[fieldId]?.formatted;
        }
    }, [drillDownConfig]);

    const drillDownExplore = useMemo(() => {
        if (
            selectedDimension &&
            metricQuery &&
            explore &&
            drillDownConfig &&
            projectUuid
        ) {
            return getDrillDownExplore({
                projectUuid,
                tableName: explore.name,
                metricQuery,
                fieldValues: drillDownConfig.fieldValues,
                drillByMetric: getItemId(drillDownConfig.item),
                drillByDimension: getItemId(selectedDimension),
                pivotReference: drillDownConfig.pivotReference,
                explore,
                timezone: resolvedTimezone,
            });
        }
    }, [
        selectedDimension,
        metricQuery,
        explore,
        drillDownConfig,
        projectUuid,
        resolvedTimezone,
    ]);

    const onClose = useCallback(() => {
        setSelectedDimension(undefined);
        closeDrillDownModal();
    }, [closeDrillDownModal]);

    return (
        <MantineModal
            opened={isDrillDownModalOpen}
            onClose={onClose}
            title={`Drill into "${value}"`}
            size="md"
            icon={IconArrowBarToDown}
            actions={
                onExplore ? (
                    <Button
                        leftSection={<MantineIcon icon={IconArrowBarToDown} />}
                        disabled={!drillDownExplore}
                        onClick={() => {
                            if (drillDownExplore) {
                                onExplore({ chart: drillDownExplore.chart });
                                onClose();
                            }
                        }}
                    >
                        Drill down
                    </Button>
                ) : (
                    <Button
                        component="a"
                        target="_blank"
                        href={drillDownExplore?.url}
                        leftSection={<MantineIcon icon={IconExternalLink} />}
                        disabled={!drillDownExplore}
                        onClick={() => setTimeout(onClose, 500)}
                    >
                        Open in new tab
                    </Button>
                )
            }
        >
            <FieldSelect
                comboboxProps={{ withinPortal: true }}
                disabled={dimensionsAvailable.length === 0}
                item={selectedDimension}
                items={dimensionsAvailable}
                onChange={setSelectedDimension}
                hasGrouping
            />
        </MantineModal>
    );
};
