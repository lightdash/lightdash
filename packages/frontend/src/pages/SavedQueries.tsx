import { NonIdealState, Spinner } from '@blueprintjs/core';
import React, { FC } from 'react';
import { useParams } from 'react-router-dom';
import Page from '../components/common/Page/Page';
import SavedQueriesContent from '../components/SavedQueries/SavedQueriesContent';
import { useSavedCharts } from '../hooks/useSpaces';
import { useApp } from '../providers/AppProvider';

const SavedQueries: FC = () => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { isLoading, data } = useSavedCharts(projectUuid);

    const { user } = useApp();
    const cannotView = user.data?.ability?.cannot('view', 'SavedChart');

    if (isLoading && !cannotView) {
        return (
            <div style={{ marginTop: '20px' }}>
                <NonIdealState title="Loading charts" icon={<Spinner />} />
            </div>
        );
    }

    return (
        <Page>
            <SavedQueriesContent
                savedQueries={data || []}
                projectUuid={projectUuid}
                isChart
            />
        </Page>
    );
};

export default SavedQueries;
