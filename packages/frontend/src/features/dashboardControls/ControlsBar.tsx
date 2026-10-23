import { type ComponentProps, type FC } from 'react';
import { DashboardFiltersBar } from '../dashboardFilters/DashboardFiltersBar';
import FilterRequirementsButton from '../dashboardFilters/FilterRequirements/FilterRequirementsButton';
import { AddControl } from './AddControl';
import { EditingStrip } from './EditingStrip';
import { FilterPills } from './FilterPills';
import { useControlsSidebarSelector } from './useControlsSidebar';

type Props = Omit<
    ComponentProps<typeof DashboardFiltersBar>,
    'filterArea' | 'isCompactDrawerSuppressed'
>;

// The shipped bar with its filter area swapped, in edit and view mode alike
export const ControlsBar: FC<Props> = (props) => {
    const isRailOpen = useControlsSidebarSelector((c) => c.isRailOpen);
    return (
        <DashboardFiltersBar
            {...props}
            // The rail is on the page: a drawer over it would hide it
            isCompactDrawerSuppressed={isRailOpen}
            filterArea={
                // The open rail holds the filters and "Add filter"; the bar
                // says what is being edited
                isRailOpen ? (
                    <EditingStrip />
                ) : (
                    <>
                        <AddControl placement="bar" />
                        <FilterPills activeTabUuid={props.activeTabUuid} />
                        {props.isEditMode && <FilterRequirementsButton />}
                    </>
                )
            }
        />
    );
};
