import { type FC } from 'react';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import {
    selectIsAddFilterDisabled,
    useDashboardSelector,
} from '../dashboard/store';
import AddFilterButton from '../dashboardFilters/AddFilterButton';
import { useControlsSidebarSelector } from './useControlsSidebar';

const noop = () => {};

type Props = {
    /**
     * The bar's is the shipped one of the mode: the eye in edit mode, the
     * reset button in view mode. The rail's footer has neither.
     */
    placement: 'bar' | 'rail';
    /** An embed's class contract hook on the trigger (default none). */
    triggerClassName?: string;
    /** The viewer bar's tooltip (default: the shipped app wording). */
    unsavedFiltersTooltip?: string;
};

// The shipped "Add filter". Its popover is never given an id to open on, so a
// click only calls `onPopoverOpen`, which opens a new control
export const AddControl: FC<Props> = ({
    placement,
    triggerClassName,
    unsavedFiltersTooltip,
}) => {
    const openNew = useControlsSidebarSelector((c) => c.openNew);
    const canAddFilters = useControlsSidebarSelector((c) => c.canAddFilters);
    const isViewer = useControlsSidebarSelector((c) => c.isViewer);
    const isAddFilterDisabled = useDashboardSelector(selectIsAddFilterDisabled);
    const resetDashboardFilters = useDashboardContext(
        (c) => c.resetDashboardFilters,
    );
    const isBarOfViewer = isViewer && placement === 'bar';
    // Hidden from viewers by the editor's eye
    if (isViewer && placement === 'rail' && isAddFilterDisabled) return null;
    if (!canAddFilters) return null;
    return (
        <AddFilterButton
            isEditMode={!isBarOfViewer}
            isVisibilityToggleHidden={placement === 'rail'}
            triggerClassName={triggerClassName}
            unsavedFiltersTooltip={unsavedFiltersTooltip}
            activeTabUuid={undefined}
            openPopoverId={undefined}
            onPopoverOpen={() => openNew()}
            onPopoverClose={noop}
            onSave={noop}
            onResetDashboardFilters={
                isBarOfViewer ? resetDashboardFilters : noop
            }
        />
    );
};
