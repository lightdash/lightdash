import { Badge, Group } from '@mantine/core';
import { type FC, type ReactNode } from 'react';

/** The toolbar's account of changes that are not live yet: what they are, then what can be done with them. The same on every kind of project. */
export const DevelopmentBar: FC<{
    summary: ReactNode;
    children: ReactNode;
}> = ({ summary, children }) => (
    <Group gap="sm" wrap="nowrap" miw={0} flex={1}>
        <Badge color="orange" flex="none">
            In development
        </Badge>
        {summary}
        <Group gap="xs" wrap="nowrap" ml="auto" flex="none">
            {children}
        </Group>
    </Group>
);
