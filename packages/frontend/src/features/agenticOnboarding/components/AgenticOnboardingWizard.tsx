import { OnboardingStepStatus, OnboardingStepType } from '@lightdash/common';
import { Box, Container, Stack } from '@mantine-8/core';
import { useEffect, useMemo, useRef, type FC, type ReactNode } from 'react';
import { Navigate } from 'react-router';
import PageSpinner from '../../../components/PageSpinner';
import { useOnboardingWizard } from '../context/wizardContext';
import { useOnboardingEntryGuard } from '../hooks/useOnboardingEntryGuard';
import { useOnboardingState } from '../hooks/useOnboardingState';
import ConnectStep from './connect/ConnectStep';
import OnboardingStepper from './OnboardingStepper';
import OnboardingWizardProvider from './OnboardingWizardProvider';
import DashboardStep from './steps/dashboard/DashboardStep';
import ProfileStep from './steps/profile/ProfileStep';
import SemanticLayerStep from './steps/semanticLayer/SemanticLayerStep';

const stepContent = (step: OnboardingStepType): ReactNode => {
    switch (step) {
        case OnboardingStepType.CONNECT:
            return <ConnectStep />;
        case OnboardingStepType.PROFILE:
            return <ProfileStep />;
        case OnboardingStepType.SEMANTIC_LAYER:
            return <SemanticLayerStep />;
        case OnboardingStepType.DASHBOARD:
            return <DashboardStep />;
        default:
            return null;
    }
};

const WizardContent: FC = () => {
    const { step, warehouse, method, projectUuid, goToProjectStep } =
        useOnboardingWizard();
    const guard = useOnboardingEntryGuard(!!projectUuid);
    const contentRef = useRef<HTMLDivElement>(null);

    const stateQuery = useOnboardingState({
        projectUuid: projectUuid ?? undefined,
    });

    const completedSteps = useMemo(
        () =>
            (stateQuery.data?.steps ?? [])
                .filter(
                    (projectStep) =>
                        projectStep.status === OnboardingStepStatus.COMPLETED,
                )
                .map((projectStep) => projectStep.step),
        [stateQuery.data],
    );

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
                <OnboardingStepper
                    step={step}
                    completedSteps={completedSteps}
                    onStepSelect={
                        projectUuid
                            ? (selectedStep) =>
                                  goToProjectStep(projectUuid, selectedStep)
                            : undefined
                    }
                />
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
