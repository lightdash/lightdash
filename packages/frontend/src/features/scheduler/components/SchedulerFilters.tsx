import {
    ConditionalOperator,
    Dashboard,
    DashboardFilterRule,
    FilterType,
    getFilterTypeFromItem,
    SchedulerFilterRule,
} from '@lightdash/common';
import {
    ActionIcon,
    Center,
    Flex,
    Group,
    Loader,
    Select,
    Stack,
    Text,
    Tooltip,
} from '@mantine/core';
import { IconRotate2 } from '@tabler/icons-react';
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
import MantineIcon from '../../../components/common/MantineIcon';
import { isFilterConfigRevertButtonEnabled as hasSavedFilterValueChanged } from '../../../components/DashboardFilter/FilterConfiguration/utils';
import { useProject } from '../../../hooks/useProject';
import { useDashboardContext } from '../../../providers/DashboardProvider';

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
                    withinPortal
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
                    popoverProps={{ withinPortal: true }}
                />
            </Flex>
        </Stack>
    );
};

const isFilterReverted = (
    originalFilter: DashboardFilterRule,
    schedulerFilter: SchedulerFilterRule,
) => !hasSavedFilterValueChanged(originalFilter, schedulerFilter);

const hasFilterChanged = (
    filterToCompareAgainst: DashboardFilterRule | SchedulerFilterRule,
    schedulerFilter: SchedulerFilterRule,
) => hasSavedFilterValueChanged(filterToCompareAgainst, schedulerFilter);

const updateFilters = (
    schedulerFilter: SchedulerFilterRule,
    originalFilter: DashboardFilterRule,
    schedulerFilters: SchedulerFilterRule[] | undefined,
): SchedulerFilterRule[] | undefined => {
    if (schedulerFilters && isFilterReverted(originalFilter, schedulerFilter)) {
        return schedulerFilters.filter((f) => f.id !== schedulerFilter.id);
    }

    const filterIndex =
        schedulerFilters?.findIndex((f) => f.id === schedulerFilter.id) ?? -1;
    const isExistingFilter = filterIndex !== -1;

    const filterToCompareAgainst =
        schedulerFilters && isExistingFilter
            ? schedulerFilters[filterIndex]
            : originalFilter;

    if (hasFilterChanged(filterToCompareAgainst, schedulerFilter)) {
        if (schedulerFilters && isExistingFilter) {
            return schedulerFilters.map((f) =>
                f.id === schedulerFilter.id ? schedulerFilter : f,
            );
        }

        return [...(schedulerFilters ?? []), schedulerFilter];
    }
};

type SchedulerFiltersProps = {
    dashboard?: Dashboard;
    onChange: (schedulerFilters: SchedulerFilterRule[]) => void;
    schedulerFilters: SchedulerFilterRule[] | undefined;
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
    const dashboardFilterIds = useMemo(
        () => new Set(dashboard?.filters.dimensions.map((f) => f.id)),
        [dashboard?.filters.dimensions],
    );

    const [schedulerFiltersData, setSchedulerFiltersData] = useState<
        SchedulerFilterRule[] | undefined
        // NOTE: Filter out any filters that are not in the dashboard anymore
    >(schedulerFilters?.filter((sf) => dashboardFilterIds.has(sf.id)));

    const handleUpdateSchedulerFilter = useCallback(
        (schedulerFilter: SchedulerFilterRule) => {
            if (!originalDashboardFilters) return;

            const originalFilter = originalDashboardFilters.dimensions.find(
                (d) => d.id === schedulerFilter.id,
            );

            if (!originalFilter) return;

            const updatedFilters = updateFilters(
                schedulerFilter,
                originalFilter,
                schedulerFiltersData,
            );

            setSchedulerFiltersData(updatedFilters);
            onChange(
                updatedFilters?.map((f) => ({
                    ...f,
                    tileTargets: undefined,
                })) ?? [],
            );
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

    const revertFilter = (originalFilterId: string) => {
        const updatedFilters = schedulerFiltersData?.filter(
            (f) => f.id !== originalFilterId,
        );
        setSchedulerFiltersData(updatedFilters);
        onChange(
            updatedFilters?.map((f) => ({
                ...f,
                tileTargets: undefined,
            })) ?? [],
        );
    };

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
                        const schedulerFilter = schedulerFiltersData?.find(
                            (sf) => sf.id === filter.id,
                        );

                        const hasChanged = schedulerFilter
                            ? hasSavedFilterValueChanged(
                                  filter,
                                  schedulerFilter,
                              )
                            : false;

                        return (
                            <Group
                                spacing="xs"
                                align="flex-start"
                                key={filter.id}
                                w="100%"
                            >
                                <Tooltip
                                    label="Reset filter back to original"
                                    fz="xs"
                                    disabled={!hasChanged}
                                >
                                    <ActionIcon
                                        size="xs"
                                        disabled={!hasChanged}
                                        onClick={() => revertFilter(filter.id)}
                                    >
                                        <MantineIcon icon={IconRotate2} />
                                    </ActionIcon>
                                </Tooltip>
                                <FilterItem
                                    dashboardFilter={filter}
                                    schedulerFilter={schedulerFilter}
                                    onChange={handleUpdateSchedulerFilter}
                                />
                            </Group>
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
