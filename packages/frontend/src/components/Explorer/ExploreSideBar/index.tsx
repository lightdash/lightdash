import { subject } from '@casl/ability';
import { useQueryClient } from '@tanstack/react-query';
import {
    lazy,
    memo,
    Suspense,
    useCallback,
    useDeferredValue,
    useMemo,
} from 'react';
import { useNavigate } from 'react-router';
import {
    explorerActions,
    selectTableName,
    useExplorerDispatch,
    useExplorerSelector,
} from '../../../features/explorer/store';
import { useOrganization } from '../../../hooks/organization/useOrganization';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import { useAbilityContext } from '../../../providers/Ability/useAbilityContext';
import { defaultState } from '../../../providers/Explorer/defaultState';
import { TrackSection } from '../../../providers/Tracking/TrackingProvider';
import { SectionName } from '../../../types/Events';
import LoadingSkeleton from '../ExploreTree/LoadingSkeleton';

const LazyExplorePanel = lazy(() => import('../ExplorePanel'));
const LazyBasePanel = lazy(() => import('./BasePanel'));

const ExploreSideBar = memo(() => {
    const projectUuid = useProjectUuid();

    const tableName = useExplorerSelector(selectTableName);
    const deferredTableName = useDeferredValue(tableName);
    const ability = useAbilityContext();
    const { data: org } = useOrganization();

    const queryClient = useQueryClient();
    const dispatch = useExplorerDispatch();
    const navigate = useNavigate();

    const clearExplore = useCallback(async () => {
        void queryClient.cancelQueries({
            queryKey: ['create-query'],
            exact: false,
        });
        dispatch(explorerActions.reset(defaultState));
        dispatch(explorerActions.resetQueryExecution());
    }, [queryClient, dispatch]);

    const canManageExplore = ability.can(
        'manage',
        subject('Explore', {
            organizationUuid: org?.organizationUuid,
            projectUuid,
        }),
    );
    const handleBack = useCallback(() => {
        void clearExplore();
        void navigate(`/projects/${projectUuid}/tables`);
    }, [clearExplore, navigate, projectUuid]);

    // When transitioning back to tables it's relatively fast so we don't show any skeleton
    const isTransitioningToExplore = useMemo(
        () => tableName !== deferredTableName && !!tableName,
        [tableName, deferredTableName],
    );

    return (
        <TrackSection name={SectionName.SIDEBAR}>
            {isTransitioningToExplore ? (
                <LoadingSkeleton />
            ) : !tableName ? (
                <Suspense fallback={<LoadingSkeleton />}>
                    <LazyBasePanel />
                </Suspense>
            ) : (
                <Suspense fallback={<LoadingSkeleton />}>
                    <LazyExplorePanel
                        onBack={canManageExplore ? handleBack : undefined}
                    />
                </Suspense>
            )}
        </TrackSection>
    );
});

ExploreSideBar.displayName = 'ExploreSideBar';

export default ExploreSideBar;
