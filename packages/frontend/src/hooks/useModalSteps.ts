import { useCallback, useState } from 'react';

/**
 * Hook for managing steps in a modal flow
 * @param initialStep - The initial step to start with
 */
export function useModalSteps<T extends string | number>(
    initialStep: T,
    options?: {
        /**
         * Optional validation functions for each step
         * Return true if the step is valid and can proceed
         */
        validators?: Partial<Record<T, () => boolean>>;
    },
) {
    const [currentStep, setCurrentStep] = useState<T>(initialStep);

    const goToStep = useCallback((step: T) => {
        setCurrentStep(step);
    }, []);

    const goToNextStep = useCallback(
        (nextStep: T) => {
            const validator = options?.validators?.[currentStep];

            if (validator && !validator()) {
                return false;
            }

            setCurrentStep(nextStep);
            return true;
        },
        [currentStep, options?.validators],
    );

    const goToPreviousStep = useCallback((previousStep: T) => {
        setCurrentStep(previousStep);
    }, []);

    return {
        currentStep,
        goToStep,
        goToNextStep,
        goToPreviousStep,
    };
}
