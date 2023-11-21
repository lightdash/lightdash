import { Group, Skeleton } from '@mantine/core';
import { FC } from 'react';
import { useDashboardContext } from '../../../providers/DashboardProvider';
import Filter from '../Filter';

interface ActiveFiltersProps {
    isEditMode: boolean;
}

const ActiveFilters: FC<ActiveFiltersProps> = ({ isEditMode }) => {
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
            {dashboardFilters.dimensions
                .filter((item) => !!fieldsWithSuggestions[item.target.fieldId])
                .map((item, index) => (
                    <Filter
                        key={item.id}
                        isEditMode={isEditMode}
                        field={fieldsWithSuggestions[item.target.fieldId]}
                        filterRule={item}
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
                ))}

            {dashboardTemporaryFilters.dimensions
                .filter((item) => !!fieldsWithSuggestions[item.target.fieldId])
                .map((item, index) => (
                    <Filter
                        key={item.id}
                        isTemporary
                        isEditMode={isEditMode}
                        field={fieldsWithSuggestions[item.target.fieldId]}
                        filterRule={item}
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
                ))}
        </>
    );
};

export default ActiveFilters;
