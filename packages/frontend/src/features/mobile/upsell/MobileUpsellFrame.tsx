import {
    MOBILE_APP_STORE_URL,
    MOBILE_GOOGLE_PLAY_URL,
} from '@lightdash/common';
import { Button, Text, Title } from '@mantine/core';
import { useDocumentVisibility } from '@mantine/hooks';
import {
    IconBrandAndroid,
    IconBrandApple,
    IconExternalLink,
    type Icon,
} from '@tabler/icons-react';
import { type ReactNode } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { AskUpsell } from './AskUpsell';
import { BrowseUpsell } from './BrowseUpsell';
import { ChartFitUpsell } from './ChartFitUpsell';
import { DashboardUpsell } from './DashboardUpsell';
import { type MobileUpsellChoice } from './getMobileUpsell';
import classes from './MobileUpsell.module.css';
import { PinnedUpsell } from './PinnedUpsell';
import { PlatformsUpsell } from './PlatformsUpsell';
import { UPSELL_INSTALL_STRINGS as I, UPSELL_STRINGS } from './upsellStrings';

export const MobileUpsellFrame = ({
    variation,
    children,
}: {
    variation: MobileUpsellChoice | null;
    children: ReactNode;
}) => {
    if (!variation) return children;
    return <Pitch variation={variation}>{children}</Pitch>;
};

const GRAPHICS = {
    1: AskUpsell,
    2: DashboardUpsell,
    3: BrowseUpsell,
    4: PinnedUpsell,
    5: ChartFitUpsell,
    6: PlatformsUpsell,
};

const STORES: {
    key: 'ios' | 'android';
    href: string;
    icon: Icon;
}[] = [
    { key: 'ios', href: MOBILE_APP_STORE_URL, icon: IconBrandApple },
    { key: 'android', href: MOBILE_GOOGLE_PLAY_URL, icon: IconBrandAndroid },
];

const InstallRows = () => (
    <ul className={classes.install} aria-label={I.label}>
        {STORES.map(({ key, href, icon }) => (
            <li key={key} className={classes.installRow}>
                <MantineIcon icon={icon} size="lg" />
                <span className={classes.installName}>
                    <Text component="span" size="sm" fw={600}>
                        {I[key].platform}
                    </Text>
                    <Text component="span" size="xs" c="dimmed">
                        {I[key].store}
                    </Text>
                </span>
                <Button
                    component="a"
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    size="compact-sm"
                    variant="default"
                    aria-label={I[key].label}
                    rightSection={
                        <MantineIcon icon={IconExternalLink} size="sm" />
                    }
                >
                    {I.download}
                </Button>
            </li>
        ))}
    </ul>
);

const Pitch = ({
    variation,
    children,
}: {
    variation: MobileUpsellChoice;
    children: ReactNode;
}) => {
    const visibility = useDocumentVisibility();
    const copy = UPSELL_STRINGS[variation];
    const Graphic = GRAPHICS[variation];
    return (
        <div
            className={classes.frame}
            data-mobile-upsell={variation}
            data-paused={visibility === 'hidden'}
        >
            <div className={classes.pitch}>
                <Title order={3} className={classes.headline}>
                    {copy.headline}
                </Title>
                <Text size="sm" c="dimmed">
                    {copy.support}
                </Text>
            </div>
            <div className={classes.stage} aria-hidden="true">
                <Graphic />
            </div>
            <InstallRows />
            <div className={classes.signIn}>{children}</div>
        </div>
    );
};
