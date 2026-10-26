import { type ComponentProps, type FC } from 'react';
import {
    selectControlSections,
    useDashboardSelector,
} from '../dashboard/store';
import { DashboardFiltersBar } from '../dashboardFilters/DashboardFiltersBar';
import FilterRequirementsButton from '../dashboardFilters/FilterRequirements/FilterRequirementsButton';
import { AddControl, InertWhileEditing } from './AddControl';
import { FilterPills } from './FilterPills';
import { SectionedFilters } from './SectionedFilters';
import { useControlsSidebarSelector } from './useControlsSidebar';

type Props = Omit<
    ComponentProps<typeof DashboardFiltersBar>,
    'filterArea' | 'isCompactDrawerSuppressed'
>;

// The shipped bar with its filter area swapped, in edit and view mode alike.
// It stays on screen while a filter is edited in the rail
export const ControlsBar: FC<Props> = (props) => {
    const isSidebarOpen = useControlsSidebarSelector((c) => c.isSidebarOpen);
    const hasSections = useDashboardSelector(
        (state) => selectControlSections(state).length > 0,
    );
    const requirements = props.isEditMode && (
        <InertWhileEditing>
            <FilterRequirementsButton />
        </InertWhileEditing>
    );
    return (
        <DashboardFiltersBar
            {...props}
            // The rail is on the page: a drawer over it would hide it
            isCompactDrawerSuppressed={isSidebarOpen}
            filterArea={
                hasSections ? (
                    <SectionedFilters activeTabUuid={props.activeTabUuid}>
                        {requirements}
                    </SectionedFilters>
                ) : (
                    <>
                        <AddControl />
                        <FilterPills activeTabUuid={props.activeTabUuid} />
                        {requirements}
                    </>
                )
            }
        />
    );
};
