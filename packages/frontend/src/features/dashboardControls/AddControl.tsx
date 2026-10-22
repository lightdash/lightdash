import { type FC } from 'react';
import AddFilterButton from '../dashboardFilters/AddFilterButton';
import { useControlsSidebarSelector } from './useControlsSidebar';

const noop = () => {};

type Props = {
    /** The rail's footer has no eye: only the bar hides "Add filter". */
    isVisibilityToggleHidden: boolean;
};

// The shipped "Add filter" with its eye toggle. Its popover is never given an
// id to open on, so a click only calls `onPopoverOpen`, which opens a new control
export const AddControl: FC<Props> = ({ isVisibilityToggleHidden }) => {
    const openNew = useControlsSidebarSelector((c) => c.openNew);
    return (
        <AddFilterButton
            isEditMode
            isVisibilityToggleHidden={isVisibilityToggleHidden}
            activeTabUuid={undefined}
            openPopoverId={undefined}
            onPopoverOpen={() => openNew()}
            onPopoverClose={noop}
            onSave={noop}
            onResetDashboardFilters={noop}
        />
    );
};
