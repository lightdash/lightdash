import {
    assertRegisteredAccount,
    type ApiErrorPayload,
    type ApiRoadmapResponse,
} from '@lightdash/common';
import {
    Get,
    Hidden,
    Middlewares,
    OperationId,
    Query,
    Request,
    Response,
    Route,
    SuccessResponse,
} from '@tsoa/runtime';
import express from 'express';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
} from '../../controllers/authentication';
import { BaseController } from '../../controllers/baseController';
import type { RoadmapService } from '../services/RoadmapService/RoadmapService';

@Route('/api/v1/org/roadmap')
// These endpoints are under development and susceptible to breaking changes.
// Keep them hidden until the feature is GA.
@Hidden()
@Response<ApiErrorPayload>('default', 'Error')
export class OrgRoadmapController extends BaseController {
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/')
    @OperationId('getOrgRoadmap')
    async getOrgRoadmap(
        @Request() req: express.Request,
        @Query() page?: number,
        @Query() pageSize?: number,
    ): Promise<ApiRoadmapResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);

        return {
            status: 'ok',
            results: await this.services
                .getRoadmapService<RoadmapService>()
                .getRoadmap(req.account, {
                    page,
                    pageSize,
                }),
        };
    }
}
