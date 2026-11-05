import { Skeleton, Stack } from '@mantine/core';
import { type FC } from 'react';

export const ConnectionFormSkeleton: FC<{ fields?: number }> = ({
    fields = 4,
}) => (
    <Stack gap="lg" aria-busy="true" aria-label="Loading connection form">
        {Array.from({ length: fields }, (_, index) => (
            <Stack key={index} gap={6}>
                <Skeleton h={12} w={96} radius="sm" />
                <Skeleton h={10} w="55%" radius="sm" />
                <Skeleton h={32} radius="md" />
            </Stack>
        ))}
    </Stack>
);
