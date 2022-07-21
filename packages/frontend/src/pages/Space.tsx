import { NonIdealState, Spinner } from '@blueprintjs/core';
import React, { FC } from 'react';
import { useParams } from 'react-router-dom';
import Page from '../components/common/Page/Page';
import ForbiddenPanel from '../components/ForbiddenPanel';
import SpacePanel from '../components/SpacePanel';
import { useSpaces } from '../hooks/useSpaces';
import { useApp } from '../providers/AppProvider';

const Space: FC = () => {
    const params = useParams<{ projectUuid: string; spaceUuid: string }>();
    const selectedProjectUuid = params.projectUuid;

    //const project = useProject(selectedProjectUuid);
    //const onboarding = useOnboardingStatus();
    const { data, isLoading, error } = useSpaces(selectedProjectUuid);

    const { user } = useApp();

    if (user.data?.ability?.cannot('view', 'SavedChart')) {
        return <ForbiddenPanel />;
    }

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
    const selectedSpace =
        data && data.find((space) => space.uuid === params.spaceUuid);

    if (selectedSpace === undefined) {
        return (
            <div style={{ marginTop: '20px' }}>
                <NonIdealState
                    title="Space does not exist"
                    description={`We could not find space with uuid ${params.spaceUuid}`}
                />
            </div>
        );
    }

    return (
        <Page>
            <SpacePanel space={selectedSpace}></SpacePanel>
        </Page>
    );
};

export default Space;
