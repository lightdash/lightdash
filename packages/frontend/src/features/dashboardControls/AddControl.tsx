import { type FC } from 'react';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import {
    selectDashboardFilters,
    useDashboardSelector,
} from '../dashboard/store';
import AddFilterButton from '../dashboardFilters/AddFilterButton';
import { useControlsSidebarSelector } from './useControlsSidebar';

const noop = () => {};

type Props = {
    /** An embed's class contract hook on the trigger (default none). */
    triggerClassName?: string;
    /** The viewer bar's tooltip (default: the shipped app wording). */
    unsavedFiltersTooltip?: string;
};

// The bar's shipped "Add filter" button. A viewer's is the shipped view-mode
// one, with the reset button; an editor's has no eye and, once the dashboard
// has filters, reads "Manage filters" and opens the rail on its list. Its
// popover is never given an id to open on, so a click only calls
// `onPopoverOpen`
export const AddControl: FC<Props> = ({
    triggerClassName,
    unsavedFiltersTooltip,
}) => {
    const openNew = useControlsSidebarSelector((c) => c.openNew);
    const openRail = useControlsSidebarSelector((c) => c.openRail);
    const canAddFilters = useControlsSidebarSelector((c) => c.canAddFilters);
    const isViewer = useControlsSidebarSelector((c) => c.isViewer);
    const resetDashboardFilters = useDashboardContext(
        (c) => c.resetDashboardFilters,
    );
    const dashboardFilters = useDashboardSelector(selectDashboardFilters);
    const isManage =
        !isViewer &&
        dashboardFilters.dimensions.length + dashboardFilters.metrics.length >
            0;
    if (!canAddFilters) return null;
    return (
        <AddFilterButton
            isEditMode={!isViewer}
            isVisibilityToggleHidden={!isViewer}
            label={isManage ? 'Manage filters' : undefined}
            triggerClassName={triggerClassName}
            unsavedFiltersTooltip={unsavedFiltersTooltip}
            activeTabUuid={undefined}
            openPopoverId={undefined}
            onPopoverOpen={() => (isManage ? openRail() : openNew())}
            onPopoverClose={noop}
            onSave={noop}
            onResetDashboardFilters={isViewer ? resetDashboardFilters : noop}
        />
    );
};
