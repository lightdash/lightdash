import {
    AdditionalMetric,
    ApiCustomDimensionWriteBackPreview,
    ApiErrorPayload,
    assertRegisteredAccount,
    CustomDimension,
    PullRequestCreated,
    UUID,
} from '@lightdash/common';
import {
    Body,
    Get,
    Hidden,
    Middlewares,
    OperationId,
    Path,
    Post,
    Query,
    Request,
    Response,
    Route,
    SuccessResponse,
    Tags,
} from '@tsoa/runtime';
import express from 'express';
import { toSessionUser } from '../auth/account';
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
    /**
     * Create a pull request for custom metrics
     * @summary Create PR for custom metrics
     */
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
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getGitIntegrationService()
                .createPullRequest(
                    toSessionUser(req.account),
                    projectUuid,
                    body.quoteChar || '"',
                    {
                        type: 'customMetrics',
                        fields: body.customMetrics,
                    },
                ),
        };
    }

    /**
     * Preview custom dimensions using the project's dbt model and warehouse dialect
     * @summary Preview custom dimension YAML
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Post('/pull-requests/custom-dimensions/preview')
    @OperationId('PreviewPullRequestForCustomDimensions')
    async PreviewPullRequestForCustomDimensions(
        @Path() projectUuid: UUID,
        @Body()
        body: {
            customDimensions: CustomDimension[];
            quoteChar?: `"` | `'`;
        },
        @Request() req: express.Request,
    ): Promise<ApiCustomDimensionWriteBackPreview> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getGitIntegrationService()
                .previewCustomDimensions(
                    req.account,
                    projectUuid,
                    body.customDimensions,
                    body.quoteChar || '"',
                ),
        };
    }

    /**
     * Create a pull request for custom dimensions
     * @summary Create PR for custom dimensions
     */
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
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getGitIntegrationService()
                .createPullRequest(
                    toSessionUser(req.account),
                    projectUuid,
                    body.quoteChar || '"',
                    {
                        type: 'customDimensions',
                        fields: body.customDimensions,
                    },
                ),
        };
    }

    /**
     * List git branches for the project repository
     * @summary List git branches
     */
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
        assertRegisteredAccount(req.account);
        this.setStatus(200);

        return {
            status: 'ok',
            results: await this.services
                .getGitIntegrationService()
                .getBranches(toSessionUser(req.account), projectUuid),
        };
    }
}
