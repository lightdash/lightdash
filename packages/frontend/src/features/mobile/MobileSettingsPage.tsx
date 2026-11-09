import {
    MOBILE_APP_STORE_URL,
    MOBILE_GOOGLE_PLAY_URL,
} from '@lightdash/common';
import { Group, Stack, Text, Title } from '@mantine/core';
import {
    IconBrandApple,
    IconBrandGooglePlay,
    IconDeviceMobile,
    type Icon as TablerIcon,
} from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import { SettingsCard } from '../../components/common/Settings/SettingsCard';
import { SettingsPage } from '../../components/common/Settings/SettingsPage';
import useHealth from '../../hooks/health/useHealth';
import classes from './MobileSettingsPage.module.css';

const StoreBadge: FC<{
    href: string;
    icon: TablerIcon;
    caption: string;
    store: string;
}> = ({ href, icon, caption, store }) => (
    <a
        className={classes.storeBadge}
        href={href}
        target="_blank"
        rel="noreferrer"
        aria-label={`${caption} ${store}`}
    >
        <MantineIcon icon={icon} size="xl" />
        <span className={classes.storeBadgeText}>
            <span className={classes.storeBadgeCaption}>{caption}</span>
            <span className={classes.storeBadgeName}>{store}</span>
        </span>
    </a>
);

const getHost = (siteUrl: string | undefined) => {
    if (!siteUrl) return null;
    try {
        return new URL(siteUrl).host;
    } catch {
        return null;
    }
};

export const MobileSettingsPage: FC = () => {
    const { data: health } = useHealth();
    const host = getHost(health?.siteUrl);

    return (
        <SettingsPage title="Mobile">
            <SettingsCard withBorder>
                <Stack gap="sm">
                    <Group gap="xs" wrap="nowrap">
                        <MantineIcon icon={IconDeviceMobile} />
                        <Title order={5}>Get the app</Title>
                    </Group>
                    {host && (
                        <Text size="sm" c="dimmed">
                            Sign in to{' '}
                            <Text span fw={600} c="bright">
                                {host}
                            </Text>
                            .
                        </Text>
                    )}
                    <Group gap="sm" aria-label="Store links">
                        <StoreBadge
                            href={MOBILE_APP_STORE_URL}
                            icon={IconBrandApple}
                            caption="Download on the"
                            store="App Store"
                        />
                        <StoreBadge
                            href={MOBILE_GOOGLE_PLAY_URL}
                            icon={IconBrandGooglePlay}
                            caption="Get it on"
                            store="Google Play"
                        />
                    </Group>
                </Stack>
            </SettingsCard>
        </SettingsPage>
    );
};
