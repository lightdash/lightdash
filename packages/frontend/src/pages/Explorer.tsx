import { subject } from '@casl/ability';
import { IconAlertTriangle } from '@tabler/icons-react';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Provider } from 'react-redux';
import { useLocation, useNavigate, useParams } from 'react-router';

import { ExploreType, type SummaryExplore } from '@lightdash/common';
import { useHotkeys } from '@mantine/hooks';
import LoadingState from '../components/common/LoadingState';
import Page from '../components/common/Page/Page';
import SuboptimalState from '../components/common/SuboptimalState/SuboptimalState';
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
import { useExplores } from '../hooks/useExplores';
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
    const isSemanticLayerExplore = data?.type === ExploreType.SEMANTIC_LAYER;
    const pageTitle = isSemanticLayerExplore ? '探索' : data?.label || 'Tables';

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
            title={pageTitle}
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
    const location = useLocation();
    const navigate = useNavigate();

    const { user, health } = useApp();
    const hasSemanticLayer = !!health.data?.hasDbtSemanticLayer;
    const shouldResolveSemanticLayer =
        hasSemanticLayer && !tableId && !!projectUuid;
    const exploresResult = useExplores(projectUuid, true, {
        enabled: shouldResolveSemanticLayer,
    });
    const defaultSemanticExplore = useMemo(() => {
        if (!exploresResult.data?.length) return undefined;
        const semanticExplores = exploresResult.data.filter(
            (explore): explore is SummaryExplore =>
                !('errors' in explore) &&
                explore.type === ExploreType.SEMANTIC_LAYER,
        );
        if (semanticExplores.length === 0) return undefined;
        return [...semanticExplores].sort((a, b) =>
            a.label.localeCompare(b.label),
        )[0];
    }, [exploresResult.data]);

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

    useEffect(() => {
        if (!shouldResolveSemanticLayer || !defaultSemanticExplore) return;
        void navigate(
            {
                pathname: `/projects/${projectUuid}/tables/${defaultSemanticExplore.name}`,
                search: location.search,
            },
            { replace: true },
        );
    }, [
        defaultSemanticExplore,
        location.search,
        navigate,
        projectUuid,
        shouldResolveSemanticLayer,
    ]);

    if (cannotViewProject || cannotManageExplore) {
        return <ForbiddenPanel />;
    }

    if (shouldResolveSemanticLayer) {
        if (exploresResult.isLoading) {
            return <LoadingState title="Loading semantic layer" />;
        }
        if (exploresResult.isError) {
            return (
                <SuboptimalState
                    icon={IconAlertTriangle}
                    title="Could not load explores"
                />
            );
        }
        if (!defaultSemanticExplore) {
            return (
                <SuboptimalState
                    icon={IconAlertTriangle}
                    title="No semantic layer explores"
                />
            );
        }
        return <LoadingState title="Loading semantic layer" />;
    }

    // Key ensures component remounts when navigating between tables
    return (
        <ExplorerWithUrlParams
            key={`explorer-${projectUuid}-${tableId || 'none'}`}
        />
    );
});

export default ExplorerPage;
