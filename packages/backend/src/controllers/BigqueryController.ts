import {
    ApiBigqueryDatasets,
    ApiErrorPayload,
    assertRegisteredAccount,
} from '@lightdash/common';
import {
    Body,
    Middlewares,
    OperationId,
    Post,
    Request,
    Response,
    Route,
    SuccessResponse,
    Tags,
} from '@tsoa/runtime';
import express from 'express';
import { toSessionUser } from '../auth/account';
import { requireOAuthScopeOperation } from '../auth/oauthScopes/unchecked';
import { allowApiKeyAuthentication, isAuthenticated } from './authentication';
import { BaseController } from './baseController';

@Route('/api/v1/bigquery')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Projects')
export class BigqueryController extends BaseController {
    /**
     * List the datasets a service account key can see, before a project exists
     * @summary List BigQuery datasets for a key file
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        requireOAuthScopeOperation(
            'BigqueryController.getBigQueryDatasetsFromKeyfile',
        ),
    ])
    @SuccessResponse('200', 'Success')
    @Post('/datasets')
    @OperationId('GetBigQueryDatasetsFromKeyfile')
    async getBigQueryDatasetsFromKeyfile(
        @Body() body: { keyfileContents: Record<string, unknown> },
        @Request() req: express.Request,
    ): Promise<ApiBigqueryDatasets> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        const results = await this.services
            .getProjectService()
            .getBigqueryDatasetsFromKeyfile(
                toSessionUser(req.account),
                body.keyfileContents,
            );
        return { status: 'ok', results };
    }
}
