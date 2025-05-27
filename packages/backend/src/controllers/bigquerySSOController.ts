import {
    ApiBigqueryDatasets,
    ApiErrorPayload,
    ApiSuccessEmpty,
} from '@lightdash/common';
import {
    Get,
    Middlewares,
    OperationId,
    Query,
    Request,
    Response,
    Route,
    SuccessResponse,
    Tags,
} from '@tsoa/runtime';
import express from 'express';
import { allowApiKeyAuthentication, isAuthenticated } from './authentication';
import { BaseController } from './baseController';

@Route('/api/v1/bigquery/sso')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Projects')
export class BigquerySSOController extends BaseController {
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/datasets')
    @OperationId('GetBigQueryDatasets')
    async getBigQueryDatabases(
        @Query() projectId: string,
        @Request() req: express.Request,
    ): Promise<ApiBigqueryDatasets> {
        this.setStatus(200);
        const databases = await this.services
            .getProjectService()
            .getBigqueryDatasets(req.user!, projectId);

        return {
            status: 'ok',
            results: databases,
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/is-authenticated')
    @OperationId('getAccessToken')
    async get(@Request() req: express.Request): Promise<ApiSuccessEmpty> {
        this.setStatus(200);
        // This will throw an error if the user is not authenticated with bigquery scopes
        const accessToken = await this.services
            .getUserService()
            .getAccessToken(req.user!, 'bigquery');
        return {
            status: 'ok',
            results: undefined,
        };
    }
}
