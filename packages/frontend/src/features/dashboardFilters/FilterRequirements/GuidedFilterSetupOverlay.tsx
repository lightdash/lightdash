import { type WeekDay } from '@lightdash/common';
import { Modal } from '@mantine-8/core';
import { useDisclosure } from '@mantine-8/hooks';
import { type FC } from 'react';
import GuidedFilterSetup from './GuidedFilterSetup';
import classes from './GuidedFilterSetup.module.css';

type Props = {
    /** Applied to the modal root (embed passes its contract class) */
    className?: string;
    startOfWeek?: WeekDay;
    onDismiss: () => void;
};

/**
 * Composes Modal.Root directly (like SchedulerModal) instead of MantineModal:
 * the takeover card has no dialog chrome, and the header/footer MantineModal
 * hard-codes doesn't fit.
 */
const GuidedFilterSetupOverlay: FC<Props> = ({
    className,
    startOfWeek,
    onDismiss,
}) => {
    // Filter inputs report their dropdown state via popoverProps.onOpen/
    // onClose; Escape stands down while a dropdown is open so it only closes
    // the dropdown (the v6 date inputs don't set data-mantine-stop-propagation)
    const [isSubPopoverOpen, { open: openSubPopover, close: closeSubPopover }] =
        useDisclosure();

    return (
        <Modal.Root
            opened
            onClose={onDismiss}
            size={420}
            yOffset="max(170px, 20vh)"
            closeOnEscape={!isSubPopoverOpen}
            transitionProps={{ duration: 0 }}
            className={className}
        >
            <Modal.Overlay />
            <Modal.Content
                className={classes.content}
                aria-label="Set filters to load this dashboard"
            >
                <GuidedFilterSetup
                    startOfWeek={startOfWeek}
                    onDismiss={onDismiss}
                    onSubPopoverOpen={openSubPopover}
                    onSubPopoverClose={closeSubPopover}
                />
            </Modal.Content>
        </Modal.Root>
    );
};

export default GuidedFilterSetupOverlay;
