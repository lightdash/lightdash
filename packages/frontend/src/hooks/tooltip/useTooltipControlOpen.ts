import { Sx } from '@mantine/core';
import { useCallback, useMemo, useRef, useState } from 'react';

/**
 * Control the Tooltip visibility manually to allow hovering on Label
 * @returns tooltipProps, tooltipLabelProps - props to pass to Tooltip and Label components respectively to control their visibility
 */
export const useTooltipControlOpen = () => {
    // NOTE: Control the Tooltip visibility manually to allow hovering on Label.
    const [opened, setOpened] = useState(false);
    const [isHovering, setIsHovering] = useState(false);
    const closeTimeoutId = useRef<ReturnType<typeof setTimeout> | undefined>(
        undefined,
    );

    const handleMouseEnter = useCallback(() => {
        clearTimeout(closeTimeoutId.current);
        setOpened(true);
    }, []);

    const handleMouseLeave = useCallback(() => {
        // NOTE: Provide similar delay as Tooltip component
        closeTimeoutId.current = setTimeout(() => {
            setOpened(false);
        }, 100);
    }, []);

    const handleLabelMouseEnter = useCallback(() => {
        setIsHovering(true);
        clearTimeout(closeTimeoutId.current);
    }, []);

    const handleLabelMouseLeave = useCallback(() => {
        setIsHovering(false);
        // NOTE: Provide similar delay as Tooltip component
        closeTimeoutId.current = setTimeout(() => {
            setOpened(false);
        }, 100);
    }, []);

    const tooltipProps: {
        sx: Sx;
        isOpen: boolean;
        handleMouseEnter: () => void;
        handleMouseLeave: () => void;
    } = useMemo(
        () => ({
            sx: { pointerEvents: 'auto' },
            isOpen: opened || isHovering,
            handleMouseEnter,
            handleMouseLeave,
        }),
        [handleMouseEnter, handleMouseLeave, isHovering, opened],
    );

    const tooltipLabelProps = useMemo(
        () => ({
            handleLabelMouseEnter,
            handleLabelMouseLeave,
        }),
        [handleLabelMouseEnter, handleLabelMouseLeave],
    );

    return {
        tooltipProps,
        tooltipLabelProps,
    };
};
