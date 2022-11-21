import { FieldId, fieldId, FilterableField } from '@lightdash/common';
import { FC } from 'react';
import { useAvailableDashboardFilterTargets } from '../../../hooks/dashboard/useDashboard';
import { useDashboardContext } from '../../../providers/DashboardProvider';
import ActiveFilter from './ActiveFilter';

const ActiveFilters: FC = () => {
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
        <>
            {dashboardFilters.dimensions.map((item, index) => (
                <ActiveFilter
                    key={item.id}
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
                    fieldId={item.target.fieldId}
                    field={fieldMap[item.target.fieldId]}
                    filterRule={item}
                    onRemove={() => removeDimensionDashboardFilter(index, true)}
                    onUpdate={(value) =>
                        updateDimensionDashboardFilter(value, index, true)
                    }
                />
            ))}
        </>
    );
};

export default ActiveFilters;
