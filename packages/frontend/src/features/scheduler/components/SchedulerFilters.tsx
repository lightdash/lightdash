import {
    ConditionalOperator,
    Dashboard,
    DashboardFilterRule,
    FilterType,
    getFilterTypeFromItem,
} from '@lightdash/common';
import {
    Center,
    Flex,
    Group,
    Loader,
    Select,
    Stack,
    Text,
} from '@mantine/core';
import { FC, useCallback, useMemo, useState } from 'react';
import FieldIcon from '../../../components/common/Filters/FieldIcon';
import FieldLabel from '../../../components/common/Filters/FieldLabel';
import {
    FilterInputComponent,
    getFilterOperatorOptions,
} from '../../../components/common/Filters/FilterInputs';
import {
    FiltersProvider,
    useFiltersContext,
} from '../../../components/common/Filters/FiltersProvider';
import { isFilterConfigRevertButtonEnabled as hasSavedFilterValueChanged } from '../../../components/DashboardFilter/FilterConfiguration/utils';
import { useProject } from '../../../hooks/useProject';
import { useDashboardContext } from '../../../providers/DashboardProvider';

type SchedulerFilterRule = Omit<DashboardFilterRule, 'tileTargets'> & {
    tileTargets: undefined;
};

type SchedulerFilterItemProps = {
    dashboardFilter: DashboardFilterRule;
    schedulerFilter?: DashboardFilterRule;
    onChange: (schedulerFilter: SchedulerFilterRule) => void;
};

const FilterItem: FC<SchedulerFilterItemProps> = ({
    dashboardFilter,
    schedulerFilter,
    onChange,
}) => {
    const { fieldsMap } = useFiltersContext();
    const field = fieldsMap[dashboardFilter.target.fieldId];

    const filterType = useMemo(() => {
        return field ? getFilterTypeFromItem(field) : FilterType.STRING;
    }, [field]);

    const filterOperatorOptions = useMemo(() => {
        return getFilterOperatorOptions(filterType);
    }, [filterType]);

    return (
        <Stack key={dashboardFilter.id} spacing="xs">
            <Group spacing="xs">
                <FieldIcon item={field} />
                <FieldLabel item={field} hideTableName />
            </Group>

            <Flex gap="xs">
                <Select
                    style={{
                        flex: '0 0 180px',
                    }}
                    size="xs"
                    value={
                        schedulerFilter?.operator ?? dashboardFilter.operator
                    }
                    data={filterOperatorOptions}
                    onChange={(operator: ConditionalOperator) => {
                        onChange({
                            ...dashboardFilter,
                            operator,
                            tileTargets: undefined,
                        });
                    }}
                />

                <FilterInputComponent
                    filterType={filterType}
                    field={field}
                    rule={schedulerFilter ?? dashboardFilter}
                    onChange={(newFilter) => {
                        onChange({
                            ...newFilter,
                            tileTargets: undefined,
                        });
                    }}
                />
            </Flex>
        </Stack>
    );
};

type SchedulerFiltersProps = {
    dashboard?: Dashboard;
    onChange: (schedulerFilters: SchedulerFilterRule[]) => void;
    schedulerFilters: DashboardFilterRule[] | undefined;
};

const SchedulerFilters: FC<SchedulerFiltersProps> = ({
    dashboard,
    schedulerFilters,
    onChange,
}) => {
    const { data: project, isLoading } = useProject(dashboard?.projectUuid);
    const isLoadingDashboardFilters = useDashboardContext(
        (c) => c.isLoadingDashboardFilters,
    );
    const allFilters = useDashboardContext((c) => c.allFilters);
    const fieldsWithSuggestions = useDashboardContext(
        (c) => c.fieldsWithSuggestions,
    );
    const originalDashboardFilters = dashboard?.filters;

    const [schedulerFiltersData, setSchedulerFiltersData] = useState<
        DashboardFilterRule[] | undefined
    >(schedulerFilters);

    const handleUpdateSchedulerFilter = useCallback(
        (schedulerFilter: SchedulerFilterRule) => {
            if (!originalDashboardFilters) return;

            const originalFilter = originalDashboardFilters.dimensions.find(
                (d) => d.id === schedulerFilter.id,
            );

            if (!originalFilter) return;

            let updatedFilters = schedulerFiltersData
                ? [...schedulerFiltersData]
                : [];

            const filterIndex = updatedFilters.findIndex(
                (f) => f.id === schedulerFilter.id,
            );
            const isExistingFilter = filterIndex !== -1;

            const filterToCompareAgainst = isExistingFilter
                ? updatedFilters[filterIndex]
                : originalFilter;

            const { tileTargets, ...schedulerFilterWithoutTileTargets } =
                schedulerFilter;

            const hasChanged = hasSavedFilterValueChanged(
                filterToCompareAgainst,
                schedulerFilterWithoutTileTargets,
            );

            const isReverted = !hasSavedFilterValueChanged(
                originalFilter,
                schedulerFilterWithoutTileTargets,
            );

            if (hasChanged) {
                if (isExistingFilter) {
                    updatedFilters[filterIndex] = schedulerFilter;
                } else {
                    updatedFilters.push(schedulerFilter);
                }
            }
            if (isReverted) {
                updatedFilters.splice(filterIndex, 1);
            }

            if (hasChanged || isReverted) {
                setSchedulerFiltersData(updatedFilters);
                onChange(
                    updatedFilters.map((f) => ({
                        ...f,
                        tileTargets: undefined,
                    })),
                );
            }
        },
        [onChange, originalDashboardFilters, schedulerFiltersData],
    );

    if (isLoading || isLoadingDashboardFilters || !project) {
        return (
            <Center component={Stack} h={100}>
                <Loader color="gray" />
                <Text color="dimmed">Loading dashboard filters...</Text>
            </Center>
        );
    }

    return (
        <FiltersProvider
            popoverProps={{ withinPortal: true }}
            projectUuid={project.projectUuid}
            fieldsMap={fieldsWithSuggestions}
            startOfWeek={project.warehouseConnection?.startOfWeek ?? undefined}
            dashboardFilters={allFilters}
        >
            {dashboard && dashboard.filters.dimensions.length > 0 ? (
                <Stack>
                    {dashboard?.filters?.dimensions.map((filter) => {
                        const schedulerFilter =
                            schedulerFiltersData && schedulerFiltersData.length
                                ? schedulerFiltersData.find(
                                      (f) =>
                                          f.target.fieldId ===
                                              filter.target.fieldId &&
                                          f.target.tableName ===
                                              filter.target.tableName,
                                  )
                                : undefined;

                        return (
                            <FilterItem
                                key={filter.id}
                                dashboardFilter={filter}
                                schedulerFilter={schedulerFilter}
                                onChange={handleUpdateSchedulerFilter}
                            />
                        );
                    })}
                </Stack>
            ) : (
                <Center component={Stack} h={100}>
                    <Text color="dimmed">
                        No filters defined for this dashboard.
                    </Text>
                </Center>
            )}
        </FiltersProvider>
    );
};

export default SchedulerFilters;
