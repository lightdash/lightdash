import { ApiErrorPayload } from '@lightdash/common';
import { Body, Post } from '@tsoa/runtime';
import express from 'express';
import {
    Controller,
    Middlewares,
    OperationId,
    Path,
    Request,
    Response,
    Route,
    SuccessResponse,
    Tags,
} from 'tsoa';
import { analytics } from '../analytics/client';
import { dbtCloudGraphqlClient } from '../clients/clients';
import { allowApiKeyAuthentication, isAuthenticated } from './authentication';

@Route('/api/v1/projects/{projectUuid}/metricflow')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('MetricFlow')
export class MetricFlowController extends Controller {
    /**
     * Get MetricFlow data
     * @param projectUuid the projectId
     * @param req express request
     * @param body graphql query
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/')
    @OperationId('GetMetricFlowData')
    async post(
        @Path() projectUuid: string,
        @Request() req: express.Request,
        @Body() body: { query: string },
    ): Promise<any> {
        this.setStatus(200);

        // TODO: soon available via UI
        const bearerToken = process.env.DBT_CLOUD_BEARER_TOKEN || undefined;
        const environmentId = process.env.DBT_CLOUD_ENVIRONMENT_ID || undefined;

        if (!bearerToken || !environmentId) {
            throw new Error('Dbt Cloud is not enabled');
        }

        // TODO: soon to be moved to a service
        if (body.query.includes('createQuery(')) {
            analytics.track({
                event: 'metricflow_query.created',
                userId: req.user!.userUuid,
                properties: {
                    organizationId: req.user!.organizationUuid!,
                    projectId: projectUuid,
                },
            });
        }

        return {
            status: 'ok',
            results: await dbtCloudGraphqlClient.runQuery(
                bearerToken,
                environmentId,
                body.query,
            ),
        };
    }
}
