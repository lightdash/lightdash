import {
    OnboardingStepStatus,
    OnboardingStepType,
    type ProfileResult,
} from '@lightdash/common';
import { useEffect, useRef, type FC } from 'react';
import PageSpinner from '../../../../../components/PageSpinner';
import { useOnboardingWizard } from '../../../context/wizardContext';
import { useOnboardingAnalytics } from '../../../hooks/useOnboardingAnalytics';
import { useOnboardingJobRunner } from '../../../hooks/useOnboardingJobRunner';
import { patchOnboardingState } from '../../../hooks/useOnboardingState';
import JobProgressPanel from '../JobProgressPanel';
import StepErrorState from '../StepErrorState';
import ProfileResultView from './ProfileResultView';

const PROFILE_PLACEHOLDER_STEPS = [
    'Connecting',
    'Listing tables',
    'Sampling columns',
    'Inferring entities and relationships',
];

const ProfileStep: FC = () => {
    const wizard = useOnboardingWizard();
    const { trackCompleted, trackFailed } = useOnboardingAnalytics(
        OnboardingStepType.PROFILE,
    );
    const runner = useOnboardingJobRunner<ProfileResult>({
        projectUuid: wizard.projectUuid,
        kind: 'profile',
    });

    const failedTracked = useRef(false);
    useEffect(() => {
        if (runner.phase === 'error' && !failedTracked.current) {
            failedTracked.current = true;
            trackFailed();
        }
        if (runner.phase !== 'error') {
            failedTracked.current = false;
        }
    }, [runner.phase, trackFailed]);

    const handleContinue = async () => {
        if (!wizard.projectUuid) return;
        trackCompleted();
        await patchOnboardingState(wizard.projectUuid, {
            step: OnboardingStepType.PROFILE,
            status: OnboardingStepStatus.COMPLETED,
            result: null,
        }).catch(() => undefined);
        wizard.goToProjectStep(
            wizard.projectUuid,
            OnboardingStepType.SEMANTIC_LAYER,
        );
    };

    if (!wizard.projectUuid) {
        return <PageSpinner />;
    }

    if (runner.phase === 'error') {
        return (
            <StepErrorState
                title="Profile your data"
                message={runner.errorMessage}
                isRetrying={false}
                onRetry={runner.retry}
            />
        );
    }

    if (runner.phase === 'ready' && runner.result) {
        return (
            <ProfileResultView
                result={runner.result}
                onContinue={() => void handleContinue()}
                onBackToConnect={() => wizard.clearWarehouse()}
            />
        );
    }

    return (
        <JobProgressPanel
            title="Profiling your data"
            description="We're introspecting your warehouse to understand the shape of your data."
            items={runner.checklistItems}
            placeholderLabels={PROFILE_PLACEHOLDER_STEPS}
        />
    );
};

export default ProfileStep;
