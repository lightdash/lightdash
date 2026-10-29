import { type MantineTransition, type PopoverProps } from '@mantine/core';
import { useReducedMotion } from '@mantine/hooks';
import { useMemo } from 'react';

// Fades in while it settles 4px down onto its anchor
const settle: MantineTransition = {
    in: { opacity: 1, transform: 'translateY(0)' },
    out: { opacity: 0, transform: 'translateY(-4px)' },
    transitionProperty: 'opacity, transform',
};

/** The controls' popovers' arrival: Mantine's duration, none under reduced motion. */
export const usePopoverTransition = (): PopoverProps['transitionProps'] => {
    const isReduced = useReducedMotion();
    return useMemo(
        () =>
            isReduced
                ? { transition: settle, duration: 0 }
                : { transition: settle },
        [isReduced],
    );
};
