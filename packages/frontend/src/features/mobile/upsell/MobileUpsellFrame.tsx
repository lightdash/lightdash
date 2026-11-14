import { Stack, Text, Title } from '@mantine/core';
import { useDocumentVisibility } from '@mantine/hooks';
import { type ReactNode } from 'react';
import { MobileSignInInstallHint } from '../MobileSignInInstallHint';
import { AskUpsell } from './AskUpsell';
import { BrowseUpsell } from './BrowseUpsell';
import { ChartFitUpsell } from './ChartFitUpsell';
import { DashboardUpsell } from './DashboardUpsell';
import { type MobileUpsellChoice } from './getMobileUpsell';
import classes from './MobileUpsell.module.css';
import { PinnedUpsell } from './PinnedUpsell';
import { PlatformsUpsell } from './PlatformsUpsell';
import { UPSELL_STRINGS } from './upsellStrings';

type SignInParts = {
    isIdle: boolean;
    title: ReactNode;
    step: ReactNode;
    qr: ReactNode;
    details: ReactNode;
    status: ReactNode;
};

export const MobileUpsellFrame = ({
    variation,
    ...parts
}: SignInParts & { variation: MobileUpsellChoice | null }) => {
    if (!variation) {
        return (
            <Stack gap="sm">
                {parts.title}
                {parts.step}
            </Stack>
        );
    }
    return <Pitch variation={variation} {...parts} />;
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
    isIdle,
    title,
    qr,
    details,
    status,
}: SignInParts & { variation: MobileUpsellChoice }) => {
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
            <div className={classes.signIn}>
                <div className={classes.signInTitle}>{title}</div>
                <div className={classes.panel} data-step-active={!isIdle}>
                    <div className={classes.qrColumn}>
                        {qr}
                        {isIdle && <MobileSignInInstallHint />}
                    </div>
                    <div className={classes.side} data-idle={isIdle}>
                        <div className={classes.stage} aria-hidden="true">
                            <Graphic />
                        </div>
                        {!isIdle && (
                            <div className={classes.sideStep}>{details}</div>
                        )}
                    </div>
                </div>
                {status}
            </div>
        </div>
    );
};
