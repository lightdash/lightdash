import { FeatureFlags } from '@lightdash/common';
import { Tour, type FloatingPosition } from '@mantine/core';
import { type FC } from 'react';
import { useGuidedTour } from '../../../../hooks/useGuidedTour';
import { useServerFeatureFlag } from '../../../../hooks/useServerOrClientFeatureFlag';
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
        body: 'These questions come from your own tables. Pick one to get an answer straight away.',
        position: 'bottom',
    },
    {
        target: '[data-tour="home-setup"]',
        title: 'Finish setting up',
        body: 'More data, metrics and teammates make every answer better.',
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
    const newOnboardingFlag = useServerFeatureFlag(FeatureFlags.NewOnboarding);
    if (newOnboardingFlag.data?.enabled !== true) return null;

    return (
        <Tour
            active={isOpen && ready}
            onClose={closeTour}
            spotlightRadius={12}
            labels={{ close: 'Done', skip: 'Skip tour' }}
        >
            {HOMEPAGE_TOUR_STEPS.map((step) => (
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
