import { Popover } from '@mantine/core';
import { type FC, type ReactNode } from 'react';
import {
    useControlContractClasses,
    type ControlContractClassNames,
} from './controlContractClasses';
import classes from './FilterEditor.module.css';

// Closing is immediate and opening is the dropdown's own CSS arrival, which
// also plays when the editor moves to a new pill
const NO_TRANSITION = { duration: 0 };

type Props = {
    /** Open and not standing in for mapping. */
    isShown: boolean;
    /** The embed contract class of this kind's popover. */
    dropdownClass: keyof Pick<
        ControlContractClassNames,
        'filterDropdown' | 'parameterDropdown' | 'dateZoomDropdown'
    >;
    position?: 'bottom-start' | 'bottom-end';
    /** The editor; mounted only while shown. */
    content: ReactNode;
    /** The pill, or "Add filter" for a new filter; must take a ref. */
    children: ReactNode;
};

// A control's editor as a popover under its pill, placed as the shipped
// pill's, with focus kept inside. The providers own Escape and clicks outside
// (`useEditorDismiss`), so Mantine's are off, and so are its roles: an
// expanded target reads as an open list. Focus goes back to the pill from
// the provider
export const ControlEditorPopover: FC<Props> = ({
    isShown,
    dropdownClass,
    position = 'bottom-start',
    content,
    children,
}) => {
    const contractClasses = useControlContractClasses();
    return (
        <Popover
            opened={isShown}
            position={position}
            withArrow
            offset={1}
            arrowOffset={14}
            transitionProps={NO_TRANSITION}
            trapFocus
            closeOnEscape={false}
            closeOnClickOutside={false}
            withRoles={false}
        >
            <Popover.Target>{children}</Popover.Target>
            {/* Mounted only while open, so a closing popover draws nothing,
                not even for the frame its transition takes to end */}
            {isShown && (
                <Popover.Dropdown
                    p={0}
                    // The trap's last resort before its body has mounted
                    tabIndex={-1}
                    data-controls-editor
                    className={
                        contractClasses === null
                            ? classes.dropdown
                            : `${classes.dropdown} ${contractClasses.editor} ${contractClasses[dropdownClass]}`
                    }
                >
                    {content}
                </Popover.Dropdown>
            )}
        </Popover>
    );
};
