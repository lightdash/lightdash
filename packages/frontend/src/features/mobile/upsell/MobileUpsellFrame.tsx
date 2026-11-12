import { Text, Title } from '@mantine/core';
import { useDocumentVisibility } from '@mantine/hooks';
import { type ReactNode } from 'react';
import { AskUpsell } from './AskUpsell';
import { BrowseUpsell } from './BrowseUpsell';
import { ChartFitUpsell } from './ChartFitUpsell';
import { DashboardUpsell } from './DashboardUpsell';
import { type MobileUpsellChoice } from './getMobileUpsell';
import classes from './MobileUpsell.module.css';
import { PinnedUpsell } from './PinnedUpsell';
import { PlatformsUpsell } from './PlatformsUpsell';
import { UPSELL_STRINGS } from './upsellStrings';

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
                <Text size="sm" className={classes.support}>
                    {copy.support}
                </Text>
            </div>
            <div className={classes.stage} aria-hidden="true">
                <Graphic />
            </div>
            <div className={classes.signIn}>{children}</div>
        </div>
    );
};
