import { OnboardingStepType } from '@lightdash/common';
import { fireEvent, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import OnboardingStepper from './OnboardingStepper';

describe('OnboardingStepper', () => {
    it('navigates back to a completed prior step', () => {
        const onStepSelect = vi.fn();
        renderWithProviders(
            <OnboardingStepper
                step={OnboardingStepType.SEMANTIC_LAYER}
                completedSteps={[
                    OnboardingStepType.CONNECT,
                    OnboardingStepType.PROFILE,
                ]}
                onStepSelect={onStepSelect}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: /Profile/ }));
        expect(onStepSelect).toHaveBeenCalledWith(OnboardingStepType.PROFILE);
    });

    it('does not navigate to a prior step that is not completed', () => {
        const onStepSelect = vi.fn();
        renderWithProviders(
            <OnboardingStepper
                step={OnboardingStepType.SEMANTIC_LAYER}
                completedSteps={[OnboardingStepType.CONNECT]}
                onStepSelect={onStepSelect}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: /Profile/ }));
        expect(onStepSelect).not.toHaveBeenCalled();
    });

    it('does not navigate forward past the active step', () => {
        const onStepSelect = vi.fn();
        renderWithProviders(
            <OnboardingStepper
                step={OnboardingStepType.PROFILE}
                completedSteps={[OnboardingStepType.CONNECT]}
                onStepSelect={onStepSelect}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: /Dashboard/ }));
        expect(onStepSelect).not.toHaveBeenCalled();
    });
});
