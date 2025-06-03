import { Transition, type TransitionProps } from '@mantine-8/core';

import { useEffect, useState } from 'react';

type FadeTransitionProps = Omit<TransitionProps, 'mounted'>;

/**
 * A simple fade transition component that uses Mantine's 8 Transition on component load.
 */
export const FadeTransition = ({
    duration = 600,
    transition = 'fade',
    timingFunction = 'ease',
    children,
}: FadeTransitionProps) => {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        return () => setMounted(false);
    }, []);

    return (
        <Transition
            mounted={mounted}
            transition={transition}
            duration={duration}
            timingFunction={timingFunction}
        >
            {children}
        </Transition>
    );
};
