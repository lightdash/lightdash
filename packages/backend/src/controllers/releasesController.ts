import type {
    ApiErrorPayload,
    ApiReleasesTimelineResponse,
} from '@lightdash/common';
import {
    Example,
    Get,
    OperationId,
    Query,
    Response,
    Route,
    SuccessResponse,
    Tags,
} from '@tsoa/runtime';
import { BaseController } from './baseController';

/**
 * Example response for the releases timeline endpoint
 */
const RELEASES_TIMELINE_EXAMPLE: ApiReleasesTimelineResponse = {
    status: 'ok',
    results: {
        currentVersion: '0.1234.0',
        currentVersionFound: true,
        releases: [
            {
                version: '0.1235.0',
                title: '0.1235.0',
                publishedAt: '2025-12-02T10:00:00Z',
                url: 'https://github.com/lightdash/lightdash/releases/tag/0.1235.0',
                items: [
                    {
                        type: 'feat',
                        scope: 'dashboard',
                        description: 'add dark mode support',
                        prNumber: 18575,
                        prUrl: 'https://github.com/lightdash/lightdash/pull/18575',
                    },
                ],
                isCurrent: false,
            },
            {
                version: '0.1234.0',
                title: '0.1234.0',
                publishedAt: '2025-12-01T10:00:00Z',
                url: 'https://github.com/lightdash/lightdash/releases/tag/0.1234.0',
                items: [
                    {
                        type: 'fix',
                        scope: null,
                        description: 'fix chart rendering issue',
                        prNumber: 18570,
                        prUrl: 'https://github.com/lightdash/lightdash/pull/18570',
                    },
                ],
                isCurrent: true,
            },
        ],
        hasPrevious: false,
        hasNext: true,
        previousCursor: '0.1235.0',
        nextCursor: '0.1234.0',
    },
};

/**
 * Controller for releases information.
 * This endpoint is unauthenticated and intended for hosting teams
 * and customer support to verify deployment versions.
 */
@Route('/api/v1/releases')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Releases')
export class ReleasesController extends BaseController {
    /**
     * Get the releases timeline showing releases around the current deployed version.
     * This is an unauthenticated endpoint for checking which features/fixes are
     * included in a deployment.
     *
     * ## Pagination
     * - First request (no cursor) returns releases centered around current deployed version
     * - Use `nextCursor` + `direction=before` to get older releases
     * - Use `previousCursor` + `direction=after` to get newer releases
     * - `hasPrevious` indicates if newer releases exist (scroll up)
     * - `hasNext` indicates if older releases exist (scroll down)
     *
     * ## Usage Examples
     * - Get releases around current version: `GET /api/v1/releases`
     * - Get next page (older): `GET /api/v1/releases?cursor=0.1234.0&direction=before`
     * - Get previous page (newer): `GET /api/v1/releases?cursor=0.1234.0&direction=after`
     *
     * @summary Get releases timeline
     * @param count Number of releases to return. Defaults to 15.
     * @param cursor Cursor for pagination (release version tag, e.g., "0.1234.0").
     *   When omitted, returns releases centered around the current deployed version.
     * @param direction Direction to paginate from cursor position.
     *   'before' fetches older releases (published before cursor).
     *   'after' fetches newer releases (published after cursor).
     *   Defaults to 'before'.
     */
    @SuccessResponse('200', 'Success')
    @Response<ApiErrorPayload>('400', 'Invalid parameters')
    @Response<ApiErrorPayload>(
        '503',
        'GitHub API unavailable or rate limit exceeded',
    )
    @Example<ApiReleasesTimelineResponse>(RELEASES_TIMELINE_EXAMPLE)
    @Get('/')
    @OperationId('getReleasesTimeline')
    async getReleasesTimeline(
        @Query() count?: number,
        @Query() cursor?: string,
        @Query() direction?: 'before' | 'after',
    ): Promise<ApiReleasesTimelineResponse> {
        // Let the service handle defaults for count and direction
        const timeline = await this.services
            .getHealthService()
            .getReleasesTimeline(count, cursor, direction);

        return {
            status: 'ok',
            results: timeline,
        };
    }
}
