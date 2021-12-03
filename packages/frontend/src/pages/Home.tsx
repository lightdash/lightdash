import { Colors, H3, NonIdealState, Spinner } from '@blueprintjs/core';
import { OnboardingStatus } from 'common';
import React, { FC } from 'react';
import styled from 'styled-components';
import OnboardingSteps from '../components/OnboardingSteps';
import { useOnboardingStatus } from '../hooks/useOnboardingStatus';
import { useProjects } from '../hooks/useProjects';

const HomePageWrapper = styled.div`
    width: 100%;
    margin-top: 20px;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    align-items: center;
`;

const OnboardingPage: FC<{ status: OnboardingStatus; projectUuid: string }> = ({
    status,
    projectUuid,
}) => (
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

const Home: FC = () => {
    const onboarding = useOnboardingStatus();
    const projects = useProjects();
    const isLoading = onboarding.isLoading || projects.isLoading;
    const error = onboarding.error || projects.error;

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
    if (!projects.data || !onboarding.data) {
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
            {!onboarding.data.completedAt ? (
                <OnboardingPage
                    status={onboarding.data}
                    projectUuid={projects.data[0].projectUuid}
                />
            ) : (
                <div style={{ width: 570, paddingTop: 60 }}>
                    <H3 style={{ textAlign: 'center', marginBottom: 15 }}>
                        Welcome to Lightdash! 🎉
                    </H3>
                </div>
            )}
        </HomePageWrapper>
    );
};

export default Home;
