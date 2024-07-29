import { Box } from '@mantine/core';
import { type FC, type ReactNode } from 'react';

type ConditionalDisplayProps = {
    isVisible: boolean;
    children: ReactNode;
};

/**
 * Component that conditionally displays its children based on the value of `isVisible`.
 * This is useful for hiding/showing elements based on the state of a parent component without having to unmount/remount the component.
 */
export const ConditionalDisplay: FC<ConditionalDisplayProps> = ({
    isVisible,
    children,
}) => <Box display={isVisible ? 'block' : 'none'}>{children}</Box>;
