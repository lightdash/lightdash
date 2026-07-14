import {
    OnboardingStepStatus,
    OnboardingStepType,
    type DashboardBuildResult,
} from '@lightdash/common';
import { useEffect, useRef, type FC } from 'react';
import { useNavigate } from 'react-router';
import PageSpinner from '../../../../../components/PageSpinner';
import { useOnboardingWizard } from '../../../context/wizardContext';
import { useOnboardingAnalytics } from '../../../hooks/useOnboardingAnalytics';
import { useOnboardingJobRunner } from '../../../hooks/useOnboardingJobRunner';
import { patchOnboardingState } from '../../../hooks/useOnboardingState';
import JobProgressPanel from '../JobProgressPanel';
import StepErrorState from '../StepErrorState';
import DashboardResultView from './DashboardResultView';

const DASHBOARD_PLACEHOLDER_STEPS = [
    'Selecting content',
    'Creating charts',
    'Assembling dashboard',
];

const DashboardStep: FC = () => {
    const wizard = useOnboardingWizard();
    const navigate = useNavigate();
    const { trackCompleted, trackFailed } = useOnboardingAnalytics(
        OnboardingStepType.DASHBOARD,
    );
    const runner = useOnboardingJobRunner<DashboardBuildResult>({
        projectUuid: wizard.projectUuid,
        kind: 'dashboard',
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

    const completedMarked = useRef(false);
    useEffect(() => {
        if (
            runner.phase === 'ready' &&
            runner.result &&
            wizard.projectUuid &&
            !completedMarked.current
        ) {
            completedMarked.current = true;
            void patchOnboardingState(wizard.projectUuid, {
                step: OnboardingStepType.DASHBOARD,
                status: OnboardingStepStatus.COMPLETED,
                result: null,
            }).catch(() => undefined);
        }
    }, [runner.phase, runner.result, wizard.projectUuid]);

    if (!wizard.projectUuid) {
        return <PageSpinner />;
    }

    if (runner.phase === 'error') {
        return (
            <StepErrorState
                title="Build your dashboard"
                message={runner.errorMessage}
                isRetrying={false}
                onRetry={runner.retry}
            />
        );
    }

    if (runner.phase === 'ready' && runner.result) {
        const dashboardResult = runner.result;
        return (
            <DashboardResultView
                result={dashboardResult}
                onOpenDashboard={() => {
                    trackCompleted();
                    void navigate(
                        `/projects/${wizard.projectUuid}/dashboards/${dashboardResult.dashboardUuid}/view`,
                    );
                }}
                onExplore={() =>
                    void navigate(`/projects/${wizard.projectUuid}/tables`)
                }
            />
        );
    }

    return (
        <JobProgressPanel
            title="Building your dashboard"
            description="We're assembling a starter dashboard on your own data."
            items={runner.checklistItems}
            placeholderLabels={DASHBOARD_PLACEHOLDER_STEPS}
        />
    );
};

export default DashboardStep;
