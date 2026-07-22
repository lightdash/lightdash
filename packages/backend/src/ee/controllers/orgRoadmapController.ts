import {
    ApiErrorPayload,
    ApiRoadmapResponse,
    assertRegisteredAccount,
} from '@lightdash/common';
import {
    Get,
    Hidden,
    Middlewares,
    OperationId,
    Request,
    Response,
    Route,
    SuccessResponse,
} from '@tsoa/runtime';
import express from 'express';
import { toSessionUser } from '../../auth/account';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
} from '../../controllers/authentication';
import { BaseController } from '../../controllers/baseController';
import type { RoadmapProxyService } from '../services/RoadmapProxyService/RoadmapProxyService';

@Route('/api/v1/org/roadmap')
@Hidden()
@Response<ApiErrorPayload>('default', 'Error')
export class OrgRoadmapController extends BaseController {
    /**
     * Get the curated, read-only roadmap for the authenticated user's
     * organization. Proxied server-side from the central roadmap service;
     * gated by the Roadmap feature flag.
     * @summary Get the organization's roadmap
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/')
    @OperationId('getOrgRoadmap')
    async getOrgRoadmap(
        @Request() req: express.Request,
    ): Promise<ApiRoadmapResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getRoadmapProxyService<RoadmapProxyService>()
                .getRoadmapForUser(toSessionUser(req.account)),
        };
    }
}
