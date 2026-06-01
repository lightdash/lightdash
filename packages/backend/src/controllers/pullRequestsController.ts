import {
    ApiErrorPayload,
    ApiPullRequestsResponse,
    assertRegisteredAccount,
    KnexPaginateArgs,
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
}
