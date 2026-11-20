import { Box, Group, Skeleton, Stack } from '@mantine/core';
import { type FC } from 'react';
import classes from './StudioPageSkeleton.module.css';

const RAIL_ROWS = [62, 78, 54, 70, 46, 66];

/** The Studio page's frame while its project and models load, so the layout is there before the data. */
export const StudioPageSkeleton: FC = () => (
    <Box
        className={classes.root}
        aria-busy="true"
        aria-label="Loading the semantic layer"
    >
        <Group className={classes.toolbar} gap="sm" wrap="nowrap">
            <Skeleton h={28} w={130} radius="md" />
            <Skeleton h={12} w={120} />
        </Group>
        <Box className={classes.body}>
            <Stack className={classes.rail} gap="md" p="xs">
                <Skeleton h={30} radius="md" />
                <Stack gap="sm" px={6}>
                    {RAIL_ROWS.map((width) => (
                        <Skeleton key={width} h={12} w={`${width}%`} />
                    ))}
                </Stack>
            </Stack>
            <Stack gap="lg" p="xl" maw={1040}>
                <Skeleton h={22} w={160} />
                <Skeleton h={168} radius="md" />
            </Stack>
        </Box>
    </Box>
);
