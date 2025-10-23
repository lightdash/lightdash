import { Skeleton, Stack } from '@mantine-8/core';
import type { FC } from 'react';

const LoadingSkeleton: FC<{ hideHeaders?: boolean }> = ({ hideHeaders }) => (
    <Stack>
        {!hideHeaders && <Skeleton h="md" />}
        {!hideHeaders && <Skeleton h="xxl" />}
        <Stack gap="xxs">
            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((index) => (
                <Skeleton key={index} h="xxl" />
            ))}
        </Stack>
    </Stack>
);

export default LoadingSkeleton;
