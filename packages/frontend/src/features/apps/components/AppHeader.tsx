import { getAppDisplayName } from '@lightdash/common';
import { Box, Text, Title } from '@mantine-8/core';
import { type FC, type ReactNode } from 'react';
import classes from './AppHeader.module.css';

type Props = {
    appUuid: string;
    name: string;
    description: string | null;
    /** Space indicator shown next to the title (folder chip / "Add to space").
     *  Pass null to omit it (e.g. a brand-new app that isn't persisted yet). */
    spaceChip: ReactNode;
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
const AppHeader: FC<Props> = ({
    appUuid,
    name,
    description,
    spaceChip,
    rightSection,
}) => (
    <Box className={classes.header}>
        <Box className={classes.info}>
            <Box className={classes.titleRow}>
                {spaceChip && (
                    <Box className={classes.chipSlot}>{spaceChip}</Box>
                )}
                <Title
                    order={6}
                    fw={600}
                    lineClamp={1}
                    className={classes.title}
                >
                    {getAppDisplayName(name, appUuid)}
                </Title>
            </Box>
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
