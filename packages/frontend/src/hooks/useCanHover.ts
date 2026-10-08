import { useMediaQuery } from '@mantine/hooks';

/** True when the primary input is a mouse-like pointer that supports hover. */
export const useCanHover = () =>
    useMediaQuery('(hover: hover) and (pointer: fine)', false, {
        getInitialValueInEffect: false,
    });
