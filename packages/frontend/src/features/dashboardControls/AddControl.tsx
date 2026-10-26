import { type FC } from 'react';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import AddFilterButton from '../dashboardFilters/AddFilterButton';
import { useControlsSidebarSelector } from './useControlsSidebar';

const noop = () => {};

type Props = {
    /** An embed's class contract hook on the trigger (default none). */
    triggerClassName?: string;
    /** The viewer bar's tooltip (default: the shipped app wording). */
    unsavedFiltersTooltip?: string;
};

// The bar's shipped "Add filter": the eye in edit mode, the reset button in
// view mode. Its popover is never given an id to open on, so a click only
// calls `onPopoverOpen`, which opens a new control
export const AddControl: FC<Props> = ({
    triggerClassName,
    unsavedFiltersTooltip,
}) => {
    const openNew = useControlsSidebarSelector((c) => c.openNew);
    const canAddFilters = useControlsSidebarSelector((c) => c.canAddFilters);
    const isViewer = useControlsSidebarSelector((c) => c.isViewer);
    const resetDashboardFilters = useDashboardContext(
        (c) => c.resetDashboardFilters,
    );
    if (!canAddFilters) return null;
    return (
        <AddFilterButton
            isEditMode={!isViewer}
            triggerClassName={triggerClassName}
            unsavedFiltersTooltip={unsavedFiltersTooltip}
            activeTabUuid={undefined}
            openPopoverId={undefined}
            onPopoverOpen={() => openNew()}
            onPopoverClose={noop}
            onSave={noop}
            onResetDashboardFilters={isViewer ? resetDashboardFilters : noop}
        />
    );
};
