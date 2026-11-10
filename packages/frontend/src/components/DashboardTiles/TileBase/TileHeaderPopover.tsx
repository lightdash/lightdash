import { Popover, type PopoverProps } from '@mantine/core';
import { useContext, useEffect, useId, type FC } from 'react';
import { TileHeaderPopoverContext } from './tileHeaderPopoverContext';

/** Popover for tile header actions; keeps the header visible while open. */
export const TileHeaderPopover: FC<PopoverProps> = ({
    onOpen,
    onClose,
    ...props
}) => {
    const id = useId();
    const setHeaderPopoverOpen = useContext(TileHeaderPopoverContext);

    useEffect(
        () => () => setHeaderPopoverOpen(id, false),
        [id, setHeaderPopoverOpen],
    );

    return (
        <Popover
            withArrow
            position="bottom-end"
            offset={4}
            arrowOffset={10}
            {...props}
            onOpen={() => {
                setHeaderPopoverOpen(id, true);
                onOpen?.();
            }}
            onClose={() => {
                setHeaderPopoverOpen(id, false);
                onClose?.();
            }}
        />
    );
};
