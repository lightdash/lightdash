import { Tour, type FloatingPosition } from '@mantine/core';
import { useEffect, useState, type FC } from 'react';
import { useGuidedTour } from '../../../../hooks/useGuidedTour';
import { HOMEPAGE_TOUR_STORAGE_KEY } from './homepageTourStorage';

type HomepageTourStep = {
    target: string;
    title: string;
    body: string;
    position: FloatingPosition;
};

const HOMEPAGE_TOUR_STEPS: HomepageTourStep[] = [
    {
        target: '[data-tour="home-ask"]',
        title: 'Ask anything',
        body: 'Type a question in plain English. You get a chart and the query behind it.',
        position: 'bottom',
    },
    {
        target: '[data-tour="home-suggestions"]',
        title: 'Not sure where to start?',
        body: 'These questions come from your own tables. Pick one to get an answer.',
        position: 'bottom',
    },
    {
        target: '[data-tour="home-setup"]',
        title: 'Finish setting up',
        body: 'Add data, metrics and teammates to get better answers.',
        position: 'top',
    },
    {
        target: '[data-tour="nav-workspace"]',
        title: 'Build it yourself',
        body: 'New starts a chart, dashboard or SQL query. Browse finds everything your team has saved.',
        position: 'bottom',
    },
];

export const HomepageTour: FC<{ ready: boolean }> = ({ ready }) => {
    const { isOpen, closeTour } = useGuidedTour({
        storageKey: HOMEPAGE_TOUR_STORAGE_KEY,
    });
    const shouldOpen = isOpen && ready;
    const [steps, setSteps] = useState<HomepageTourStep[]>([]);
    useEffect(() => {
        if (!shouldOpen) return;
        // A frame later, so portalled targets like the setup dock have mounted
        const frame = requestAnimationFrame(() =>
            setSteps(
                HOMEPAGE_TOUR_STEPS.filter(
                    ({ target }) => document.querySelector(target) !== null,
                ),
            ),
        );
        return () => cancelAnimationFrame(frame);
    }, [shouldOpen]);

    return (
        <Tour
            active={shouldOpen && steps.length > 0}
            onClose={closeTour}
            spotlightRadius={12}
            labels={{ close: 'Done', skip: 'Skip tour' }}
        >
            {steps.map((step) => (
                <Tour.Step
                    key={step.target}
                    target={step.target}
                    title={step.title}
                    position={step.position}
                >
                    {step.body}
                </Tour.Step>
            ))}
        </Tour>
    );
};
