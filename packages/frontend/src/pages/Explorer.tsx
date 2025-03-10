import { subject } from '@casl/ability';
import { memo } from 'react';
import { useParams } from 'react-router';

import { useHotkeys } from '@mantine/hooks';
import Explorer from '../components/Explorer';
import ExploreSideBar from '../components/Explorer/ExploreSideBar/index';
import ForbiddenPanel from '../components/ForbiddenPanel';
import Page from '../components/common/Page/Page';
import { useExplore } from '../hooks/useExplore';
import {
    useDateZoomGranularitySearch,
    useExplorerRoute,
    useExplorerUrlState,
} from '../hooks/useExplorerRoute';
import useApp from '../providers/App/useApp';
import ExplorerProvider from '../providers/Explorer/ExplorerProvider';
import useExplorerContext from '../providers/Explorer/useExplorerContext';

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

const ExplorerPage = memo(() => {
    const { projectUuid } = useParams<{ projectUuid: string }>();

    const explorerUrlState = useExplorerUrlState();
    const { user, health } = useApp();

    const dateZoomGranularity = useDateZoomGranularitySearch();

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
            defaultLimit={health.data?.query.defaultLimit}
            dateZoomGranularity={dateZoomGranularity}
        >
            <ExplorerWithUrlParams />
        </ExplorerProvider>
    );
});

export default ExplorerPage;
