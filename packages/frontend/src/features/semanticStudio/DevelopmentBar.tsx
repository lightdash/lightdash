import { Group } from '@mantine/core';
import { type FC, type ReactNode } from 'react';

/** The toolbar's account of changes that are not live yet: what there is to say about them, then what can be done with them. The same on every kind of project. */
export const DevelopmentBar: FC<{
    summary: ReactNode;
    children: ReactNode;
}> = ({ summary, children }) => (
    <Group gap="sm" wrap="nowrap" miw={0} flex={1}>
        {summary}
        <Group gap="xs" wrap="nowrap" ml="auto" flex="none">
            {children}
        </Group>
    </Group>
);
