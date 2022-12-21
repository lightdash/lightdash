import { FieldId, fieldId, FilterableField } from '@lightdash/common';
import { FC } from 'react';
import { useAvailableDashboardFilterTargets } from '../../../hooks/dashboard/useDashboard';
import { useDashboardContext } from '../../../providers/DashboardProvider';
import { ActiveDashboardFiltersWrapper } from '../DashboardFilter.styles';
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
        dashboardTiles,
    } = useDashboardContext();
    const { isLoading, data: filterableFields } =
        useAvailableDashboardFilterTargets(dashboardTiles);

    if (isLoading || !filterableFields) return null;

    const fieldMap = filterableFields.reduce<Record<FieldId, FilterableField>>(
        (acc, field) => ({ ...acc, [fieldId(field)]: field }),
        {},
    );

    return (
        <ActiveDashboardFiltersWrapper>
            {dashboardFilters.dimensions.map((item, index) => (
                <ActiveFilter
                    key={item.id}
                    isEditMode={isEditMode}
                    fieldId={item.target.fieldId}
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
            {dashboardTemporaryFilters.dimensions.map((item, index) => (
                <ActiveFilter
                    key={item.id}
                    isEditMode={isEditMode}
                    fieldId={item.target.fieldId}
                    field={fieldMap[item.target.fieldId]}
                    filterRule={item}
                    onRemove={() => removeDimensionDashboardFilter(index, true)}
                    onUpdate={(value) =>
                        updateDimensionDashboardFilter(value, index, true)
                    }
                />
            ))}
        </ActiveDashboardFiltersWrapper>
    );
};

export default ActiveFilters;
