import {
    assertRegisteredAccount,
    type ApiErrorPayload,
    type ApiRoadmapProjectResponse,
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
        @Query() projectId?: string,
        @Query() search?: string,
        @Query() statuses?: string,
        @Query() priorities?: string,
    ): Promise<ApiRoadmapResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        this.setHeader('Cache-Control', 'no-store');

        return {
            status: 'ok',
            results: await this.services
                .getRoadmapService<RoadmapService>()
                .getRoadmap(req.account, {
                    ...req.query,
                    page,
                    pageSize,
                    projectId,
                    search,
                    statuses,
                    priorities,
                }),
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/projects')
    @OperationId('getOrgRoadmapProjects')
    async getProjects(
        @Request() req: express.Request,
        @Query() page?: number,
        @Query() pageSize?: number,
        @Query() search?: string,
        @Query() statuses?: string,
        @Query() priorities?: string,
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
                    statuses,
                    priorities,
                    onlyInterested,
                }),
        };
    }
}
