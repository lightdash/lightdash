import { subject } from '@casl/ability';
import { type SummaryExplore } from '@lightdash/common';
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
import { useOptionalProjectRoute } from '../../../hooks/useProjectRoute';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import { useAbilityContext } from '../../../providers/Ability/useAbilityContext';
import { defaultState } from '../../../providers/Explorer/defaultState';
import { TrackSection } from '../../../providers/Tracking/TrackingProvider';
import { SectionName } from '../../../types/Events';
import LoadingSkeleton from '../ExploreTree/LoadingSkeleton';

const LazyExplorePanel = lazy(() => import('../ExplorePanel'));
const LazyBasePanel = lazy(() => import('./BasePanel'));

type Props = {
    // Embeds override table navigation and the back-to-tables action so both
    // stay inside the embed route.
    onExploreClick?: (explore: SummaryExplore) => void;
    onBackToTables?: () => void;
    isCollapsible?: boolean;
};

const ExploreSideBar = memo((props: Props) => {
    const { onExploreClick, onBackToTables, isCollapsible = false } = props;
    const projectUuid = useProjectUuid();
    const projectRoute = useOptionalProjectRoute();
    const projectUrlIdentifier =
        projectRoute?.projectUrlIdentifier ?? projectUuid;

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
        if (onBackToTables) {
            onBackToTables();
            return;
        }
        void navigate(`/projects/${projectUrlIdentifier}/tables`);
    }, [clearExplore, navigate, projectUrlIdentifier, onBackToTables]);

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
                    <LazyBasePanel
                        onExploreClick={onExploreClick}
                        isCollapsible={isCollapsible}
                    />
                </Suspense>
            ) : (
                <Suspense fallback={<LoadingSkeleton />}>
                    <LazyExplorePanel
                        onBack={
                            onBackToTables || canManageExplore
                                ? handleBack
                                : undefined
                        }
                        isCollapsible={isCollapsible}
                    />
                </Suspense>
            )}
        </TrackSection>
    );
});

ExploreSideBar.displayName = 'ExploreSideBar';

export default ExploreSideBar;
