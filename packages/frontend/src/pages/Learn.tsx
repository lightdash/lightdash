import { FeatureFlags } from '@lightdash/common';
import { type FC } from 'react';
import { Navigate, useParams } from 'react-router';
import Page from '../components/common/Page/Page';
import { LearnCataloguePanel } from '../features/learn/components/LearnCataloguePanel';
import { useServerFeatureFlag } from '../hooks/useServerOrClientFeatureFlag';

const Learn: FC = () => {
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
            <LearnCataloguePanel />
        </Page>
    );
};

export default Learn;
