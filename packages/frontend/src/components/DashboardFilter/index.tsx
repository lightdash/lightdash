import { Classes } from '@blueprintjs/popover2';
import React, { FC, useState } from 'react';
import { useAvailableDashboardFilterTargets } from '../../hooks/dashboard/useDashboard';
import { useDashboardContext } from '../../providers/DashboardProvider';
import ActiveFilters from './ActiveFilters';
import {
    DashboardFilterWrapper,
    FilterTrigger,
    TriggerWrapper,
} from './DashboardFilter.styles';
import FilterSearch from './FilterSearch';

interface Props {
    hasCharts: boolean;
}

const DashboardFilter: FC<Props> = ({ hasCharts }) => {
    const [isOpen, setIsOpen] = useState(false);
    const { dashboard, dashboardFilters } = useDashboardContext();
    const { isLoading, data: filterableFields } =
        useAvailableDashboardFilterTargets(dashboard);

    return (
        <DashboardFilterWrapper>
            <TriggerWrapper
                content={
                    <FilterSearch
                        fields={filterableFields}
                        onClose={() => setIsOpen(false)}
                    />
                }
                interactionKind="click"
                popoverClassName={Classes.POPOVER2_CONTENT_SIZING}
                isOpen={isOpen}
                onInteraction={setIsOpen}
                position="bottom-right"
                lazy={false}
                disabled={isLoading || !hasCharts}
            >
                <FilterTrigger
                    minimal
                    icon="filter-list"
                    disabled={isLoading || !hasCharts}
                >
                    Add filter
                </FilterTrigger>
            </TriggerWrapper>
            {dashboardFilters && <ActiveFilters />}
        </DashboardFilterWrapper>
    );
};

export default DashboardFilter;
