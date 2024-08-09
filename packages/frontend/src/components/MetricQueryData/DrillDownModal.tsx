import {
    ChartType,
    FilterOperator,
    getDimensions,
    getItemId,
    hashFieldReference,
    isField,
    type CompiledDimension,
    type CreateSavedChartVersion,
    type DashboardFilters,
    type FieldId,
    type FilterGroupItem,
    type FilterRule,
    type Filters,
    type MetricQuery,
    type PivotReference,
    type ResultValue,
} from '@lightdash/common';
import { Button, Group, Modal, Stack, Title } from '@mantine/core';
import { IconExternalLink } from '@tabler/icons-react';
import { useCallback, useMemo, useState, type FC } from 'react';
import { useParams } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { getExplorerUrlFromCreateSavedChartVersion } from '../../hooks/useExplorerRoute';
import FieldSelect from '../common/FieldSelect';
import MantineIcon from '../common/MantineIcon';
import { useMetricQueryDataContext } from './MetricQueryDataProvider';

type CombineFiltersArgs = {
    fieldValues: Record<string, ResultValue>;
    metricQuery: MetricQuery;
    pivotReference?: PivotReference;
    dashboardFilters?: DashboardFilters;
    extraFilters?: Filters;
};

const combineFilters = ({
    fieldValues,
    metricQuery,
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
            values: rowValue.raw === null ? undefined : [rowValue.raw],
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
    fieldValues: Record<string, ResultValue>;
    projectUuid: string;
    tableName: string;
    metricQuery: MetricQuery;
    drillByMetric: FieldId;
    drillByDimension: FieldId;
    extraFilters?: Filters;
    pivotReference?: PivotReference;
};

const drillDownExploreUrl = ({
    fieldValues,
    projectUuid,
    tableName,
    metricQuery,
    drillByMetric,
    drillByDimension,
    extraFilters,
    pivotReference,
}: DrillDownExploreUrlArgs) => {
    let metricQueryWithoutCustomDimensions = metricQuery;
    const customDimensions = metricQuery.customDimensions;
    if (customDimensions) {
        const noncustomDimensions = metricQuery.dimensions
            .filter(dim_id => !customDimensions.find(cd => cd.id === dim_id));
        metricQueryWithoutCustomDimensions = {
            ...metricQuery,
            dimensions: noncustomDimensions,
            customDimensions: [],
        };
    }

    const createSavedChartVersion: CreateSavedChartVersion = {
        tableName,
        metricQuery: {
            exploreName: tableName,
            tableCalculations: [],
            dimensions: [drillByDimension],
            metrics: [drillByMetric],
            filters: combineFilters({
                metricQuery: metricQueryWithoutCustomDimensions,
                fieldValues,
                extraFilters,
                pivotReference,
            }),
            limit: 500,
            additionalMetrics: metricQuery.additionalMetrics,
            sorts: [{ fieldId: drillByDimension, descending: false }],
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

export const DrillDownModal: FC = () => {
    const { projectUuid } = useParams<{ projectUuid: string }>();

    const [selectedDimension, setSelectedDimension] =
        useState<CompiledDimension>();

    const {
        isDrillDownModalOpen,
        closeDrillDownModal,
        explore,
        metricQuery,
        drillDownConfig,
    } = useMetricQueryDataContext();

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

    const url = useMemo(() => {
        if (selectedDimension && metricQuery && explore && drillDownConfig) {
            return drillDownExploreUrl({
                projectUuid,
                tableName: explore.name,
                metricQuery,
                fieldValues: drillDownConfig.fieldValues,
                drillByMetric: getItemId(drillDownConfig.item),
                drillByDimension: getItemId(selectedDimension),
                pivotReference: drillDownConfig.pivotReference,
            });
        }
    }, [selectedDimension, metricQuery, explore, drillDownConfig, projectUuid]);

    const onClose = useCallback(() => {
        setSelectedDimension(undefined);
        closeDrillDownModal();
    }, [closeDrillDownModal]);

    return (
        <Modal
            opened={isDrillDownModalOpen}
            onClose={onClose}
            title={<Title order={4}>Drill into "{value}"</Title>}
        >
            <Stack>
                <FieldSelect
                    withinPortal
                    disabled={dimensionsAvailable.length === 0}
                    item={selectedDimension}
                    items={dimensionsAvailable}
                    onChange={setSelectedDimension}
                    hasGrouping
                />
                <Group position="right">
                    <Button variant="outline" onClick={onClose}>
                        Cancel
                    </Button>

                    <Button
                        component="a"
                        target="_blank"
                        href={url}
                        leftIcon={<MantineIcon icon={IconExternalLink} />}
                        disabled={!selectedDimension}
                        onClick={() => setTimeout(onClose, 500)}
                    >
                        Open in new tab
                    </Button>
                </Group>
            </Stack>
        </Modal>
    );
};
