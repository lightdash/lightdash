import { Text, Title } from '@mantine/core';
import { useDocumentVisibility } from '@mantine/hooks';
import { type ReactNode } from 'react';
import { AskUpsell } from './AskUpsell';
import classes from './MobileUpsell.module.css';
import { UPSELL_STRINGS } from './upsellStrings';

const getMobileUpsell = (search: string) => {
    const value = new URLSearchParams(search).get('mobileUpsell');
    return value === '1' ? 1 : null;
};

export const MobileUpsellFrame = ({ children }: { children: ReactNode }) => {
    const variation = getMobileUpsell(window.location.search);
    return variation ? (
        <Pitch variation={variation}>{children}</Pitch>
    ) : (
        children
    );
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
                <AskUpsell />
            </div>
            <div className={classes.signIn}>{children}</div>
        </div>
    );
};
