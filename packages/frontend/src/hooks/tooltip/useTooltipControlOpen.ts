import { useRef, useState } from 'react';

/**
 * Control the Tooltip visibility manually to allow hovering on Label
 * @returns isOpen, handleMouseEnter, handleMouseLeave, handleLabelMouseEnter, handleLabelMouseLeave - functions to control the Tooltip visibility along with isOpen state
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

    return {
        isOpen: opened || isHovering,
        handleMouseEnter,
        handleMouseLeave,
        handleLabelMouseEnter,
        handleLabelMouseLeave,
    };
};
