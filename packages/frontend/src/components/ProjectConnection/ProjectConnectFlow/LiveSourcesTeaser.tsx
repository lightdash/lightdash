import {
    Box,
    Group,
    Image,
    Loader,
    Stack,
    Text,
    UnstyledButton,
} from '@mantine/core';
import { IconChevronRight } from '@tabler/icons-react';
import { type FC } from 'react';
import { useLiveSourcesAvailability } from '../../../features/externalConnections/hooks/useLiveSourcesAvailability';
import {
    describeLiveSources,
    shortLiveSourceLabel,
    useEnabledLiveSources,
} from '../../../features/externalConnections/liveSources/enabledLiveSources';
import { isGoogleConnector } from '../../../features/externalConnections/liveSources/googleConnection';
import { type AvailableLiveSource } from '../../../features/externalConnections/liveSources/liveSourceCatalog';
import useApp from '../../../providers/App/useApp';
import MantineIcon from '../../common/MantineIcon';
import { NextUpCard } from '../../common/OnboardingVisuals';
import classes from './DataSourceChooser.module.css';

const TEASED_COUNT = 4;

// Only what the tools step will actually offer: turned on, and Google needs its OAuth client
const useTeasedLiveSources = () => {
    const { health } = useApp();
    const isAvailable = useLiveSourcesAvailability().isAvailable;
    const enabled = useEnabledLiveSources();
    const hasGoogle = health.data?.hasGoogleLiveSources === true;
    const sources = enabled.sources
        .filter(
            ({ connector, inOnboarding }) =>
                inOnboarding && (hasGoogle || !isGoogleConnector(connector)),
        )
        .slice(0, TEASED_COUNT);
    return { isEnabled: isAvailable && sources.length > 0, sources };
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

/** Starts a project with live sources only; a warehouse can be connected later */
export const LiveSourcesStartCard: FC<{
    isStarting: boolean;
    onStart: () => void;
}> = ({ isStarting, onStart }) => {
    const { isEnabled, sources } = useTeasedLiveSources();
    if (!isEnabled) return null;
    return (
        <UnstyledButton
            className={`${classes.tile} ${classes.infoCard}`}
            disabled={isStarting}
            onClick={onStart}
        >
            <Group gap="sm" wrap="nowrap" w="100%">
                <TeaserIcons sources={sources} />
                <Stack gap={0} className={classes.shortcutText}>
                    <Text fw={500} size="sm">
                        {`Start with ${describeLiveSources(
                            sources.map(({ label }) =>
                                shortLiveSourceLabel(label),
                            ),
                            { shown: TEASED_COUNT, conjunction: 'or' },
                        )}`}
                    </Text>
                    <Text size="xs" c="dimmed">
                        No warehouse yet? Connect a tool now and add your
                        warehouse whenever you're ready.
                    </Text>
                </Stack>
                {isStarting ? (
                    <Loader size={14} color="gray" />
                ) : (
                    <MantineIcon icon={IconChevronRight} color="ldGray.5" />
                )}
            </Group>
        </UnstyledButton>
    );
};

/** Teases the live sources the tools step offers, beside the warehouse form */
export const LiveSourcesNextUp: FC = () => {
    const { isEnabled, sources } = useTeasedLiveSources();
    if (!isEnabled) return null;
    return (
        <NextUpCard>
            <Stack gap={8}>
                <Text fz="xs" c="dimmed">
                    Up next
                </Text>
                {sources.map(({ id, icon, label }) => (
                    <Group key={id} gap={6} wrap="nowrap">
                        <Image src={icon} alt="" w={14} h={14} />
                        <Text fz="xs" fw={500}>
                            {shortLiveSourceLabel(label)}
                        </Text>
                    </Group>
                ))}
            </Stack>
        </NextUpCard>
    );
};
