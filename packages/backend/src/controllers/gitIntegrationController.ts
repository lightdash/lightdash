import {
    AdditionalMetric,
    ApiErrorPayload,
    CustomDimension,
    PullRequestCreated,
} from '@lightdash/common';
import {
    Body,
    Get,
    Hidden,
    Middlewares,
    OperationId,
    Path,
    Post,
    Request,
    Response,
    Route,
    SuccessResponse,
    Tags,
} from '@tsoa/runtime';
import express from 'express';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
} from './authentication';
import { BaseController } from './baseController';

@Route('/api/v1/projects/{projectUuid}/git-integration')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Git Integration')
export class GitIntegrationController extends BaseController {
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Post('/pull-requests/custom-metrics')
    @OperationId('CreatePullRequestForCustomMetrics')
    async CreatePullRequestForCustomMetrics(
        @Path() projectUuid: string,
        @Body()
        body: {
            customMetrics: AdditionalMetric[];
            quoteChar?: `"` | `'`; // to be used in the yml dump options
        },
        @Request() req: express.Request,
    ): Promise<{ status: 'ok'; results: PullRequestCreated }> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getGitIntegrationService()
                .createPullRequest(
                    req.user!,
                    projectUuid,
                    body.quoteChar || '"',
                    {
                        type: 'customMetrics',
                        fields: body.customMetrics,
                    },
                ),
        };
    }

    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Post('/pull-requests/custom-dimensions')
    @OperationId('CreatePullRequestForCustomDimensions')
    async CreatePullRequestForCustomDimensions(
        @Path() projectUuid: string,
        @Body()
        body: {
            customDimensions: CustomDimension[];
            quoteChar?: `"` | `'`; // to be used in the yml dump options
        },
        @Request() req: express.Request,
    ): Promise<{ status: 'ok'; results: PullRequestCreated }> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getGitIntegrationService()
                .createPullRequest(
                    req.user!,
                    projectUuid,
                    body.quoteChar || '"',
                    {
                        type: 'customDimensions',
                        fields: body.customDimensions,
                    },
                ),
        };
    }

    @Middlewares([isAuthenticated, unauthorisedInDemo])
    @SuccessResponse('200')
    @Get('/branches')
    @Hidden()
    @OperationId('listBranches')
    async listBranches(
        @Request() req: express.Request,
        @Path() projectUuid: string,
    ): Promise<{
        status: 'ok';
        results: Array<string>;
    }> {
        this.setStatus(200);

        return {
            status: 'ok',
            results: await this.services
                .getGitIntegrationService()
                .getBranches(req.user!, projectUuid),
        };
    }
}
