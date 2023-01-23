import { NonIdealState, Spinner } from '@blueprintjs/core';
import { FC } from 'react';
import { Helmet } from 'react-helmet';
import { useParams } from 'react-router-dom';
import ErrorState from '../components/common/ErrorState';
import Page from '../components/common/Page/Page';
// import ForbiddenPanel from '../components/ForbiddenPanel';
// import SpacePanel from '../components/SpacePanel';
import { useSpaces } from '../hooks/useSpaces';
import { useApp } from '../providers/AppProvider';

const Spaces: FC = () => {
    const params = useParams<{ projectUuid: string }>();
    const { data, isLoading, error } = useSpaces(params.projectUuid);
    // const { user } = useApp();

    // TODO: fix permissions
    // if (user.data?.ability?.cannot('view', 'SavedChart')) {
    //     return <ForbiddenPanel />;
    // }

    if (isLoading) {
        return (
            <div style={{ marginTop: '20px' }}>
                <NonIdealState title="Loading..." icon={<Spinner />} />
            </div>
        );
    }

    if (error) {
        return <ErrorState error={error.error} />;
    }

    return (
        <Page>
            <Helmet>
                <title>Spaces - Lightdash</title>
            </Helmet>
        </Page>
    );
};

export default Spaces;
