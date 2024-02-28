import { subject } from '@casl/ability';
import { memo } from 'react';
import { useParams, useRouteMatch } from 'react-router-dom';

import { useHotkeys } from '@mantine/hooks';
import Page from '../components/common/Page/Page';
import Explorer from '../components/Explorer';
import ExploreSideBar from '../components/Explorer/ExploreSideBar/index';
import ForbiddenPanel from '../components/ForbiddenPanel';
import useDashboardStorage from '../hooks/dashboard/useDashboardStorage';
import { useExplore } from '../hooks/useExplore';
import {
    useDateZoomGranularitySearch,
    useExplorerRoute,
    useExplorerUrlState,
} from '../hooks/useExplorerRoute';
import { useQueryResults } from '../hooks/useQueryResults';
import { useApp } from '../providers/AppProvider';
import {
    ExploreMode,
    ExplorerProvider,
    useExplorerContext,
} from '../providers/ExplorerProvider';

const ExplorerWithUrlParams = memo(() => {
    useExplorerRoute();
    const mode = useExplorerContext((context) => context.state.mode);
    const tableId = useExplorerContext(
        (context) => context.state.unsavedChartVersion.tableName,
    );
    const { data } = useExplore(tableId);

    const { getIsEditingDashboardChart } = useDashboardStorage();

    const clearQuery = useExplorerContext(
        (context) => context.actions.clearQuery,
    );
    useHotkeys([['mod + alt + k', clearQuery]]);

    return (
        <Page
            title={
                mode === ExploreMode.CREATE
                    ? 'Custom Explore'
                    : data
                    ? data?.label
                    : 'Tables'
            }
            sidebar={<ExploreSideBar />}
            withFullHeight
            withPaddedContent
            withMode={mode === ExploreMode.CREATE ? 'SQL Mode' : undefined}
            hasBanner={getIsEditingDashboardChart()}
        >
            <Explorer />
        </Page>
    );
});

const ExplorerPage = memo(() => {
    const { projectUuid, tableId } = useParams<{
        projectUuid: string;
        tableId?: string;
    }>();

    const match = useRouteMatch('/projects/:projectUuid/explore/new');
    const isCreatingNewExplore = match?.isExact;

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
            mode={
                isCreatingNewExplore
                    ? ExploreMode.CREATE
                    : tableId
                    ? ExploreMode.EDIT
                    : ExploreMode.INDEX
            }
            initialState={explorerUrlState}
            queryResults={queryResults}
        >
            <ExplorerWithUrlParams />
        </ExplorerProvider>
    );
});

export default ExplorerPage;
