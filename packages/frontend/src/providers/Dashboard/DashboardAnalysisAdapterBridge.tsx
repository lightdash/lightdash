import { useCallback, useMemo } from 'react';
import { useParams } from 'react-router';
import { scrollToDashboardTile } from '../../components/common/Dashboard/scrollToDashboardTile';
import {
    useRegisterLauncherAnalysisAdapter,
    type LauncherAnalysisAdapter,
} from '../../ee/features/aiCopilot/components/Launcher/launcherAnalysisAdapter';
import { store as aiAgentStore } from '../../ee/features/aiCopilot/store';
import { openAnalysisPanel } from '../../ee/features/aiCopilot/store/aiAgentLauncherSlice';
import { useAnalysisController } from '../../features/analysis/useAnalysisController';
import { useAnalysisAvailability } from '../../features/apps/analysis/useDataAppAnalysisAvailability';
import { selectDashboardAnalysisSources } from '../../features/dashboard/store/analysisSourceSelectors';
import {
    useDashboardSelector,
    useDashboardStore,
} from '../../features/dashboard/store/hooks';
import { useProjectUuid } from '../../hooks/useProjectUuid';
import useDashboardContext from './useDashboardContext';
import useDashboardTileStatusContext from './useDashboardTileStatusContext';

/**
 * Publishes the dashboard view as an AI analysis target: the launcher orb
 * mounts whenever an adapter is registered, and its Analysis panel drives
 * the generic controller over the tile query registry. View mode only —
 * hidden until the org is rolled out for dashboard analysis.
 */
const DashboardAnalysisAdapterBridge = () => {
    const { mode } = useParams();
    const isEditMode = mode === 'edit';
    const projectUuid = useProjectUuid();
    const dashboard = useDashboardContext((c) => c.dashboard);
    const availability = useAnalysisAvailability('dashboard');
    const { sources, inFlight } = useDashboardSelector(
        selectDashboardAnalysisSources,
    );
    // Expired sources: re-run every tile query past the results cache, once;
    // the fresh registrations re-analyse automatically (same semantics as the
    // app page's iframe reload).
    const clearCacheAndFetch = useDashboardTileStatusContext(
        (c) => c.clearCacheAndFetch,
    );
    const dashboardStore = useDashboardStore();

    const target = useMemo(
        () =>
            dashboard?.uuid
                ? { kind: 'dashboard' as const, dashboardUuid: dashboard.uuid }
                : null,
        [dashboard?.uuid],
    );
    // The analysis panel is where an agent gets picked; opening it is the
    // answer to "investigate needs an agent".
    const onNeedsAgent = useCallback(() => {
        aiAgentStore.dispatch(openAnalysisPanel());
    }, []);
    const controller = useAnalysisController({
        projectUuid,
        target,
        sources,
        inFlight,
        availability,
        // Dashboards analyse on demand; the core still looks up stored
        // analyses of the current view for free.
        autoAnalyse: false,
        onNeedsAgent,
        onSourcesExpired: clearCacheAndFetch,
    });

    // Hovering a finding scrolls its source tile into view with the shared
    // highlight pulse. Read the registry at call time: hover is
    // high-frequency and needs no subscription.
    const onHoverQuery = useCallback(
        (queryUuid: string | null) => {
            if (!queryUuid) return;
            const { tileQueries } = dashboardStore.getState().tileStatus;
            const match = Object.values(tileQueries).find(
                (registration) => registration.queryUuid === queryUuid,
            );
            if (match) scrollToDashboardTile(match.tileUuid);
        },
        [dashboardStore],
    );

    // Hidden entirely until the org is rolled out; otherwise the panel
    // explains any remaining reason it is unavailable.
    const showAnalysis =
        availability.status === 'available' ||
        (availability.status === 'unavailable' &&
            availability.reason !== 'not_rolled_out');
    const adapter = useMemo<LauncherAnalysisAdapter | null>(
        () =>
            projectUuid && target && showAnalysis && !isEditMode
                ? {
                      projectUuid,
                      targetName: dashboard?.name ?? null,
                      availability,
                      controller,
                      highlightAvailable: true,
                      onHoverQuery,
                  }
                : null,
        [
            projectUuid,
            target,
            showAnalysis,
            isEditMode,
            dashboard?.name,
            availability,
            controller,
            onHoverQuery,
        ],
    );
    useRegisterLauncherAnalysisAdapter(adapter);

    return null;
};

export default DashboardAnalysisAdapterBridge;
