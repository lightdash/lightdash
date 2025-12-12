import { subject } from '@casl/ability';
import { memo, useCallback, useState } from 'react';
import { Provider } from 'react-redux';
import { useNavigate, useParams } from 'react-router';

import { useHotkeys } from '@mantine/hooks';
import Page from '../components/common/Page/Page';
import Explorer from '../components/Explorer';
import ExploreSideBar from '../components/Explorer/ExploreSideBar/index';
import ForbiddenPanel from '../components/ForbiddenPanel';
import {
    buildInitialExplorerState,
    createExplorerStore,
    explorerActions,
    selectTableName,
    useExplorerDispatch,
    useExplorerSelector,
} from '../features/explorer/store';
import { useExplore } from '../hooks/useExplore';
import { useExplorerQueryEffects } from '../hooks/useExplorerQueryEffects';
import {
    useExplorerRoute,
    useExplorerUrlState,
} from '../hooks/useExplorerRoute';
import useApp from '../providers/App/useApp';
import { defaultState } from '../providers/Explorer/defaultState';

const ExplorerContent = memo(() => {
    // Sync URL params to Redux
    useExplorerRoute();

    // Run the query effects hook - orchestrates all query effects
    useExplorerQueryEffects();

    const dispatch = useExplorerDispatch();
    const navigate = useNavigate();

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
            <Explorer />
        </Page>
    );
});

const ExplorerWithUrlParams = memo(() => {
    const { health } = useApp();

    // Get URL state for initialization
    const explorerUrlState = useExplorerUrlState();

    // Create store once when component mounts with URL state
    // Parent component uses key={tableId} so this unmounts/remounts when navigating between tables
    // After initialization, useExplorerRoute handles syncing URL ↔ Redux
    const [store] = useState(() => {
        const initialState = buildInitialExplorerState({
            initialState: explorerUrlState,
            isEditMode: true,
            defaultLimit: health.data?.query.defaultLimit,
        });

        return createExplorerStore({ explorer: initialState });
    });

    return (
        <Provider store={store}>
            <ExplorerContent />
        </Provider>
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

    // Key ensures component remounts when navigating between tables
    return (
        <ExplorerWithUrlParams
            key={`explorer-${projectUuid}-${tableId || 'none'}`}
        />
    );
});

export default ExplorerPage;
