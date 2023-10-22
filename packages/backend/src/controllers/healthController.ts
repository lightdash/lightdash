import { ApiErrorPayload, ApiHealthState } from '@lightdash/common';
import express from 'express';
import {
    Controller,
    Get,
    Middlewares,
    OperationId,
    Request,
    Response,
    Route,
    Tags,
} from 'tsoa';
import { healthService } from '../services/services';
import { allowApiKeyAuthentication, isAuthenticated } from './authentication';

@Route('/api/v1/health')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('User Groups')
export class HealthController extends Controller {
    /**
     * Get server health status
     * @param req express request
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @Get()
    @OperationId('getHealth')
    async getHealth(@Request() req: express.Request): Promise<ApiHealthState> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await healthService.getHealthState(!!req.user?.userUuid),
        };
    }
}
