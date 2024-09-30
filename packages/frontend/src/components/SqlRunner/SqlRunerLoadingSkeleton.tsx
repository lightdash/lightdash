import { Skeleton, Stack } from '@mantine/core';

const SqlRunnerLoadingSkeleton = () => (
    <Stack spacing="xs" w="100%" style={{ flex: 1 }}>
        {[0, 1, 2, 3, 4].map((index) => (
            <Skeleton key={index} h="xxl" />
        ))}
    </Stack>
);

export default SqlRunnerLoadingSkeleton;
