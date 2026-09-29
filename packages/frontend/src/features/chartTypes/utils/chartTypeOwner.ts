/**
 * Who owns a chart type: a project, or the organization library (usable in
 * every project of the organization). It decides which API routes serve it.
 */
export type ChartTypeOwner = 'project' | 'organization';

export const ORGANIZATION_CHART_TYPES_API_BASE = '/ee/org/chart-types';
