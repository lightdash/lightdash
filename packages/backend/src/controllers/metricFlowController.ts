import { ApiErrorPayload } from '@lightdash/common';
import {
    Body,
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
import { LightdashAnalytics } from '../analytics/LightdashAnalytics';
import { lightdashConfig } from '../config/lightdashConfig';
import { allowApiKeyAuthentication, isAuthenticated } from './authentication';
import { BaseController } from './baseController';

@Route('/api/v1/projects/{projectUuid}/dbtsemanticlayer')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('DbtSemanticLayer')
export class MetricFlowController extends BaseController {
    /**
     * Get DbtSemanticLayer data
     * @param projectUuid the projectId
     * @param req express request
     * @param body graphql query
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/')
    @OperationId('GetDbtSemanticLayerData')
    async post(
        @Path() projectUuid: string,
        @Request() req: express.Request,
        @Body()
        body: {
            query: string;
            operationName?: 'GetFields' | 'CreateQuery' | 'GetQueryResults';
        },
    ): Promise<any> {
        this.setStatus(200);

        // TODO: soon to be moved to a service
        if (body.operationName === 'GetQueryResults') {
            // TODO: to be removed once this is refactored. https://github.com/lightdash/lightdash/issues/9099
            const analytics = new LightdashAnalytics({
                lightdashConfig,
                writeKey: lightdashConfig.rudder.writeKey || 'notrack',
                dataPlaneUrl: lightdashConfig.rudder.dataPlaneUrl
                    ? `${lightdashConfig.rudder.dataPlaneUrl}/v1/batch`
                    : 'notrack',
                options: {
                    enable:
                        lightdashConfig.rudder.writeKey &&
                        lightdashConfig.rudder.dataPlaneUrl,
                },
            });
            analytics.track({
                event: 'metricflow_query.executed',
                userId: req.user!.userUuid,
                properties: {
                    organizationId: req.user!.organizationUuid!,
                    projectId: projectUuid,
                },
            });
        }

        return {
            status: 'ok',
            results: await req.clients
                .getDbtCloudGraphqlClient()
                .runGraphQlQuery(body.query),
        };
    }
}
