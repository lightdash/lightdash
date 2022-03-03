import { Colors } from '@blueprintjs/core';
import { Classes, Popover2 } from '@blueprintjs/popover2';
import { fieldId } from 'common';
import React, { FC } from 'react';
import { useAvailableDashboardFilterTargets } from '../../../hooks/dashboard/useDashboard';
import { useDashboardContext } from '../../../providers/DashboardProvider';
import FilterConfiguration from '../FilterConfiguration';
import ActiveFilter from './ActiveFilter';
import { TagsWrapper } from './ActiveFilters.styles';

interface Props {
    isEditMode: boolean;
}

const ActiveFilters: FC<Props> = ({ isEditMode }) => {
    const {
        dashboard,
        dashboardFilters,
        updateDimensionDashboardFilter,
        removeDimensionDashboardFilter,
    } = useDashboardContext();
    const { isLoading, data: filterableFields } =
        useAvailableDashboardFilterTargets(dashboard);

    return (
        <TagsWrapper>
            {dashboardFilters.dimensions.map((item, index) => {
                const activeField = filterableFields.find(
                    (field) => fieldId(field) === item.target.fieldId,
                );
                if (!activeField) {
                    return (
                        <span style={{ width: '100%', color: Colors.GRAY1 }}>
                            Tried to reference field with unknown id:{' '}
                            {item.target.fieldId}
                        </span>
                    );
                }
                return (
                    <Popover2
                        key={item.id}
                        content={
                            <FilterConfiguration
                                isEditMode={isEditMode}
                                field={activeField}
                                filterRule={item}
                                onSave={(value) => {
                                    updateDimensionDashboardFilter(
                                        value,
                                        index,
                                    );
                                }}
                            />
                        }
                        popoverClassName={Classes.POPOVER2_CONTENT_SIZING}
                        position="bottom"
                        lazy={false}
                        disabled={isLoading}
                    >
                        <ActiveFilter
                            key={item.id}
                            field={activeField}
                            filterRule={item}
                            onRemove={() =>
                                removeDimensionDashboardFilter(index)
                            }
                        />
                    </Popover2>
                );
            })}
        </TagsWrapper>
    );
};

export default ActiveFilters;
