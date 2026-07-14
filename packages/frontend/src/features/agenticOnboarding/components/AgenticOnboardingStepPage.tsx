import { type FC } from 'react';
import { Navigate } from 'react-router';
import PageSpinner from '../../../components/PageSpinner';
import { useOnboardingFeatureFlag } from '../hooks/useOnboardingFeatureFlag';
import AgenticOnboardingWizard from './AgenticOnboardingWizard';

const AgenticOnboardingStepPage: FC = () => {
    const { isEnabled, isLoading } = useOnboardingFeatureFlag();

    if (isLoading) {
        return <PageSpinner />;
    }
    if (!isEnabled) {
        return <Navigate to="/" replace />;
    }
    return <AgenticOnboardingWizard />;
};

export default AgenticOnboardingStepPage;
