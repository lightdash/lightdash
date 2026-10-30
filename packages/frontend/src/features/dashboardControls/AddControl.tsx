import { Box } from '@mantine/core';
import { type FC, type ReactNode } from 'react';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import {
    selectControlSections,
    useDashboardSelector,
} from '../dashboard/store';
import AddFilterButton from '../dashboardFilters/AddFilterButton';
import { FilterBarMenu } from './FilterBarMenu';
import { EditorPopover } from './FilterEditor';
import classes from './FilterPills.module.css';
import { isNewFilterIn, isPickingNewField } from './sidebarState';
import { useControlsSidebarSelector } from './useControlsSidebar';

const noop = () => {};

// The bar's controls that would start something else: inert and dimmed while
// a filter is edited, so Apply or Cancel ends that first. Pills stay live
export const InertWhileEditing: FC<{ children: ReactNode }> = ({
    children,
}) => {
    const isEditing = useControlsSidebarSelector((c) => c.isSidebarOpen);
    return (
        <Box
            display="contents"
            className={classes.inert}
            inert={isEditing || undefined}
        >
            {children}
        </Box>
    );
};

type Props = {
    /** An embed's class contract hook on the trigger (default none). */
    triggerClassName?: string;
    /** The viewer bar's tooltip (default: the shipped app wording). */
    unsavedFiltersTooltip?: string;
};

// The bar's shipped "Add filter" button, which starts a new filter in the
// editor popover, anchored here until a field is picked. An editor's carries the "..." menu (`FilterBarMenu`) in place of the
// shipped eye; a viewer's is the shipped view-mode one, with the reset button. Its popover
// is never given an id to open on, so a click only calls `onPopoverOpen`
export const AddControl: FC<Props> = ({
    triggerClassName,
    unsavedFiltersTooltip,
}) => {
    const openNew = useControlsSidebarSelector((c) => c.openNew);
    const canAddFilters = useControlsSidebarSelector((c) => c.canAddFilters);
    const isViewer = useControlsSidebarSelector((c) => c.isViewer);
    const sectionIds = useDashboardSelector(selectControlSections).map(
        (section) => section.id,
    );
    const isNewOpen = useControlsSidebarSelector(
        (c) => isPickingNewField(c) && !isNewFilterIn(c, sectionIds),
    );
    const resetDashboardFilters = useDashboardContext(
        (c) => c.resetDashboardFilters,
    );
    if (!canAddFilters) return null;
    return (
        <InertWhileEditing>
            <EditorPopover isOpen={isNewOpen}>
                <Box>
                    <AddFilterButton
                        isEditMode={!isViewer}
                        triggerClassName={triggerClassName}
                        unsavedFiltersTooltip={unsavedFiltersTooltip}
                        editModeAction={
                            isViewer ? undefined : <FilterBarMenu />
                        }
                        activeTabUuid={undefined}
                        openPopoverId={undefined}
                        onPopoverOpen={() => openNew()}
                        onPopoverClose={noop}
                        onSave={noop}
                        onResetDashboardFilters={
                            isViewer ? resetDashboardFilters : noop
                        }
                    />
                </Box>
            </EditorPopover>
        </InertWhileEditing>
    );
};
