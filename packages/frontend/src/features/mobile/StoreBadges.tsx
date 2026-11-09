import {
    MOBILE_APP_STORE_URL,
    MOBILE_GOOGLE_PLAY_URL,
} from '@lightdash/common';
import { Group } from '@mantine/core';
import {
    IconBrandApple,
    IconBrandGooglePlay,
    type Icon as TablerIcon,
} from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import classes from './StoreBadges.module.css';

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

export const StoreBadges: FC<{ justify?: 'center' | 'flex-start' }> = ({
    justify = 'flex-start',
}) => (
    <Group gap="sm" justify={justify} aria-label="Store links">
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
);
