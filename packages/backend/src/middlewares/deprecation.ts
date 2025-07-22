import { getDeprecatedRouteMiddleware } from '../controllers/authentication';

export const deprecatedDownloadCsvRoute = getDeprecatedRouteMiddleware(
    new Date('2025-07-14'),
    `Please use 'POST /api/v2/projects/{projectUuid}/query/{queryUuid}/download' instead.`,
);
