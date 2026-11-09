import {
    MOBILE_APP_STORE_URL,
    MOBILE_GOOGLE_PLAY_URL,
} from '@lightdash/common';
import { Code, Group, Stack, Text, Title } from '@mantine/core';
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
import { MOBILE_STRINGS } from './mobileStrings';

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
    if (!siteUrl) return window.location.host;
    try {
        return new URL(siteUrl).host;
    } catch {
        return window.location.host;
    }
};

export const MobileSettingsPage: FC = () => {
    const { data: health } = useHealth();
    const host = getHost(health?.siteUrl);

    return (
        <SettingsPage title={MOBILE_STRINGS.pageTitle}>
            <SettingsCard withBorder>
                <Stack gap="sm">
                    <Group gap="xs" wrap="nowrap">
                        <MantineIcon icon={IconDeviceMobile} />
                        <Title order={5}>{MOBILE_STRINGS.getAppTitle}</Title>
                    </Group>
                    <Group gap="sm" aria-label={MOBILE_STRINGS.storeLinksLabel}>
                        <StoreBadge
                            href={MOBILE_APP_STORE_URL}
                            icon={IconBrandApple}
                            caption={MOBILE_STRINGS.appStoreCaption}
                            store={MOBILE_STRINGS.appStoreName}
                        />
                        <StoreBadge
                            href={MOBILE_GOOGLE_PLAY_URL}
                            icon={IconBrandGooglePlay}
                            caption={MOBILE_STRINGS.googlePlayCaption}
                            store={MOBILE_STRINGS.googlePlayName}
                        />
                    </Group>
                    <Group gap="xs" wrap="nowrap">
                        <Text size="sm">{MOBILE_STRINGS.signInTo}</Text>
                        <Code fz="sm">{host}</Code>
                    </Group>
                </Stack>
            </SettingsCard>
        </SettingsPage>
    );
};
