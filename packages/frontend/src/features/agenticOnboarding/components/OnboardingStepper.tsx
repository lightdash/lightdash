import { OnboardingStepType } from '@lightdash/common';
import { Stepper } from '@mantine-8/core';
import { type FC } from 'react';
import styles from './OnboardingStepper.module.css';

const STEP_ORDER: OnboardingStepType[] = [
    OnboardingStepType.CONNECT,
    OnboardingStepType.PROFILE,
    OnboardingStepType.SEMANTIC_LAYER,
    OnboardingStepType.DASHBOARD,
];

const STEP_LABELS: Record<OnboardingStepType, string> = {
    [OnboardingStepType.CONNECT]: 'Connect',
    [OnboardingStepType.PROFILE]: 'Profile',
    [OnboardingStepType.SEMANTIC_LAYER]: 'Semantic layer',
    [OnboardingStepType.DASHBOARD]: 'Dashboard',
};

type OnboardingStepperProps = {
    step: OnboardingStepType;
    completedSteps?: OnboardingStepType[];
    onStepSelect?: (step: OnboardingStepType) => void;
};

const OnboardingStepper: FC<OnboardingStepperProps> = ({
    step,
    completedSteps = [],
    onStepSelect,
}) => {
    const activeIndex = STEP_ORDER.indexOf(step);

    const handleStepClick = (index: number) => {
        const targetStep = STEP_ORDER[index];
        // Only allow navigating back to already-completed steps.
        if (
            onStepSelect &&
            index < activeIndex &&
            completedSteps.includes(targetStep)
        ) {
            onStepSelect(targetStep);
        }
    };

    return (
        <Stepper
            active={activeIndex}
            onStepClick={handleStepClick}
            allowNextStepsSelect={false}
            size="sm"
            className={styles.stepper}
        >
            {STEP_ORDER.map((stepType, index) => (
                <Stepper.Step
                    key={stepType}
                    label={STEP_LABELS[stepType]}
                    aria-current={index === activeIndex ? 'step' : undefined}
                />
            ))}
        </Stepper>
    );
};

export default OnboardingStepper;
