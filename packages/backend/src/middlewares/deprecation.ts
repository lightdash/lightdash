import { type RequestHandler } from 'express';
import { getDeprecatedRouteMiddleware } from '../controllers/authentication';

export const deprecatedDownloadCsvRoute: RequestHandler =
    getDeprecatedRouteMiddleware(
        new Date('2025-07-14'),
        `Please use 'POST /api/v2/projects/{projectUuid}/query/{queryUuid}/download' instead.`,
    );
