import { Group } from '@mantine/core';
import { type FC, type ReactNode } from 'react';

/** The toolbar's account of changes that are not live yet: where they stand, what they are, then what can be done with them. The same on every kind of project. */
export const DevelopmentBar: FC<{
    /** Where the changes stand: a draft only this person sees, or a pull request. */
    status: ReactNode;
    summary: ReactNode;
    children: ReactNode;
}> = ({ status, summary, children }) => (
    <Group gap="sm" wrap="nowrap" miw={0} flex={1}>
        {status}
        {summary}
        <Group gap="xs" wrap="nowrap" ml="auto" flex="none">
            {children}
        </Group>
    </Group>
);
