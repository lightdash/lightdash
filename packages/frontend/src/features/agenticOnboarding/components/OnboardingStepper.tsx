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
};

const OnboardingStepper: FC<OnboardingStepperProps> = ({ step }) => {
    const activeIndex = STEP_ORDER.indexOf(step);

    return (
        <Stepper
            active={activeIndex}
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
