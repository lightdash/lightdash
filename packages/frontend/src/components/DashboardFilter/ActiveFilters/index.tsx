import { FieldId, fieldId, FilterableField } from '@lightdash/common';
import { Flex } from '@mantine/core';
import { FC } from 'react';
import { useDashboardContext } from '../../../providers/DashboardProvider';
import ActiveFilter from './ActiveFilter';

interface ActiveFiltersProps {
    isEditMode: boolean;
}

const ActiveFilters: FC<ActiveFiltersProps> = ({ isEditMode }) => {
    const {
        dashboardFilters,
        dashboardTemporaryFilters,
        updateDimensionDashboardFilter,
        removeDimensionDashboardFilter,
        allFilterableFields,
    } = useDashboardContext();

    if (!allFilterableFields) return null;

    const fieldMap = allFilterableFields.reduce<
        Record<FieldId, FilterableField>
    >((acc, field) => ({ ...acc, [fieldId(field)]: field }), {});

    return (
        <Flex gap={4} wrap="wrap" mb={8}>
            {dashboardFilters.dimensions
                .filter((item) => !!fieldMap[item.target.fieldId])
                .map((item, index) => (
                    <ActiveFilter
                        key={item.id}
                        isEditMode={isEditMode}
                        field={fieldMap[item.target.fieldId]}
                        filterRule={item}
                        onRemove={() =>
                            removeDimensionDashboardFilter(index, false)
                        }
                        onUpdate={(value) =>
                            updateDimensionDashboardFilter(value, index, false)
                        }
                    />
                ))}

            {dashboardTemporaryFilters.dimensions
                .filter((item) => !!fieldMap[item.target.fieldId])
                .map((item, index) => (
                    <ActiveFilter
                        key={item.id}
                        isTemporary
                        isEditMode={isEditMode}
                        field={fieldMap[item.target.fieldId]}
                        filterRule={item}
                        onRemove={() =>
                            removeDimensionDashboardFilter(index, true)
                        }
                        onUpdate={(value) =>
                            updateDimensionDashboardFilter(value, index, true)
                        }
                        isTemporary
                    />
                ))}
        </Flex>
    );
};

export default ActiveFilters;
