import { Stack, Text, Title, UnstyledButton } from '@mantine/core';
import { useDocumentVisibility } from '@mantine/hooks';
import { useState, type ReactNode } from 'react';
import { MOBILE_SIGN_IN_STRINGS } from '../mobileStrings';
import { AskUpsell } from './AskUpsell';
import { BrowseUpsell } from './BrowseUpsell';
import { ChartFitUpsell } from './ChartFitUpsell';
import { DashboardUpsell } from './DashboardUpsell';
import { type MobileUpsellChoice } from './getMobileUpsell';
import classes from './MobileUpsell.module.css';
import { PinnedUpsell } from './PinnedUpsell';
import {
    MOBILE_PITCH_DISMISS_STRINGS,
    type MobilePitchDismissReason,
} from './pitchDismiss';
import { PitchDismissReasons } from './PitchDismissReasons';
import { PlatformsUpsell } from './PlatformsUpsell';
import { UPSELL_STRINGS } from './upsellStrings';

type SignInParts = {
    isIdle: boolean;
    isWaitingForScan: boolean;
    isSignedIn: boolean;
    title: ReactNode;
    step: ReactNode;
    qr: ReactNode;
    details: ReactNode;
    status: ReactNode;
};

type PitchDismiss = {
    onDismiss?: (reason: MobilePitchDismissReason) => void;
};

export const MobileUpsellFrame = ({
    variation,
    ...parts
}: SignInParts & PitchDismiss & { variation: MobileUpsellChoice | null }) => {
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
    isWaitingForScan,
    isSignedIn,
    title,
    qr,
    details,
    status,
    onDismiss,
}: SignInParts & PitchDismiss & { variation: MobileUpsellChoice }) => {
    const visibility = useDocumentVisibility();
    const [askingWhy, setAskingWhy] = useState(false);
    const copy = UPSELL_STRINGS[variation];
    const Graphic = GRAPHICS[variation];
    const canDismiss = onDismiss !== undefined && isIdle && !isSignedIn;
    if (askingWhy && onDismiss) {
        return (
            <div
                className={classes.frame}
                data-mobile-upsell={variation}
                data-paused={visibility === 'hidden'}
            >
                <PitchDismissReasons onPick={onDismiss} />
            </div>
        );
    }
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
                {isSignedIn ? (
                    details
                ) : (
                    <div className={classes.panel} data-step-active={!isIdle}>
                        <div className={classes.qrColumn}>
                            {qr}
                            {isWaitingForScan && (
                                <Text
                                    fz="xs"
                                    c="dimmed"
                                    className={classes.rescanHint}
                                >
                                    {MOBILE_SIGN_IN_STRINGS.rescanHint}
                                </Text>
                            )}
                        </div>
                        <div className={classes.side} data-idle={isIdle}>
                            <div className={classes.stage} aria-hidden="true">
                                <Graphic />
                            </div>
                            {!isIdle && (
                                <div className={classes.sideStep}>
                                    {details}
                                </div>
                            )}
                        </div>
                    </div>
                )}
                {status}
                {canDismiss && (
                    <UnstyledButton
                        type="button"
                        className={classes.dismiss}
                        onClick={() => setAskingWhy(true)}
                    >
                        <Text component="span" fz="xs" c="dimmed">
                            {MOBILE_PITCH_DISMISS_STRINGS.action}
                        </Text>
                    </UnstyledButton>
                )}
            </div>
        </div>
    );
};
