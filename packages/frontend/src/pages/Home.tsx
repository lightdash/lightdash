import { NonIdealState, Spinner } from '@blueprintjs/core';
import React, { FC } from 'react';
import { useParams } from 'react-router-dom';
import { useUnmount } from 'react-use';
import Page from '../components/common/Page/Page';
import LandingPanel from '../components/Home/LandingPanel';
import OnboardingPanel from '../components/Home/OnboardingPanel/index';
import {
    useOnboardingStatus,
    useProjectSavedChartStatus,
} from '../hooks/useOnboardingStatus';
import { useProject } from '../hooks/useProject';
import { useApp } from '../providers/AppProvider';

const Home: FC = () => {
    const params = useParams<{ projectUuid: string }>();
    const selectedProjectUuid = params.projectUuid;
    const project = useProject(selectedProjectUuid);
    const onboarding = useOnboardingStatus();

    const { user } = useApp();
    const savedChartStatus = useProjectSavedChartStatus(selectedProjectUuid);
    const isLoading =
        onboarding.isLoading || project.isLoading || savedChartStatus.isLoading;

    const error = onboarding.error || project.error || savedChartStatus.error;
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
            {!onboarding.data.ranQuery ? (
                <OnboardingPanel
                    projectUuid={project.data.projectUuid}
                    userName={user.data?.firstName}
                />
            ) : (
                <LandingPanel
                    hasSavedChart={!!savedChartStatus.data}
                    userName={user.data?.firstName}
                    projectUuid={project.data.projectUuid}
                />
            )}
        </Page>
    );
};

export default Home;
