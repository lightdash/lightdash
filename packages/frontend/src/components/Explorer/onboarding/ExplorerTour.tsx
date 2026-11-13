import { Tour } from '@mantine/core';
import { useEffect, useState, type FC } from 'react';
import { EXPLORER_TOUR_STEPS, type ExplorerTourStep } from './steps';
import { setExplorerTourOpen } from './storage';

type Props = {
    opened: boolean;
    onClose: () => void;
};

/** A short first-visit walk through picking fields, dragging them and running. */
const ExplorerTour: FC<Props> = ({ opened, onClose }) => {
    const [steps, setSteps] = useState<ExplorerTourStep[]>([]);
    useEffect(() => {
        setExplorerTourOpen(opened);
        return () => setExplorerTourOpen(false);
    }, [opened]);
    useEffect(() => {
        if (!opened) return;
        // Cards and the field list mount with their data, so follow them while open
        const sync = () =>
            setSteps((previous) => {
                const next = EXPLORER_TOUR_STEPS.filter(
                    ({ target }) =>
                        target === null ||
                        document.querySelector(target) !== null,
                );
                return next.length === previous.length &&
                    next.every((step, index) => step === previous[index])
                    ? previous
                    : next;
            });
        sync();
        const observer = new MutationObserver(sync);
        observer.observe(document.body, { childList: true, subtree: true });
        return () => observer.disconnect();
    }, [opened]);

    return (
        <Tour
            active={opened && steps.length > 0}
            onClose={onClose}
            spotlightRadius={8}
            labels={{ close: 'Done', skip: 'Skip tour' }}
        >
            {steps.map((step) => (
                <Tour.Step
                    key={step.title}
                    target={step.target ?? undefined}
                    title={step.title}
                    position={step.position}
                >
                    {step.body}
                </Tour.Step>
            ))}
        </Tour>
    );
};

export default ExplorerTour;
