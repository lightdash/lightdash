import {
    OnboardingStepType,
    type SemanticLayerResult,
} from '@lightdash/common';
import { useEffect, useRef, type FC } from 'react';
import PageSpinner from '../../../../../components/PageSpinner';
import { useOnboardingWizard } from '../../../context/wizardContext';
import { useOnboardingAnalytics } from '../../../hooks/useOnboardingAnalytics';
import { useOnboardingJobRunner } from '../../../hooks/useOnboardingJobRunner';
import JobProgressPanel from '../JobProgressPanel';
import StepErrorState from '../StepErrorState';
import SemanticLayerResultView from './SemanticLayerResultView';

const SEMANTIC_PLACEHOLDER_STEPS = [
    'Generating explores',
    'Compiling & validating',
    'Saving',
];

const SemanticLayerStep: FC = () => {
    const wizard = useOnboardingWizard();
    const { trackCompleted, trackFailed } = useOnboardingAnalytics(
        OnboardingStepType.SEMANTIC_LAYER,
    );
    const runner = useOnboardingJobRunner<SemanticLayerResult>({
        projectUuid: wizard.projectUuid,
        kind: 'semantic-layer',
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
        wizard.goToProjectStep(
            wizard.projectUuid,
            OnboardingStepType.DASHBOARD,
        );
    };

    if (!wizard.projectUuid) {
        return <PageSpinner />;
    }

    if (runner.phase === 'error') {
        return (
            <StepErrorState
                title="Build your semantic layer"
                message={runner.errorMessage}
                isRetrying={false}
                onRetry={runner.retry}
            />
        );
    }

    if (runner.phase === 'ready' && runner.result) {
        return (
            <SemanticLayerResultView
                key={runner.result.generatedAt}
                initialResult={runner.result}
                projectUuid={wizard.projectUuid}
                onContinue={() => void handleContinue()}
            />
        );
    }

    return (
        <JobProgressPanel
            title="Building your semantic layer"
            description="We're turning your schema into governed metrics and dimensions."
            items={runner.checklistItems}
            placeholderLabels={SEMANTIC_PLACEHOLDER_STEPS}
        />
    );
};

export default SemanticLayerStep;
