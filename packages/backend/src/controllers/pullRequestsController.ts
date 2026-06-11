import {
    ApiErrorPayload,
    ApiPullRequestPreviewResponse,
    ApiPullRequestsResponse,
    assertRegisteredAccount,
    KnexPaginateArgs,
    ParameterError,
} from '@lightdash/common';
import {
    Get,
    Middlewares,
    OperationId,
    Path,
    Query,
    Request,
    Response,
    Route,
    SuccessResponse,
    Tags,
} from '@tsoa/runtime';
import express from 'express';
import { z } from 'zod';
import { toSessionUser } from '../auth/account';
import { allowApiKeyAuthentication, isAuthenticated } from './authentication';
import { BaseController } from './baseController';

@Route('/api/v1/projects/{projectUuid}/pull-requests')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Pull Requests')
export class PullRequestsController extends BaseController {
    /**
     * List the pull requests that have been created by write-backs for a project
     * @summary List pull requests
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/')
    @OperationId('listPullRequests')
    async listPullRequests(
        @Path() projectUuid: string,
        @Request() req: express.Request,
        @Query() page?: number,
        @Query() pageSize?: number,
    ): Promise<ApiPullRequestsResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);

        let paginateArgs: KnexPaginateArgs | undefined;
        if (page && pageSize) {
            paginateArgs = { page, pageSize };
        }

        return {
            status: 'ok',
            results: await this.services
                .getPullRequestsService()
                .getPullRequests(
                    toSessionUser(req.account),
                    projectUuid,
                    paginateArgs,
                ),
        };
    }

    /**
     * Resolve the Lightdash preview environment URL for a write-back pull
     * request. Returns `{ previewUrl: null }` until the preview is published,
     * so the client can poll.
     * @summary Get pull request preview
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/preview')
    @OperationId('getPullRequestPreview')
    async getPullRequestPreview(
        @Path() projectUuid: string,
        @Query() prUrl: string,
        @Request() req: express.Request,
    ): Promise<ApiPullRequestPreviewResponse> {
        assertRegisteredAccount(req.account);

        const parsedPrUrl = z.string().url().safeParse(prUrl);
        if (!parsedPrUrl.success) {
            throw new ParameterError('prUrl must be a valid URL');
        }

        this.setStatus(200);

        return {
            status: 'ok',
            results: await this.services
                .getPullRequestsService()
                .getPullRequestPreview(
                    toSessionUser(req.account),
                    projectUuid,
                    parsedPrUrl.data,
                ),
        };
    }
}
