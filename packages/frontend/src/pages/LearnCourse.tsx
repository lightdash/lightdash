import { FeatureFlags } from '@lightdash/common';
import { type FC } from 'react';
import { Navigate, useParams } from 'react-router';
import Page from '../components/common/Page/Page';
import { LearnCoursePlayer } from '../features/learn/components/LearnCoursePlayer';
import { useServerFeatureFlag } from '../hooks/useServerOrClientFeatureFlag';

const LearnCourse: FC = () => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const learnFlag = useServerFeatureFlag(FeatureFlags.LearnSection);

    if (!projectUuid || learnFlag.isLoading) {
        return null;
    }

    if (!learnFlag.data?.enabled) {
        return <Navigate to={`/projects/${projectUuid}/home`} replace />;
    }

    return (
        <Page
            title="Learn"
            withCenteredRoot
            withCenteredContent
            withXLargePaddedContent
            withLargeContent
        >
            <LearnCoursePlayer />
        </Page>
    );
};

export default LearnCourse;
