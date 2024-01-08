import { Group, Skeleton } from '@mantine/core';
import { FC } from 'react';
import { useDashboardContext } from '../../../providers/DashboardProvider';
import { FieldWithSuggestions } from '../../common/Filters/FiltersProvider';
import Filter from '../Filter';
import InvalidFilter from '../InvalidFilter';

interface ActiveFiltersProps {
    isEditMode: boolean;
    openPopoverId: string | undefined;
    onPopoverOpen: (popoverId: string) => void;
    onPopoverClose: () => void;
}

const ActiveFilters: FC<ActiveFiltersProps> = ({
    isEditMode,
    openPopoverId,
    onPopoverOpen,
    onPopoverClose,
}) => {
    const dashboardFilters = useDashboardContext((c) => c.dashboardFilters);
    const dashboardTemporaryFilters = useDashboardContext(
        (c) => c.dashboardTemporaryFilters,
    );
    const fieldsWithSuggestions = useDashboardContext(
        (c) => c.fieldsWithSuggestions,
    );
    const isLoadingDashboardFilters = useDashboardContext(
        (c) => c.isLoadingDashboardFilters,
    );
    const isFetchingDashboardFilters = useDashboardContext(
        (c) => c.isFetchingDashboardFilters,
    );
    const removeDimensionDashboardFilter = useDashboardContext(
        (c) => c.removeDimensionDashboardFilter,
    );
    const updateDimensionDashboardFilter = useDashboardContext(
        (c) => c.updateDimensionDashboardFilter,
    );

    if (isLoadingDashboardFilters || isFetchingDashboardFilters) {
        return (
            <Group spacing="xs" ml="xs">
                <Skeleton h={30} w={100} radius={4} />
                <Skeleton h={30} w={100} radius={4} />
                <Skeleton h={30} w={100} radius={4} />
                <Skeleton h={30} w={100} radius={4} />
                <Skeleton h={30} w={100} radius={4} />
            </Group>
        );
    }

    if (!fieldsWithSuggestions) return null;

    return (
        <>
            {dashboardFilters.dimensions.map((item, index) => {
                const field = fieldsWithSuggestions[item.target.fieldId] as
                    | FieldWithSuggestions
                    | undefined;
                return field ? (
                    <Filter
                        key={item.id}
                        isEditMode={isEditMode}
                        field={field}
                        filterRule={item}
                        openPopoverId={openPopoverId}
                        onPopoverOpen={onPopoverOpen}
                        onPopoverClose={onPopoverClose}
                        onRemove={() =>
                            removeDimensionDashboardFilter(index, false)
                        }
                        onUpdate={(value) =>
                            updateDimensionDashboardFilter(
                                value,
                                index,
                                false,
                                isEditMode,
                            )
                        }
                    />
                ) : (
                    <InvalidFilter
                        key={item.id}
                        isEditMode={isEditMode}
                        filterRule={item}
                        onRemove={() =>
                            removeDimensionDashboardFilter(index, false)
                        }
                    />
                );
            })}

            {dashboardTemporaryFilters.dimensions.map((item, index) => {
                const field = fieldsWithSuggestions[item.target.fieldId] as
                    | FieldWithSuggestions
                    | undefined;
                return field ? (
                    <Filter
                        key={item.id}
                        isTemporary
                        isEditMode={isEditMode}
                        field={field}
                        filterRule={item}
                        openPopoverId={openPopoverId}
                        onPopoverOpen={onPopoverOpen}
                        onPopoverClose={onPopoverClose}
                        onRemove={() =>
                            removeDimensionDashboardFilter(index, true)
                        }
                        onUpdate={(value) =>
                            updateDimensionDashboardFilter(
                                value,
                                index,
                                true,
                                isEditMode,
                            )
                        }
                    />
                ) : (
                    <InvalidFilter
                        key={item.id}
                        isEditMode={isEditMode}
                        filterRule={item}
                        onRemove={() =>
                            removeDimensionDashboardFilter(index, false)
                        }
                    />
                );
            })}
        </>
    );
};

export default ActiveFilters;
