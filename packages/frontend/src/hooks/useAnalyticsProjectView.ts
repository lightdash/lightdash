import { type AnalyticsProjectView, type Project } from '@lightdash/common';
import { useEffect, useRef } from 'react';
import { useLocation, useMatch } from 'react-router';
import { useLightdashApi } from '../providers/LightdashApi/useLightdashApi';

export const useAnalyticsProjectView = (
    properties: (AnalyticsProjectView & { organizationId: string }) | null,
) => {
    const lightdashApi = useLightdashApi();
    const { pathname } = useLocation();
    const aiRoute = useMatch('/projects/:projectUuid/ai-agents/*');
    // Redirects to a default agent and opening threads stay in the same AI visit.
    const lastView = useRef<{
        organizationId: string;
        pathname: string;
    } | null>(null);
    const viewPath = aiRoute
        ? `/projects/${properties?.projectUuid ?? aiRoute.params.projectUuid}/ai-agents`
        : pathname;

    useEffect(() => {
        if (lastView.current?.pathname !== viewPath) {
            lastView.current = null;
        }
        if (!properties) return;
        const { organizationId, ...view } = properties;

        // Polls and filters are not new page visits.
        if (lastView.current?.organizationId === organizationId) return;
        lastView.current = { organizationId, pathname: viewPath };

        try {
            void lightdashApi<undefined>({
                url: '/org/analytics-project/view',
                method: 'POST',
                body: JSON.stringify(view),
            }).catch(() => {
                // Tracking must not interrupt opening analytics.
            });
        } catch {
            // Tracking must not interrupt opening analytics.
        }
    }, [properties, viewPath, lightdashApi]);
};

export const useAnalyticsProjectRouteView = (
    project:
        | Pick<
              Project,
              'organizationUuid' | 'projectUuid' | 'provisioningSource'
          >
        | undefined,
) => {
    const homepage = useMatch('/projects/:projectUuid/home');
    useAnalyticsProjectView(
        project?.provisioningSource === 'analytics'
            ? {
                  organizationId: project.organizationUuid,
                  projectUuid: project.projectUuid,
                  source: homepage ? 'homepage' : 'project',
              }
            : null,
    );
};
