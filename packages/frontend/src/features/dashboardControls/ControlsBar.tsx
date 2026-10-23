import { useMemo, type ComponentProps, type FC } from 'react';
import { DashboardFiltersBar } from '../dashboardFilters/DashboardFiltersBar';
import FilterRequirementsButton from '../dashboardFilters/FilterRequirements/FilterRequirementsButton';
import { AddControl } from './AddControl';
import { EditingStrip } from './EditingStrip';
import { FilterPills } from './FilterPills';
import { useControlsSidebarSelector } from './useControlsSidebar';

type Props = Omit<
    ComponentProps<typeof DashboardFiltersBar>,
    'filterArea' | 'isCompactDrawerSuppressed' | 'dateZoomProps'
>;

// The shipped bar with its filter area swapped, in edit and view mode alike
export const ControlsBar: FC<Props> = (props) => {
    const isRailOpen = useControlsSidebarSelector((c) => c.isRailOpen);
    const openZoom = useControlsSidebarSelector((c) => c.openZoom);
    const openNewZoom = useControlsSidebarSelector((c) => c.openNewZoom);
    // An editor's named zooms open in the rail; both modes say the default's grain
    const dateZoomProps = useMemo(
        () => ({
            onOpenControl: openZoom,
            onAddControl: openNewZoom,
            isDefaultValueShown: true,
        }),
        [openZoom, openNewZoom],
    );
    return (
        <DashboardFiltersBar
            {...props}
            dateZoomProps={dateZoomProps}
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
