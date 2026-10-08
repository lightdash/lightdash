import { type FC } from 'react';
import AddFilterButton from '../dashboardFilters/AddFilterButton';
import { useControlsSidebarSelector } from './useControlsSidebar';

const noop = () => {};

// The shipped "Add filter" with its eye toggle. Its popover is never given an
// id to open on, so a click only reaches `onPopoverOpen`: the new sidebar
export const AddControl: FC = () => {
    const openNew = useControlsSidebarSelector((c) => c.openNew);
    return (
        <AddFilterButton
            isEditMode
            activeTabUuid={undefined}
            openPopoverId={undefined}
            onPopoverOpen={() => openNew()}
            onPopoverClose={noop}
            onSave={noop}
            onResetDashboardFilters={noop}
        />
    );
};
