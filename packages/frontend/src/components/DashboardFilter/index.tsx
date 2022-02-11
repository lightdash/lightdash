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

const DashboardFilter: FC = () => {
    const [isOpen, setIsOpen] = useState(false);
    const { dashboard, dashboardFilters } = useDashboardContext();
    const { isLoading, data: filterableFields } =
        useAvailableDashboardFilterTargets(dashboard);
    const hasTiles = dashboard.tiles.length >= 1;

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
                disabled={!hasTiles || isLoading}
            >
                <FilterTrigger
                    minimal
                    icon="filter-list"
                    disabled={!hasTiles || isLoading}
                >
                    Add filter
                </FilterTrigger>
            </TriggerWrapper>
            {dashboardFilters && <ActiveFilters />}
        </DashboardFilterWrapper>
    );
};

export default DashboardFilter;
