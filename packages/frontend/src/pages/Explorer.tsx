import { subject } from '@casl/ability';
import { memo } from 'react';
import { useParams } from 'react-router-dom';

import { useHotkeys } from '@mantine/hooks';
import Page from '../components/common/Page/Page';
import Explorer from '../components/Explorer';
import ExploreSideBar from '../components/Explorer/ExploreSideBar/index';
import ForbiddenPanel from '../components/ForbiddenPanel';
import { useExplore } from '../hooks/useExplore';
import {
    useDateZoomGranularitySearch,
    useExplorerRoute,
    useExplorerUrlState,
} from '../hooks/useExplorerRoute';
import { useQueryResults } from '../hooks/useQueryResults';
import { useApp } from '../providers/AppProvider';
import {
    ExplorerProvider,
    useExplorerContext,
} from '../providers/ExplorerProvider';

const ExplorerWithUrlParams = memo(() => {
    useExplorerRoute();
    const tableId = useExplorerContext(
        (context) => context.state.unsavedChartVersion.tableName,
    );
    const { data } = useExplore(tableId);

    const clearQuery = useExplorerContext(
        (context) => context.actions.clearQuery,
    );
    useHotkeys([['mod + alt + k', clearQuery]]);

    return (
        <Page
            title={data ? data?.label : 'Tables'}
            sidebar={<ExploreSideBar />}
            withFullHeight
            withPaddedContent
        >
            <Explorer />
        </Page>
    );
});

const ExplorerPage = () => {
    const { projectUuid } = useParams<{ projectUuid: string }>();

    const explorerUrlState = useExplorerUrlState();
    const { user } = useApp();

    const dateZoomGranularity = useDateZoomGranularitySearch();

    const queryResults = useQueryResults({ dateZoomGranularity });

    const cannotViewProject = user.data?.ability?.cannot(
        'view',
        subject('Project', {
            organizationUuid: user.data?.organizationUuid,
            projectUuid,
        }),
    );
    const cannotManageExplore = user.data?.ability?.cannot(
        'manage',
        subject('Explore', {
            organizationUuid: user.data?.organizationUuid,
            projectUuid,
        }),
    );

    if (cannotViewProject || cannotManageExplore) {
        return <ForbiddenPanel />;
    }

    return (
        <ExplorerProvider
            isEditMode={true}
            initialState={explorerUrlState}
            queryResults={queryResults}
        >
            <ExplorerWithUrlParams />
        </ExplorerProvider>
    );
};

export default ExplorerPage;
