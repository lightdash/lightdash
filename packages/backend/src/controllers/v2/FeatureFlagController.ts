import { ApiErrorPayload, FeatureFlag } from '@lightdash/common';
import {
    Get,
    OperationId,
    Path,
    Request,
    Response,
    Route,
    SuccessResponse,
    Tags,
} from '@tsoa/runtime';
import express from 'express';
import { BaseController } from '../baseController';

@Route('/api/v2/feature-flag')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('v2', 'Feature Flag')
export class FeatureFlagController extends BaseController {
    /**
     * Get feature flag
     */
    @SuccessResponse('200', 'Success')
    @Get('/{featureFlagId}')
    @OperationId('Get feature flag')
    async getFeatureFlag(
        @Request() req: express.Request,
        @Path() featureFlagId: string,
    ): Promise<{
        status: 'ok';
        results: FeatureFlag;
    }> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services.getFeatureFlagService().get({
                user: req.user,
                featureFlagId,
            }),
        };
    }
}
