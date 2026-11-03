import { FeatureFlags } from '@lightdash/common';
import { Box, Group, Image, Stack, Text } from '@mantine/core';
import { type FC } from 'react';
import {
    isAvailableLiveSource,
    LIVE_SOURCE_CATALOG,
} from '../../../features/externalConnections/liveSources/liveSourceCatalog';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import classes from './DataSourceChooser.module.css';

const TEASED_LIVE_SOURCES = LIVE_SOURCE_CATALOG.filter(
    isAvailableLiveSource,
).slice(0, 4);

const TeaserIcons: FC = () => (
    <Box className={classes.teaserIcons} aria-hidden>
        {TEASED_LIVE_SOURCES.map(({ id, icon }) => (
            <Box key={id} className={classes.teaserIcon}>
                <Image src={icon} alt="" w={14} h={14} />
            </Box>
        ))}
    </Box>
);

const useLiveSourcesEnabled = () =>
    useServerFeatureFlag(FeatureFlags.ApiQuerySources).data?.enabled === true;

export const LiveSourcesCard: FC = () => {
    if (!useLiveSourcesEnabled()) return null;
    return (
        <Stack gap="xs">
            <Text size="sm" fw={500}>
                After setup
            </Text>
            <Group gap="sm" wrap="nowrap" className={classes.infoCard}>
                <TeaserIcons />
                <Stack gap={0} className={classes.shortcutText}>
                    <Text fw={500} size="sm">
                        Live data sources
                    </Text>
                    <Text size="xs" c="dimmed">
                        Connect PostHog, GA4 and more.
                    </Text>
                </Stack>
            </Group>
        </Stack>
    );
};

export const LiveSourcesNote: FC = () => {
    if (!useLiveSourcesEnabled()) return null;
    return (
        <Group gap="xs" wrap="nowrap">
            <TeaserIcons />
            <Text size="xs" c="dimmed">
                After this, you can also add live sources like PostHog and GA4.
            </Text>
        </Group>
    );
};
