import { Group, Paper } from '@mantine/core';
import { type FC, type ReactNode } from 'react';

/** Floating actions chip straddling a card/tile's top-right corner — the
 *  dashboard-tile menu pill pattern. Visibility (hover reveal, conditional
 *  render) is the caller's concern. */
export const FloatingActionsPill: FC<{
    className?: string;
    children: ReactNode;
}> = ({ className, children }) => (
    <Paper
        p={5}
        shadow="sm"
        pos="absolute"
        top={-6}
        right={-2}
        className={className}
    >
        <Group gap={5} wrap="nowrap">
            {children}
        </Group>
    </Paper>
);
