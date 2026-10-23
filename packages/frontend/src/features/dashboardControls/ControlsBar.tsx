import { type ComponentProps, type FC } from 'react';
import { DashboardFiltersBar } from '../dashboardFilters/DashboardFiltersBar';
import FilterRequirementsButton from '../dashboardFilters/FilterRequirements/FilterRequirementsButton';
import { AddControl } from './AddControl';
import { EditingStrip } from './EditingStrip';
import { FilterPills } from './FilterPills';
import { useControlsSidebarSelector } from './useControlsSidebar';

type Props = Omit<ComponentProps<typeof DashboardFiltersBar>, 'filterArea'>;

// The shipped bar with its filter area swapped in edit mode. View mode is the
// shipped bar as it is
export const ControlsBar: FC<Props> = (props) => {
    const isRailOpen = useControlsSidebarSelector((c) => c.isRailOpen);
    return (
        <DashboardFiltersBar
            {...props}
            filterArea={
                props.isEditMode ? (
                    <>
                        {/* The open rail holds the filters and "Add filter";
                            the bar says what is being edited */}
                        {isRailOpen ? (
                            <EditingStrip />
                        ) : (
                            <>
                                <AddControl isVisibilityToggleHidden={false} />
                                <FilterPills
                                    activeTabUuid={props.activeTabUuid}
                                />
                                <FilterRequirementsButton />
                            </>
                        )}
                    </>
                ) : undefined
            }
        />
    );
};
