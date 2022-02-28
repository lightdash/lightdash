import { Colors, H3, NonIdealState, Spinner, Toaster } from '@blueprintjs/core';
import React, { FC } from 'react';
import { useToggle, useUnmount } from 'react-use';
import { OpenChatButton } from '../components/common/ChatBubble/OpenChatButton';
import LinkButton from '../components/common/LinkButton';
import Page from '../components/common/Page/Page';
import LatestDashboards from '../components/Home/LatestDashboards/index';
import LatestSavedCharts from '../components/Home/LatestSavedCharts';
import SuccessfulOnboarding from '../components/Home/SuccessfulOnboarding';
import OnboardingPage from '../components/HomePage/OnboardingPage/index';
import { useOnboardingStatus } from '../hooks/useOnboardingStatus';
import { useDefaultProject } from '../hooks/useProjects';
import { useApp } from '../providers/AppProvider';

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
                    icon="series-search"
                >
                    Run a query
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
    const { user } = useApp();
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
        <Page>
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
                    userName={user.data?.firstName}
                />
            ) : (
                <LandingPage projectUuid={project.data.projectUuid} />
            )}
            <OpenChatButton />
        </Page>
    );
};

export default Home;
