import { Classes, Popover2 } from '@blueprintjs/popover2';
import { FilterRule } from 'common';
import React, { FC, useState } from 'react';
import { useDashboardContext } from '../../../providers/DashboardProvider';
import FilterConfiguration from '../FilterConfiguration';
import {
    FilterValues,
    TagContainer,
    TagsWrapper,
} from './ActiveFilters.styles';

const ActiveFilters: FC = () => {
    const [isOpen, setIsOpen] = useState(false);
    const { dashboardFilters, setDashboardFilters } = useDashboardContext();

    const clearFilter = (filterToRemove: FilterRule | undefined) => {
        const updatedArr = dashboardFilters.dimensionFilters.filter(
            (item) => item !== filterToRemove,
        );
        // @ts-ignore
        setDashboardFilters({ dimensionFilters: updatedArr });
        console.log(updatedArr);
    };
    return (
        <TagsWrapper>
            {dashboardFilters.dimensionFilters.map((item) => (
                <Popover2
                    key={item.id}
                    content={<FilterConfiguration />}
                    interactionKind="click"
                    popoverClassName={Classes.POPOVER2_CONTENT_SIZING}
                    isOpen={isOpen}
                    onInteraction={setIsOpen}
                    position="bottom"
                    lazy={false}
                >
                    <TagContainer
                        key={item.id}
                        interactive
                        onRemove={() => clearFilter(item)}
                    >
                        {`${item.target.fieldId}: `}
                        <FilterValues>{item.values?.join(', ')}</FilterValues>
                    </TagContainer>
                </Popover2>
            ))}
        </TagsWrapper>
    );
};

export default ActiveFilters;
