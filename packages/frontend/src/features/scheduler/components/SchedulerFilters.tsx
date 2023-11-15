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
import produce from 'immer';
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
    // TODO: should read initial state from the BE
    const [filters, setFilters] = useState<DashboardFilterRule[]>(
        schedulerFilters ?? [],
    );

    const handleUpdateSchedulerFilter = useCallback(
        (schedulerFilter: SchedulerFilterRule) => {
            // TODO: this should diff if the filter is actually
            // different from the dashboard filter

            const newState = produce(filters, (draft) => {
                const filterIndex = draft.findIndex(
                    (f) =>
                        f.target.fieldId === schedulerFilter.target.fieldId &&
                        f.target.tableName === schedulerFilter.target.tableName,
                );

                if (draft[filterIndex]) {
                    draft[filterIndex] = schedulerFilter;
                } else {
                    draft.push(schedulerFilter);
                }
            });

            setFilters(newState);

            console.log('newState', newState, schedulerFilter);

            // TODO: sync with upper component
            // call onChange - this can be debounced
            onChange(newState.map((f) => ({ ...f, tileTargets: undefined })));
        },
        [onChange, filters],
    );

    const isLoadingDashboardFilters = useDashboardContext(
        (c) => c.isLoadingDashboardFilters,
    );
    const allFilters = useDashboardContext((c) => c.allFilters);
    const fieldsWithSuggestions = useDashboardContext(
        (c) => c.fieldsWithSuggestions,
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
                    {dashboard?.filters?.dimensions.map((filter) => (
                        <FilterItem
                            key={filter.id}
                            dashboardFilter={filter}
                            schedulerFilter={filters.find(
                                (f) =>
                                    f.target.fieldId ===
                                        filter.target.fieldId &&
                                    f.target.tableName ===
                                        filter.target.tableName,
                            )}
                            onChange={handleUpdateSchedulerFilter}
                        />
                    ))}
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
