import { Box, Text, Title } from '@mantine-8/core';
import { type FC, type ReactNode } from 'react';
import classes from './AppHeader.module.css';

type Props = {
    name: string;
    description: string | null;
    /** Per-page actions (refresh button, overflow menu, …) rendered on the
     *  right. The builder and viewer have different actions, so each owns its
     *  own slot while sharing this header chrome. */
    rightSection: ReactNode;
};

/**
 * Shared header bar for a data app, used by both the builder (`AppGenerate`)
 * and the standalone viewer (`AppPreviewTest`) so the two surfaces share one
 * chrome instead of diverging.
 */
const AppHeader: FC<Props> = ({ name, description, rightSection }) => (
    <Box className={classes.header}>
        <Box className={classes.info}>
            <Title order={6} fw={600} lineClamp={1}>
                {name || 'Untitled app'}
            </Title>
            {description && (
                <Text size="xs" c="dimmed" lineClamp={1}>
                    {description}
                </Text>
            )}
        </Box>
        {rightSection}
    </Box>
);

export default AppHeader;
