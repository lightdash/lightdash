import { type ComponentProps, type FC } from 'react';
import {
    selectControlSections,
    useDashboardSelector,
} from '../dashboard/store';
import { DashboardFiltersBar } from '../dashboardFilters/DashboardFiltersBar';
import { AddControl } from './AddControl';
import { FilterPills } from './FilterPills';
import { SectionedFilters } from './SectionedFilters';
import { SectionsTip } from './SectionsTip';
import { SettledFilterFields } from './SettledFilterFields';
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
    return (
        <>
            {props.isEditMode && <SectionsTip />}
            <DashboardFiltersBar
                {...props}
                // The rail is on the page: a drawer over it would hide it
                isCompactDrawerSuppressed={isSidebarOpen}
                // The flat bar's items share each line's centre with the
                // 30px funnel; the sectioned flow centres its own lines
                filtersAlign={
                    hasSections || props.isEditMode ? 'flex-start' : 'center'
                }
                filterArea={
                    <SettledFilterFields>
                        {/* An editor's bar is always sectioned: its selection starts the first section */}
                        {hasSections || props.isEditMode ? (
                            <SectionedFilters
                                activeTabUuid={props.activeTabUuid}
                            />
                        ) : (
                            <>
                                <AddControl />
                                <FilterPills
                                    activeTabUuid={props.activeTabUuid}
                                />
                            </>
                        )}
                    </SettledFilterFields>
                }
            />
        </>
    );
};
