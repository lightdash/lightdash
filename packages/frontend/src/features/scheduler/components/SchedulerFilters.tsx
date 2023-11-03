import {
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
import { FC, useMemo } from 'react';
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

type SchedulerFilterItemProps = {
    filter: DashboardFilterRule;
};

const FilterItem: FC<SchedulerFilterItemProps> = ({ filter }) => {
    const { fieldsMap } = useFiltersContext();
    const field = fieldsMap[filter.target.fieldId];

    const filterType = useMemo(() => {
        return field ? getFilterTypeFromItem(field) : FilterType.STRING;
    }, [field]);

    const filterOperatorOptions = useMemo(() => {
        return getFilterOperatorOptions(filterType);
    }, [filterType]);

    return (
        <Stack key={filter.id} spacing="xs">
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
                    value={filter.operator}
                    data={filterOperatorOptions}
                    onChange={(value) => {
                        console.info(value);
                    }}
                />

                <FilterInputComponent
                    filterType={filterType}
                    field={field}
                    rule={filter}
                    onChange={(value) => {
                        console.info(value);
                    }}
                />
            </Flex>
        </Stack>
    );
};

type SchedulerFiltersProps = {
    dashboard?: Dashboard;
};

const SchedulerFilters: FC<SchedulerFiltersProps> = ({ dashboard }) => {
    const { data: project, isLoading } = useProject(dashboard?.projectUuid);
    const { isLoadingDashboardFilters, allFilters, fieldsWithSuggestions } =
        useDashboardContext();

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
                        <FilterItem key={filter.id} filter={filter} />
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
