import { Tour, type FloatingPosition } from '@mantine/core';
import { useEffect, type FC } from 'react';
import useIsEmbedded from '../../../ee/providers/Embed/useIsEmbedded';
import { useGuidedTour } from '../../../hooks/useGuidedTour';
import classes from './ExplorerHint.module.css';
import { EXPLORER_TOUR_STORAGE_KEY, useIsExplorerTourOpen } from './storage';

// Hints wait for the first-visit tour, so two cards never compete
const hasSeenTour = (): boolean => {
    try {
        return localStorage.getItem(EXPLORER_TOUR_STORAGE_KEY) === '1';
    } catch {
        return false;
    }
};

type Props = {
    /** Short name, unique among hints; the hint shows once per browser. */
    name: string;
    target: string;
    title: string;
    body: string;
    position: FloatingPosition;
};

/**
 * A one-time pointer at something that has just appeared. Mount it next to
 * the thing it describes, so it shows the first time that thing does.
 */
const ExplorerHint: FC<Props> = ({ name, target, title, body, position }) => {
    const isEmbedded = useIsEmbedded();
    const storageKey = `ld.explorer.hint.${name}.v1`;
    const { isOpen, closeTour } = useGuidedTour({
        storageKey,
        autoStartOnFirstVisit: !isEmbedded && !navigator.webdriver,
    });

    const isTourOpen = useIsExplorerTourOpen();
    const isShown = isOpen && !isTourOpen && hasSeenTour();

    // Showing it once is enough: it never comes back, dismissed or not
    useEffect(() => {
        if (!isShown) return;
        try {
            localStorage.setItem(storageKey, '1');
        } catch {
            // a hint that shows again is better than a crash
        }
    }, [isShown, storageKey]);

    // Mount nothing until the hint is due, so it costs its host no renders
    if (!isShown) return null;

    return (
        <Tour
            active
            onClose={closeTour}
            withOverlay={false}
            withScrollIntoView={false}
            maxWidth={280}
            labels={{ close: 'Got it' }}
            withCloseButton={false}
            classNames={{
                tooltip: classes.tooltip,
                stepCounter: classes.hidden,
                navigationButton: classes.navigationButton,
            }}
        >
            <Tour.Step target={target} title={title} position={position}>
                {body}
            </Tour.Step>
        </Tour>
    );
};

export default ExplorerHint;
