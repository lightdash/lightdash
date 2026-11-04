import { ApiConnectorType, FeatureFlags } from '@lightdash/common';
import { Box, Group, Image, Stack, Text } from '@mantine/core';
import { type FC } from 'react';
import {
    isAvailableLiveSource,
    LIVE_SOURCE_CATALOG,
    type AvailableLiveSource,
} from '../../../features/externalConnections/liveSources/liveSourceCatalog';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import useApp from '../../../providers/App/useApp';
import classes from './DataSourceChooser.module.css';

const GOOGLE_CONNECTORS = new Set<ApiConnectorType>([
    ApiConnectorType.GA4,
    ApiConnectorType.SEARCH_CONSOLE,
]);

// Only what the tools step will actually offer: Google needs its OAuth client
const useTeasedLiveSources = () => {
    const { health } = useApp();
    const isEnabled =
        useServerFeatureFlag(FeatureFlags.ApiQuerySources).data?.enabled ===
        true;
    const hasGoogle = health.data?.hasGoogleLiveSources === true;
    return {
        isEnabled,
        hasGoogle,
        sources: LIVE_SOURCE_CATALOG.filter(isAvailableLiveSource)
            .filter(
                ({ connector }) =>
                    hasGoogle || !GOOGLE_CONNECTORS.has(connector),
            )
            .slice(0, 4),
    };
};

const TeaserIcons: FC<{ sources: AvailableLiveSource[] }> = ({ sources }) => (
    <Box className={classes.teaserIcons} aria-hidden>
        {sources.map(({ id, icon }) => (
            <Box key={id} className={classes.teaserIcon}>
                <Image src={icon} alt="" w={14} h={14} />
            </Box>
        ))}
    </Box>
);

export const LiveSourcesCard: FC = () => {
    const { isEnabled, hasGoogle, sources } = useTeasedLiveSources();
    if (!isEnabled) return null;
    return (
        <Group gap="sm" wrap="nowrap" className={classes.infoCard}>
            <TeaserIcons sources={sources} />
            <Stack gap={0} className={classes.shortcutText}>
                <Text fw={500} size="sm">
                    {hasGoogle
                        ? 'You can also connect PostHog, GA4 and Search Console'
                        : 'You can also connect PostHog'}
                </Text>
                <Text size="xs" c="dimmed">
                    Right after you connect your warehouse.
                </Text>
            </Stack>
        </Group>
    );
};

export const LiveSourcesNote: FC = () => {
    const { isEnabled, hasGoogle, sources } = useTeasedLiveSources();
    if (!isEnabled) return null;
    return (
        <Group gap="xs" wrap="nowrap">
            <TeaserIcons sources={sources} />
            <Text size="xs" c="dimmed">
                {hasGoogle
                    ? 'After this, you can also add live sources like PostHog and GA4.'
                    : 'After this, you can also add PostHog as a live source.'}
            </Text>
        </Group>
    );
};
