import {
    ApiAiAccessForUserResponse,
    ApiAiMarkerTestResponse,
    ApiAiWarehouseCapabilitiesResponse,
    ApiErrorPayload,
    UUID,
} from '@lightdash/common';
import {
    Get,
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
import { allowApiKeyAuthentication, isAuthenticated } from '../authentication';
import { BaseController } from '../baseController';

@Route('/api/v2/projects/{projectUuid}/ai-access')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('v2', 'Projects')
export class AiAccessController extends BaseController {
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/capabilities')
    @OperationId('getCapabilitiesAiAccess')
    async getCapabilities(
        @Path() projectUuid: UUID,
        @Request() req: express.Request,
        @Query() connection?: UUID,
    ): Promise<ApiAiWarehouseCapabilitiesResponse> {
        const service = this.services.getAiAccessService();
        return {
            status: 'ok',
            results: await service.getCapabilities(
                req.account!,
                projectUuid,
                connection ?? null,
            ),
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/me')
    @OperationId('getMyAccessAiAccess')
    async getMyAccess(
        @Path() projectUuid: UUID,
        @Request() req: express.Request,
        @Query() connection?: UUID,
    ): Promise<ApiAiAccessForUserResponse> {
        const service = this.services.getAiAccessService();
        return {
            status: 'ok',
            results: await service.getMyAccess(
                req.account!,
                projectUuid,
                connection ?? null,
            ),
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/marker/test')
    @OperationId('testMarkerAiAccess')
    async testMarker(
        @Path() projectUuid: UUID,
        @Request() req: express.Request,
        @Query() connection?: UUID,
    ): Promise<ApiAiMarkerTestResponse> {
        return {
            status: 'ok',
            results: await this.services
                .getAiAccessService()
                .testMarker(
                    req.account!,
                    projectUuid,
                    connection ?? null,
                    (sql) =>
                        this.services
                            .getProjectService()
                            .runAgentMarkerProbe(
                                req.account!,
                                projectUuid,
                                connection ?? null,
                                sql,
                            ),
                ),
        };
    }
}
