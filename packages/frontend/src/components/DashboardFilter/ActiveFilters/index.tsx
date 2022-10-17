import { FieldId, fieldId, FilterableField } from '@lightdash/common';
import React, { FC } from 'react';
import { useAvailableDashboardFilterTargets } from '../../../hooks/dashboard/useDashboard';
import { useDashboardContext } from '../../../providers/DashboardProvider';
import ActiveFilter from './ActiveFilter';
import { TagsWrapper } from './ActiveFilters.styles';

const ActiveFilters: FC = () => {
    const {
        dashboard,
        dashboardFilters,
        dashboardTemporaryFilters,
        updateDimensionDashboardFilter,
        removeDimensionDashboardFilter,
        dashboardTiles,
    } = useDashboardContext();
    const { data: filterableFields } =
        useAvailableDashboardFilterTargets(dashboardTiles);

    const fieldMap = filterableFields.reduce<Record<FieldId, FilterableField>>(
        (acc, field) => ({ ...acc, [fieldId(field)]: field }),
        {},
    );

    return (
        <TagsWrapper>
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
        </TagsWrapper>
    );
};

export default ActiveFilters;
