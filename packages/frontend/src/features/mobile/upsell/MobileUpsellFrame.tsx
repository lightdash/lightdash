import { Stack, Text, Title } from '@mantine/core';
import { useDocumentVisibility } from '@mantine/hooks';
import { type ReactNode } from 'react';
import { type MobileSignInPhase } from '../useMobileSignInCode';
import { AskUpsell } from './AskUpsell';
import { BrowseUpsell } from './BrowseUpsell';
import { ChartFitUpsell } from './ChartFitUpsell';
import { DashboardUpsell } from './DashboardUpsell';
import { type MobileUpsellChoice } from './getMobileUpsell';
import classes from './MobileUpsell.module.css';
import { PinnedUpsell } from './PinnedUpsell';
import { PlatformsUpsell } from './PlatformsUpsell';
import { SIGN_IN_GUIDE_STRINGS as G, UPSELL_STRINGS } from './upsellStrings';

type SignInParts = {
    phase: MobileSignInPhase;
    title: ReactNode;
    step: ReactNode;
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

const CURRENT_STEP: Partial<Record<MobileSignInPhase, number>> = {
    hidden: 0,
    showing: 0,
    claimed: 1,
};

const stepState = (index: number, current: number) => {
    if (index < current) return 'done';
    return index === current ? 'current' : 'next';
};

const SignInGuide = ({ current }: { current: number }) => (
    <div className={classes.guide}>
        <ol className={classes.steps} aria-label={G.label}>
            {G.steps.map((text, index) => (
                <li
                    key={text}
                    data-state={stepState(index, current)}
                    aria-current={index === current ? 'step' : undefined}
                >
                    <span className={classes.stepNumber}>{index + 1}</span>
                    {text}
                </li>
            ))}
        </ol>
        <Text size="xs" c="dimmed">
            {G.noApp}
        </Text>
    </div>
);

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
    phase,
    title,
    step,
}: SignInParts & { variation: MobileUpsellChoice }) => {
    const visibility = useDocumentVisibility();
    const copy = UPSELL_STRINGS[variation];
    const Graphic = GRAPHICS[variation];
    const current = CURRENT_STEP[phase];
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
            <div className={classes.signIn}>
                {title}
                {current === undefined ? (
                    step
                ) : (
                    <div className={classes.signInBody}>
                        <div className={classes.code}>{step}</div>
                        <SignInGuide current={current} />
                    </div>
                )}
            </div>
        </div>
    );
};
