import { Tour } from '@mantine/core';
import { useEffect, useState, type FC } from 'react';
import ExplorerWelcome from './ExplorerWelcome';
import { EXPLORER_TOUR_STEPS, type ExplorerTourStep } from './steps';
import { setExplorerTourOpen } from './storage';

type Props = {
    opened: boolean;
    onClose: () => void;
};

/** A first-visit welcome, then a short walk through fields, dragging and running. */
const ExplorerTour: FC<Props> = ({ opened, onClose }) => {
    const [steps, setSteps] = useState<ExplorerTourStep[]>([]);
    // A welcome comes first; the pointers start only if the user asks for them
    const [hasStarted, setHasStarted] = useState(false);
    const handleClose = () => {
        setHasStarted(false);
        onClose();
    };
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
                    ({ target }) => document.querySelector(target) !== null,
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
        <>
            <ExplorerWelcome
                opened={opened && !hasStarted}
                onStart={() => setHasStarted(true)}
                onSkip={handleClose}
            />
            <Tour
                active={opened && hasStarted && steps.length > 0}
                onClose={handleClose}
                spotlightRadius={8}
                labels={{ close: 'Done', skip: 'Skip tour' }}
            >
                {steps.map((step) => (
                    <Tour.Step
                        key={step.title}
                        target={step.target}
                        title={step.title}
                        position={step.position}
                    >
                        {step.body}
                    </Tour.Step>
                ))}
            </Tour>
        </>
    );
};

export default ExplorerTour;
