import { Box } from '@mantine/core';
import { type FC, type ReactNode } from 'react';

type ConditionalVisibilityProps = {
    isVisible: boolean;
    children: ReactNode;
};

/**
 * Component that conditionally displays its children based on the value of `isVisible`.
 * This is useful for hiding/showing elements based on the state of a parent component without having to unmount/remount the component.
 * Since it uses visibility: hidden, it will not be visible in the DOM, but it will still be rendered.
 * This is different from `display: none` which will be visible in the DOM, but not rendered.
 */
export const ConditionalVisibility: FC<ConditionalVisibilityProps> = ({
    isVisible,
    children,
}) => (
    <Box
        h={isVisible ? '100%' : 0}
        sx={{
            visibility: isVisible ? 'visible' : 'hidden',
        }}
    >
        {children}
    </Box>
);
