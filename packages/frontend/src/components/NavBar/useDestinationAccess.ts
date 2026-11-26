import { subject } from '@casl/ability';
import { FeatureFlags } from '@lightdash/common';
import { useCallback } from 'react';
import { useChartTypesEnabled } from '../../features/chartTypes/hooks/useChartTypesEnabled';
import { canOpenSemanticStudio } from '../../features/semanticStudio/permissions';
import { useContentAuthoringEnabled } from '../../hooks/useContentAuthoringEnabled';
import { useProject } from '../../hooks/useProject';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
import useApp from '../../providers/App/useApp';
import useTracking from '../../providers/Tracking/useTracking';
import { EventName } from '../../types/Events';

// Who may open each navigation destination. Every layout that lists a
// destination asks here, so the top navbar and the sidebar cannot disagree.

const useCanInProject = (projectUuid: string | undefined) => {
    const { user } = useApp();
    const ability = user.data?.ability;
    const organizationUuid = user.data?.organizationUuid;
    return (action: 'view' | 'manage', subjectName: string): boolean =>
        projectUuid !== undefined &&
        (ability?.can(
            action,
            subject(subjectName, { organizationUuid, projectUuid }),
        ) ??
            false);
};

/** Building a chart from a table. */
export const useCanExplore = (projectUuid: string | undefined): boolean => {
    const can = useCanInProject(projectUuid);
    const contentAuthoringEnabled = useContentAuthoringEnabled();
    return contentAuthoringEnabled && can('manage', 'Explore');
};

export const useCanUseSqlRunner = (
    projectUuid: string | undefined,
): boolean => {
    const can = useCanInProject(projectUuid);
    const canExplore = useCanExplore(projectUuid);
    const { data: project } = useProject(projectUuid);
    return (
        canExplore &&
        project?.provisioningSource !== 'analytics' &&
        can('manage', 'SqlRunner')
    );
};

export const useCanViewMetrics = (projectUuid: string | undefined): boolean => {
    const can = useCanInProject(projectUuid);
    return can('view', 'MetricsTree') || can('view', 'SpotlightTableConfig');
};

export const useTrackMetricsCatalogClick = (
    projectUuid: string | undefined,
) => {
    const { user } = useApp();
    const { track } = useTracking();
    const { data: project } = useProject(projectUuid);
    const userUuid = user.data?.userUuid;

    return useCallback(() => {
        if (!project || !projectUuid) return;
        track({
            name: EventName.METRICS_CATALOG_CLICKED,
            properties: {
                userId: userUuid,
                organizationId: project.organizationUuid,
                projectId: projectUuid,
            },
        });
    }, [project, projectUuid, track, userUuid]);
};

export const useCanViewDataApps = (): boolean => {
    const { user } = useApp();
    const dataAppsFlag = useServerFeatureFlag(FeatureFlags.EnableDataApps);
    return (
        dataAppsFlag.data?.enabled === true &&
        (user.data?.ability.can('view', 'DataApp') ?? false)
    );
};

export const useCanViewChartStudio = (
    projectUuid: string | undefined,
): boolean => {
    const can = useCanInProject(projectUuid);
    const chartTypesEnabled = useChartTypesEnabled();
    // The gallery list endpoint is gated on `manage Explore`, not on data app access.
    return chartTypesEnabled.enabled && can('manage', 'Explore');
};

export const useCanOpenSemanticStudio = (
    projectUuid: string | undefined,
): boolean => {
    const { user } = useApp();
    const ability = user.data?.ability;
    const organizationUuid = user.data?.organizationUuid;
    return (
        projectUuid !== undefined &&
        ability !== undefined &&
        organizationUuid !== undefined &&
        canOpenSemanticStudio(ability, organizationUuid, projectUuid)
    );
};
