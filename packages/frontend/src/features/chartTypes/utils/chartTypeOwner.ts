import {
    assertUnreachable,
    type DataAppViz,
    type OrganizationDataAppViz,
} from '@lightdash/common';

/**
 * Who owns a chart type: a project, or the organization library (usable in
 * every project of the organization). It decides which API routes serve it.
 */
export type ChartTypeOwner = 'project' | 'organization';

export const ORGANIZATION_CHART_TYPES_API_BASE = '/ee/org/chart-types';

/** The API base serving an app's routes; project apps need their project. */
export const appApiBase = (
    owner: ChartTypeOwner,
    projectUuid: string | undefined,
): string => {
    switch (owner) {
        case 'organization':
            return ORGANIZATION_CHART_TYPES_API_BASE;
        case 'project':
            return `/ee/projects/${projectUuid}/apps`;
        default:
            return assertUnreachable(owner, `Unknown chart type owner`);
    }
};

/** Organization chart types are the same from every project, so their
 *  cache is not keyed by one. */
export const appQueryKey = (
    owner: ChartTypeOwner,
    projectUuid: string | undefined,
    appUuidOrSlug: string | undefined,
) => {
    switch (owner) {
        case 'organization':
            return ['organization-chart-type', appUuidOrSlug];
        case 'project':
            return ['app', projectUuid, appUuidOrSlug];
        default:
            return assertUnreachable(owner, `Unknown chart type owner`);
    }
};

/** An organization chart type's schema, keyed under its app key so
 *  invalidating the app refreshes it too. */
export const organizationChartTypeSchemaKey = (
    dataAppVizUuid: string | null,
) => ['organization-chart-type', dataAppVizUuid, 'schema'];

/** Every cached schema of a chart type, whatever the version. */
export const vizSchemaQueryKey = (
    owner: ChartTypeOwner,
    projectUuid: string | undefined,
    appUuid: string,
) => {
    switch (owner) {
        case 'organization':
            return organizationChartTypeSchemaKey(appUuid);
        case 'project':
            return ['data-app-viz', projectUuid, appUuid];
        default:
            return assertUnreachable(owner, `Unknown chart type owner`);
    }
};

export const appPreviewTokenQueryKey = (
    owner: ChartTypeOwner,
    projectUuid: string | undefined,
    appUuid: string | undefined,
    version: number | undefined,
) => {
    switch (owner) {
        case 'organization':
            return ['organization-chart-type-preview-token', appUuid, version];
        case 'project':
            return ['app-preview-token', projectUuid, appUuid, version];
        default:
            return assertUnreachable(owner, `Unknown chart type owner`);
    }
};

/**
 * Where a build is sent. An organization build previews with real data only
 * when an explore or saved chart of `dataProjectUuid` is picked; null means
 * sample data.
 */
export type ChartTypeBuildTarget =
    | { owner: Extract<ChartTypeOwner, 'project'> }
    | {
          owner: Extract<ChartTypeOwner, 'organization'>;
          dataProjectUuid: string | null;
      };

export const PROJECT_BUILD_TARGET: ChartTypeBuildTarget = { owner: 'project' };

export const isOrganizationDataAppViz = (
    viz: DataAppViz | OrganizationDataAppViz,
): viz is OrganizationDataAppViz => viz.projectUuid === null;

export const getChartTypeOwner = (
    viz: DataAppViz | OrganizationDataAppViz,
): ChartTypeOwner =>
    isOrganizationDataAppViz(viz) ? 'organization' : 'project';
