import { type FC } from 'react';
import FilterRequirementsButton from '../dashboardFilters/FilterRequirements/FilterRequirementsButton';
import { useFilterSidebar } from './useFilterSidebar';

// Hidden while a filter is open so the sidebar is the only writer of its rules
export const RequirementsButton: FC = () => {
    const { isSidebarOpen } = useFilterSidebar();
    return !isSidebarOpen ? <FilterRequirementsButton /> : null;
};
