import { Group, Skeleton } from '@mantine/core';
import { type FC } from 'react';

export const FilterPillSkeletons: FC = () => (
    <Group gap="xs" ml="xs">
        <Skeleton h={30} w={100} radius={4} />
        <Skeleton h={30} w={100} radius={4} />
        <Skeleton h={30} w={100} radius={4} />
        <Skeleton h={30} w={100} radius={4} />
        <Skeleton h={30} w={100} radius={4} />
    </Group>
);
