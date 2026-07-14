import { OnboardingStepType } from '@lightdash/common';
import { Box, Container, Stack } from '@mantine-8/core';
import { useEffect, useRef, type FC, type ReactNode } from 'react';
import { Navigate } from 'react-router';
import PageSpinner from '../../../components/PageSpinner';
import { useOnboardingWizard } from '../context/wizardContext';
import { useOnboardingEntryGuard } from '../hooks/useOnboardingEntryGuard';
import ConnectStep from './connect/ConnectStep';
import OnboardingStepper from './OnboardingStepper';
import OnboardingWizardProvider from './OnboardingWizardProvider';
import StepStub from './steps/StepStub';

const stepContent = (step: OnboardingStepType): ReactNode => {
    switch (step) {
        case OnboardingStepType.CONNECT:
            return <ConnectStep />;
        case OnboardingStepType.PROFILE:
            return <StepStub title="Profile your data" />;
        case OnboardingStepType.SEMANTIC_LAYER:
            return <StepStub title="Build your semantic layer" />;
        case OnboardingStepType.DASHBOARD:
            return <StepStub title="Build your dashboard" />;
        default:
            return null;
    }
};

const WizardContent: FC = () => {
    const { step, warehouse, method, projectUuid } = useOnboardingWizard();
    const guard = useOnboardingEntryGuard(!!projectUuid);
    const contentRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const heading = contentRef.current?.querySelector<HTMLElement>(
            '[data-onboarding-heading]',
        );
        heading?.focus();
    }, [step, warehouse, method]);

    if (guard === 'loading') {
        return <PageSpinner />;
    }
    if (guard === 'redirect') {
        return <Navigate to="/" replace />;
    }

    return (
        <Container size="md" py="xl">
            <Stack gap="xl">
                <OnboardingStepper step={step} />
                <Box ref={contentRef}>{stepContent(step)}</Box>
            </Stack>
        </Container>
    );
};

const AgenticOnboardingWizard: FC = () => (
    <OnboardingWizardProvider>
        <WizardContent />
    </OnboardingWizardProvider>
);

export default AgenticOnboardingWizard;
