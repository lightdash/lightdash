import { subject } from '@casl/ability';
import { Group } from '@mantine-8/core';
import { useHotkeys } from '@mantine/hooks';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Provider } from 'react-redux';
import { useNavigate, useParams } from 'react-router';
import Page from '../components/common/Page/Page';
import Explorer from '../components/Explorer';
import ExploreSideBar from '../components/Explorer/ExploreSideBar/index';
import { SidebarOpenGutter } from '../components/Explorer/SidebarToggleButtons';
import ForbiddenPanel from '../components/ForbiddenPanel';
import {
    buildInitialExplorerState,
    createExplorerStore,
    explorerActions,
    selectIsVisualizationConfigOpen,
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

    const [isSidebarOpen, setIsSidebarOpen] = useState(true);

    // The chart config panel renders inside the sidebar (via a portal). Opening
    // it while the sidebar is collapsed must reveal the sidebar, otherwise the
    // panel has nowhere to render. Fire only on the open transition so a manual
    // collapse afterwards still works.
    const isVizConfigOpen = useExplorerSelector(
        selectIsVisualizationConfigOpen,
    );
    const prevVizConfigOpen = useRef(isVizConfigOpen);
    useEffect(() => {
        if (isVizConfigOpen && !prevVizConfigOpen.current) {
            setIsSidebarOpen(true);
        }
        prevVizConfigOpen.current = isVizConfigOpen;
    }, [isVizConfigOpen]);

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
            sidebar={
                <ExploreSideBar onCollapse={() => setIsSidebarOpen(false)} />
            }
            isSidebarOpen={isSidebarOpen}
            withFullHeight
            withPaddedContent
        >
            <Group
                h="100%"
                align="stretch"
                wrap="nowrap"
                gap="xs"
                style={{ flexGrow: 1 }}
            >
                {!isSidebarOpen && (
                    <SidebarOpenGutter onClick={() => setIsSidebarOpen(true)} />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                    <Explorer />
                </div>
            </Group>
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
