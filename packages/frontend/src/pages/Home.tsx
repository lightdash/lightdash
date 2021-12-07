import { Colors, H3, NonIdealState, Spinner, Toaster } from '@blueprintjs/core';
import { IncompleteOnboarding } from 'common';
import React, { FC } from 'react';
import { useToggle, useUnmount } from 'react-use';
import styled from 'styled-components';
import LinkButton from '../components/common/LinkButton';
import LatestDashboards from '../components/Home/LatestDashboards';
import LatestSavedCharts from '../components/Home/LatestSavedCharts';
import SuccessfulOnboarding from '../components/Home/SuccessfulOnboarding';
import OnboardingSteps from '../components/OnboardingSteps';
import { useOnboardingStatus } from '../hooks/useOnboardingStatus';
import { useDefaultProject } from '../hooks/useProjects';
import { useApp } from '../providers/AppProvider';

const HomePageWrapper = styled.div`
    width: 100%;
    margin-top: 20px;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    align-items: center;
`;

const OnboardingPage: FC<{
    status: IncompleteOnboarding;
    projectUuid: string;
}> = ({ status, projectUuid }) => (
    <div style={{ width: 570, paddingTop: 60 }}>
        <H3 style={{ textAlign: 'center', marginBottom: 15 }}>
            Welcome to Lightdash! 🎉
        </H3>
        <p
            style={{
                textAlign: 'center',
                marginBottom: 35,
                color: Colors.GRAY1,
            }}
        >
            Let&apos;s get started with the basics to get you up and running:
        </p>
        <OnboardingSteps status={status} projectUuid={projectUuid} />
    </div>
);

const LandingPage: FC<{ projectUuid: string }> = ({ projectUuid }) => {
    const { user } = useApp();

    return (
        <div style={{ width: 768, paddingTop: 60 }}>
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    marginBottom: 35,
                }}
            >
                <div style={{ flex: 1 }}>
                    <H3 style={{ marginBottom: 15 }}>
                        Welcome, {user.data?.firstName}! ⚡
                    </H3>
                    <p
                        style={{
                            color: Colors.GRAY1,
                        }}
                    >
                        Run a query to ask a business question or browse your
                        data below:
                    </p>
                </div>
                <LinkButton
                    style={{ height: 40 }}
                    href={`/projects/${projectUuid}/tables`}
                    intent="primary"
                    icon="database"
                >
                    Ask a question
                </LinkButton>
            </div>
            <LatestDashboards projectUuid={projectUuid} />
            <LatestSavedCharts projectUuid={projectUuid} />
        </div>
    );
};

const Home: FC = () => {
    const [dismissedSuccess, toggleDismissedSuccess] = useToggle(false);
    const onboarding = useOnboardingStatus();
    const project = useDefaultProject();
    const isLoading = onboarding.isLoading || project.isLoading;
    const error = onboarding.error || project.error;

    useUnmount(() => onboarding.remove());

    if (isLoading) {
        return (
            <div style={{ marginTop: '20px' }}>
                <NonIdealState title="Loading..." icon={<Spinner />} />
            </div>
        );
    }
    if (error) {
        return (
            <div style={{ marginTop: '20px' }}>
                <NonIdealState
                    title="Unexpected error"
                    description={error.error.message}
                />
            </div>
        );
    }
    if (!project.data || !onboarding.data) {
        return (
            <div style={{ marginTop: '20px' }}>
                <NonIdealState
                    title="Unexpected error"
                    description="Please contact support"
                />
            </div>
        );
    }
    return (
        <HomePageWrapper>
            <Toaster position="top">
                {onboarding.data?.isComplete &&
                    onboarding.data.showSuccess &&
                    !dismissedSuccess && (
                        <SuccessfulOnboarding
                            onDismiss={toggleDismissedSuccess}
                        />
                    )}
            </Toaster>
            {!onboarding.data.isComplete ? (
                <OnboardingPage
                    status={onboarding.data}
                    projectUuid={project.data.projectUuid}
                />
            ) : (
                <LandingPage projectUuid={project.data.projectUuid} />
            )}
        </HomePageWrapper>
    );
};

export default Home;
