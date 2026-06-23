import { ApiErrorPayload, ApiRoadmapResponse, UUID } from '@lightdash/common';
import {
    Get,
    Hidden,
    Middlewares,
    OperationId,
    Path,
    Request,
    Response,
    Route,
    SuccessResponse,
} from '@tsoa/runtime';
import express from 'express';
import { BaseController } from '../../controllers/baseController';
import type { RoadmapService } from '../services/RoadmapService/RoadmapService';
import { isRoadmapServiceAuthenticated } from './authentication/roadmapServiceAuthentication';

@Route('/api/v1/roadmap')
@Hidden()
@Response<ApiErrorPayload>('default', 'Error')
export class RoadmapController extends BaseController {
    /**
     * Get the curated, read-only roadmap for an organization. Served from the
     * cached mirror; authenticated with the calling instance's license key.
     * @summary Get organization roadmap
     */
    @Middlewares([isRoadmapServiceAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/organizations/{organizationUuid}')
    @OperationId('getOrganizationRoadmap')
    async getOrganizationRoadmap(
        @Request() req: express.Request,
        @Path() organizationUuid: UUID,
    ): Promise<ApiRoadmapResponse> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getRoadmapService<RoadmapService>()
                .getRoadmapForOrg({ organizationUuid }),
        };
    }
}
