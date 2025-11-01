import { subject } from '@casl/ability';
import { memo, useCallback } from 'react';
import { Provider } from 'react-redux';
import { useNavigate, useParams } from 'react-router';

import { FeatureFlags } from '@lightdash/common';
import { useHotkeys } from '@mantine/hooks';
import Page from '../components/common/Page/Page';
import Explorer from '../components/Explorer';
import ExploreSideBar from '../components/Explorer/ExploreSideBar/index';
import ForbiddenPanel from '../components/ForbiddenPanel';
import {
    explorerActions,
    explorerStore,
    selectTableName,
    useExplorerDispatch,
    useExplorerInitialization,
    useExplorerSelector,
} from '../features/explorer/store';
import { useExplore } from '../hooks/useExplore';
import { useExplorerQueryEffects } from '../hooks/useExplorerQueryEffects';
import {
    useExplorerRoute,
    useExplorerUrlState,
} from '../hooks/useExplorerRoute';
import { useFeatureFlag } from '../hooks/useFeatureFlagEnabled';
import { ProfilerWrapper } from '../perf/ProfilerWrapper';
import useApp from '../providers/App/useApp';
import { defaultState } from '../providers/Explorer/defaultState';

const ExplorerWithUrlParams = memo(() => {
    // Get health config for default limit
    const { health } = useApp();

    // Get URL state for initialization
    const explorerUrlState = useExplorerUrlState();

    // Initialize Redux store with URL state and default limit
    useExplorerInitialization({
        initialState: explorerUrlState,
        isEditMode: true,
        defaultLimit: health.data?.query.defaultLimit,
    });

    // Sync URL params to Redux
    useExplorerRoute();

    // Run the query effects hook - orchestrates all query effects
    useExplorerQueryEffects();

    const dispatch = useExplorerDispatch();
    const navigate = useNavigate();

    // Pre-load the feature flag to avoid trying to render old side bar while it is fetching it in ExploreTree
    useFeatureFlag(FeatureFlags.ExperimentalVirtualizedSideBar);

    // Get table name from Redux
    const tableId = useExplorerSelector(selectTableName);
    const { data } = useExplore(tableId);

    const handleClearQuery = useCallback(() => {
        dispatch(
            explorerActions.clearQuery({
                defaultState,
                tableName: tableId,
            }),
        );
        // Clear state in URL params
        void navigate({ search: '' }, { replace: true });
    }, [dispatch, tableId, navigate]);

    useHotkeys([['mod + alt + k', handleClearQuery]]);

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
    const { projectUuid, tableId } = useParams<{
        projectUuid: string;
        tableId?: string;
    }>();

    const { user } = useApp();

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
        <Provider
            store={explorerStore}
            key={`explorer-${projectUuid}-${tableId || 'none'}`}
        >
            <ExplorerWithUrlParams />
        </Provider>
    );
});

export default ExplorerPage;
