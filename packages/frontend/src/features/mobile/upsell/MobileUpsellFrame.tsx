import { Text, Title } from '@mantine/core';
import { useDocumentVisibility } from '@mantine/hooks';
import { type ReactNode } from 'react';
import { AskUpsell } from './AskUpsell';
import { BrowseUpsell } from './BrowseUpsell';
import { ChartFitUpsell } from './ChartFitUpsell';
import { DashboardUpsell } from './DashboardUpsell';
import classes from './MobileUpsell.module.css';
import { PinnedUpsell } from './PinnedUpsell';
import { StoryUpsell } from './StoryUpsell';
import { UPSELL_STRINGS } from './upsellStrings';

const getMobileUpsell = (search: string) => {
    const value = new URLSearchParams(search).get('mobileUpsell');
    switch (value) {
        case '1':
            return 1;
        case '2':
            return 2;
        case '3':
            return 3;
        case '4':
            return 4;
        case '5':
            return 5;
        case '6':
            return 6;
        default:
            return null;
    }
};

export const MobileUpsellFrame = ({ children }: { children: ReactNode }) => {
    const variation = getMobileUpsell(window.location.search);
    return variation ? (
        <Pitch variation={variation}>{children}</Pitch>
    ) : (
        children
    );
};

const GRAPHICS = {
    1: AskUpsell,
    2: DashboardUpsell,
    3: BrowseUpsell,
    4: PinnedUpsell,
    5: ChartFitUpsell,
    6: StoryUpsell,
};

const Pitch = ({
    variation,
    children,
}: {
    variation: keyof typeof UPSELL_STRINGS;
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
            <Title order={3} className={classes.headline}>
                {copy.headline}
            </Title>
            <Text size="sm" c="dimmed">
                {copy.support}
            </Text>
            <div className={classes.graphic} aria-hidden="true">
                <Graphic />
            </div>
            <div className={classes.signIn}>{children}</div>
        </div>
    );
};
