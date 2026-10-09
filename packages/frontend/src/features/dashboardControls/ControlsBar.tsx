import { type ComponentProps, type FC } from 'react';
import { DashboardFiltersBar } from '../dashboardFilters/DashboardFiltersBar';
import FilterRequirementsButton from '../dashboardFilters/FilterRequirements/FilterRequirementsButton';
import { AddControl } from './AddControl';
import { FilterPills } from './FilterPills';
import { useControlsSidebarSelector } from './useControlsSidebar';

type Props = Omit<ComponentProps<typeof DashboardFiltersBar>, 'filterArea'>;

// The shipped bar with its filter area swapped in edit mode. View mode is the
// shipped bar as it is
export const ControlsBar: FC<Props> = (props) => {
    const isSidebarOpen = useControlsSidebarSelector((c) => c.isSidebarOpen);
    return (
        <DashboardFiltersBar
            {...props}
            filterArea={
                props.isEditMode ? (
                    <>
                        <AddControl />
                        <FilterPills activeTabUuid={props.activeTabUuid} />
                        {!isSidebarOpen && <FilterRequirementsButton />}
                    </>
                ) : undefined
            }
        />
    );
};
