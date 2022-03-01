import { NonIdealState, Spinner } from '@blueprintjs/core';
import React, { FC } from 'react';
import { useUnmount } from 'react-use';
import { OpenChatButton } from '../components/common/ChatBubble/OpenChatButton';
import Page from '../components/common/Page/Page';
import LandingPanel from '../components/HomePage/LandingPanel';
import OnboardingPanel from '../components/HomePage/OnboardingPanel/index';
import { useOnboardingStatus } from '../hooks/useOnboardingStatus';
import { useDefaultProject } from '../hooks/useProjects';
import { useApp } from '../providers/AppProvider';

const Home: FC = () => {
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
            {!onboarding.data.isComplete ? (
                <OnboardingPanel
                    projectUuid={project.data.projectUuid}
                    userName={user.data?.firstName}
                />
            ) : (
                <LandingPanel
                    // @ts-ignore
                    hasSavedChart={onboarding.data?.savedChart}
                    userName={user.data?.firstName}
                    projectUuid={project.data.projectUuid}
                />
            )}
            <OpenChatButton />
        </Page>
    );
};

export default Home;
