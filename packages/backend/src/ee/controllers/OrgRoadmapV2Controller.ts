import {
    assertRegisteredAccount,
    type ApiErrorPayload,
    type ApiRoadmapProjectRequestsResponse,
    type ApiRoadmapProjectResponse,
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

@Route('/api/v2/org/roadmap')
@Hidden()
@Response<ApiErrorPayload>('default', 'Error')
export class OrgRoadmapV2Controller extends BaseController {
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/projects')
    @OperationId('getOrgRoadmapProjects')
    async getProjects(
        @Request() req: express.Request,
        @Query() page?: number,
        @Query() pageSize?: number,
        @Query() search?: string,
        @Query() onlyInterested?: boolean,
    ): Promise<ApiRoadmapProjectResponse> {
        assertRegisteredAccount(req.account);
        this.setHeader('Cache-Control', 'no-store');
        return {
            status: 'ok',
            results: await this.services
                .getRoadmapService<RoadmapService>()
                .getProjects(req.account, {
                    ...req.query,
                    page,
                    pageSize,
                    search,
                    onlyInterested,
                }),
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/requests')
    @OperationId('getOrgRoadmapProjectRequests')
    async getRequests(
        @Request() req: express.Request,
        @Query() groupId: string,
        @Query() page?: number,
        @Query() pageSize?: number,
        @Query() search?: string,
    ): Promise<ApiRoadmapProjectRequestsResponse> {
        assertRegisteredAccount(req.account);
        this.setHeader('Cache-Control', 'no-store');
        return {
            status: 'ok',
            results: await this.services
                .getRoadmapService<RoadmapService>()
                .getProjectRequests(req.account, {
                    ...req.query,
                    groupId,
                    page,
                    pageSize,
                    search,
                }),
        };
    }
}
