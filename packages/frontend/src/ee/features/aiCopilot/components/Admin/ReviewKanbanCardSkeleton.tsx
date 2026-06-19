import { Box, Group, Skeleton, Stack } from '@mantine-8/core';
import { type FC } from 'react';
import styles from './ReviewKanbanBoard.module.css';

/** Subtle placeholder card shown while the board's first page of items loads. */
export const ReviewKanbanCardSkeleton: FC = () => (
    <Box className={styles.cardSkeleton}>
        <Stack gap={10} p="sm">
            <Skeleton height={9} radius="xl" width="85%" />
            <Skeleton height={9} radius="xl" width="55%" />
            <Group justify="space-between" align="center" mt={2}>
                <Skeleton height={18} radius="sm" width={84} />
                <Skeleton height={22} circle />
            </Group>
        </Stack>
    </Box>
);
