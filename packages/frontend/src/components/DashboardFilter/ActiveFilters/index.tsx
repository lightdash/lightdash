import { Classes, Popover2 } from '@blueprintjs/popover2';
import { fieldId, friendlyName } from 'common';
import React, { FC, useState } from 'react';
import { useAvailableDashboardFilterTargets } from '../../../hooks/dashboard/useDashboard';
import { useDashboardContext } from '../../../providers/DashboardProvider';
import FilterConfiguration from '../FilterConfiguration';
import {
    FilterValues,
    TagContainer,
    TagsWrapper,
} from './ActiveFilters.styles';

const ActiveFilters: FC = () => {
    const [isOpen, setIsOpen] = useState(false);
    const { dashboard, dashboardFilters, removeDimensionDashboardFilter } =
        useDashboardContext();
    const { isLoading, data: filterableFields } =
        useAvailableDashboardFilterTargets(dashboard);

    return (
        <TagsWrapper>
            {dashboardFilters.dimensions.map((item, index) => (
                <Popover2
                    key={item.id}
                    content={
                        <FilterConfiguration
                            field={
                                filterableFields.find(
                                    (field) =>
                                        fieldId(field) === item.target.fieldId,
                                )!
                            }
                            clearField={() => undefined}
                        />
                    }
                    interactionKind="click"
                    popoverClassName={Classes.POPOVER2_CONTENT_SIZING}
                    isOpen={isOpen}
                    onInteraction={setIsOpen}
                    position="bottom"
                    lazy={false}
                    disabled={isLoading}
                >
                    <TagContainer
                        key={item.id}
                        interactive
                        onRemove={() => removeDimensionDashboardFilter(index)}
                    >
                        {`${friendlyName(item.target.fieldId)}: `}
                        <FilterValues>{item.values?.join(', ')}</FilterValues>
                    </TagContainer>
                </Popover2>
            ))}
        </TagsWrapper>
    );
};

export default ActiveFilters;
