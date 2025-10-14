import { subject } from '@casl/ability';
import { memo } from 'react';
import { Provider } from 'react-redux';
import { useParams } from 'react-router';

import { useHotkeys } from '@mantine/hooks';
import Page from '../components/common/Page/Page';
import Explorer from '../components/Explorer';
import ExploreSideBar from '../components/Explorer/ExploreSideBar/index';
import ForbiddenPanel from '../components/ForbiddenPanel';
import {
    explorerStore,
    selectTableName,
    useExplorerSelector,
} from '../features/explorer/store';
import { useExplore } from '../hooks/useExplore';
import { useExplorerQueryEffects } from '../hooks/useExplorerQueryEffects';
import {
    useExplorerRoute,
    useExplorerUrlState,
} from '../hooks/useExplorerRoute';
import { ProfilerWrapper } from '../perf/ProfilerWrapper';
import useApp from '../providers/App/useApp';
import { defaultState } from '../providers/Explorer/defaultState';
import ExplorerProvider from '../providers/Explorer/ExplorerProvider';
import useExplorerContext from '../providers/Explorer/useExplorerContext';

const ExplorerWithUrlParams = memo(() => {
    // Run the query effects hook - orchestrates all query effects
    useExplorerQueryEffects();
    useExplorerRoute();

    // Get table name from Redux
    const tableId = useExplorerSelector(selectTableName);
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
                <ExplorerWithUrlParams />
            </ExplorerProvider>
        </Provider>
    );
});

export default ExplorerPage;
