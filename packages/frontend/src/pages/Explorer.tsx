import { subject } from '@casl/ability';
import { memo } from 'react';
import { Provider } from 'react-redux';
import { useParams } from 'react-router';

import { useHotkeys } from '@mantine/hooks';
import Page from '../components/common/Page/Page';
import Explorer from '../components/Explorer';
import ExploreSideBar from '../components/Explorer/ExploreSideBar/index';
import ForbiddenPanel from '../components/ForbiddenPanel';
import { explorerStore } from '../features/explorer/store';
import { useExplore } from '../hooks/useExplore';
import { useExplorerQueryManager } from '../hooks/useExplorerQueryManager';
import {
    useDateZoomGranularitySearch,
    useExplorerRoute,
    useExplorerUrlState,
} from '../hooks/useExplorerRoute';
import { ProfilerWrapper } from '../perf/ProfilerWrapper';
import useApp from '../providers/App/useApp';
import { defaultState } from '../providers/Explorer/defaultState';
import ExplorerProvider from '../providers/Explorer/ExplorerProvider';
import useExplorerContext from '../providers/Explorer/useExplorerContext';

const ExplorerWithUrlParams = memo<{
    dateZoomGranularity?: string;
}>(({ dateZoomGranularity }) => {
    // Run the query manager hook - orchestrates all query effects
    useExplorerQueryManager(
        undefined, // viewModeQueryArgs - undefined for edit mode
        dateZoomGranularity as any,
        undefined, // projectUuid - will be inferred from URL params
        false, // minimal
    );

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
            <ProfilerWrapper id="Explorer">
                <Explorer />
            </ProfilerWrapper>
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
        <Provider store={explorerStore}>
            <ExplorerProvider
                isEditMode={true}
                initialState={
                    explorerUrlState
                        ? { ...explorerUrlState, isEditMode: true }
                        : { ...defaultState, isEditMode: true }
                }
                defaultLimit={health.data?.query.defaultLimit}
            >
                <ExplorerWithUrlParams
                    dateZoomGranularity={dateZoomGranularity}
                />
            </ExplorerProvider>
        </Provider>
    );
});

export default ExplorerPage;
