import { Paper, SimpleGrid, Skeleton, Stack } from '@mantine/core';
import { type FC } from 'react';
import classes from './ChartTypeGalleryCard.module.css';

/** Placeholder cards shaped like the gallery's, so the grid doesn't jump on load. */
const ChartTypeCardSkeletons: FC<{ label: string }> = ({ label }) => (
    <SimpleGrid
        cols={{ base: 1, sm: 2, lg: 3 }}
        spacing="md"
        role="status"
        aria-label={label}
    >
        {Array.from({ length: 6 }, (_, i) => (
            <Paper key={i} withBorder radius="lg" className={classes.card}>
                <Skeleton className={classes.preview} />
                <Stack gap={8} px="xs" pt="sm" pb="xs">
                    <Skeleton h={12} w="45%" radius="sm" />
                    <Skeleton h={10} w="85%" radius="sm" />
                </Stack>
            </Paper>
        ))}
    </SimpleGrid>
);

export default ChartTypeCardSkeletons;
