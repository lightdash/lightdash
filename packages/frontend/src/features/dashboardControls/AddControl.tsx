import { Box, Button, Divider, Menu, Tooltip } from '@mantine/core';
import { IconChevronDown } from '@tabler/icons-react';
import { type FC, type ReactNode } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import AddFilterButton from '../dashboardFilters/AddFilterButton';
import classes from './FilterPills.module.css';
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
    /** An editor's sectioned bar: the caret menu's "Add section" (default none). */
    onAddSection?: () => void;
};

// Joined between "Add filter" and the eye: a caret opening "Add section"
const AddMoreMenu: FC<{ onAddSection: () => void }> = ({ onAddSection }) => (
    <>
        <Divider orientation="vertical" />
        {/* Focus goes to the new section's name input */}
        <Menu position="bottom-start" returnFocus={false}>
            <Menu.Target>
                <Tooltip label="More ways to add">
                    {/* The middle of the joined group: square, as the shipped
                        trigger and eye are on their joined sides */}
                    <Button
                        size="xs"
                        variant="default"
                        radius={0}
                        className={classes.addMore}
                        aria-label="More ways to add"
                        data-controls-add-more
                    >
                        <MantineIcon icon={IconChevronDown} />
                    </Button>
                </Tooltip>
            </Menu.Target>
            <Menu.Dropdown>
                <Menu.Item onClick={onAddSection}>Add section</Menu.Item>
            </Menu.Dropdown>
        </Menu>
    </>
);

// The bar's shipped "Add filter" button, which starts a new filter in the
// rail. An editor's carries the shipped eye that hides it from viewers; a
// viewer's is the shipped view-mode one, with the reset button. Its popover
// is never given an id to open on, so a click only calls `onPopoverOpen`
export const AddControl: FC<Props> = ({
    triggerClassName,
    unsavedFiltersTooltip,
    onAddSection,
}) => {
    const openNew = useControlsSidebarSelector((c) => c.openNew);
    const canAddFilters = useControlsSidebarSelector((c) => c.canAddFilters);
    const isViewer = useControlsSidebarSelector((c) => c.isViewer);
    const resetDashboardFilters = useDashboardContext(
        (c) => c.resetDashboardFilters,
    );
    if (!canAddFilters) return null;
    return (
        <InertWhileEditing>
            <AddFilterButton
                isEditMode={!isViewer}
                triggerClassName={triggerClassName}
                unsavedFiltersTooltip={unsavedFiltersTooltip}
                attachedSlot={
                    onAddSection !== undefined && !isViewer ? (
                        <AddMoreMenu onAddSection={onAddSection} />
                    ) : undefined
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
        </InertWhileEditing>
    );
};
