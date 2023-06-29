import { Sx } from '@mantine/core';
import { useRef, useState } from 'react';

/**
 * Control the Tooltip visibility manually to allow hovering on Label
 * @returns tooltipProps, tooltipLabelProps - props to pass to Tooltip and Label components respectively to control their visibility
 */
export const useTooltipControlOpen = () => {
    // NOTE: Control the Tooltip visibility manually to allow hovering on Label.
    const [opened, setOpened] = useState(false);
    const [isHovering, setIsHovering] = useState(false);
    const closeTimeoutId = useRef<number | undefined>(undefined);

    const handleMouseEnter = () => {
        clearTimeout(closeTimeoutId.current);
        setOpened(true);
    };

    const handleMouseLeave = () => {
        // NOTE: Provide similar delay as Tooltip component
        closeTimeoutId.current = window.setTimeout(() => {
            setOpened(false);
        }, 100);
    };

    const handleLabelMouseEnter = () => {
        setIsHovering(true);
        clearTimeout(closeTimeoutId.current);
    };

    const handleLabelMouseLeave = () => {
        setIsHovering(false);
        // NOTE: Provide similar delay as Tooltip component
        closeTimeoutId.current = window.setTimeout(() => {
            setOpened(false);
        }, 100);
    };

    const tooltipProps: {
        sx: Sx;
        isOpen: boolean;
        handleMouseEnter: () => void;
        handleMouseLeave: () => void;
    } = {
        sx: { pointerEvents: 'auto' },
        isOpen: opened || isHovering,
        handleMouseEnter,
        handleMouseLeave,
    };

    const tooltipLabelProps = {
        handleLabelMouseEnter,
        handleLabelMouseLeave,
    };

    return {
        tooltipProps,
        tooltipLabelProps,
    };
};
