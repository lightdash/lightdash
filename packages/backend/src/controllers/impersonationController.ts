import {
    ApiErrorPayload,
    ApiStartImpersonationRequest,
    ApiStartImpersonationResponse,
    ApiStopImpersonationResponse,
    ForbiddenError,
} from '@lightdash/common';
import {
    Body,
    Middlewares,
    OperationId,
    Post,
    Request,
    Response,
    Route,
    Tags,
} from '@tsoa/runtime';
import express from 'express';
import { isAuthenticated } from './authentication';
import { BaseController } from './baseController';

@Route('/api/v1/impersonation')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Impersonation')
export class ImpersonationController extends BaseController {
    /**
     * Start impersonating a user
     * @summary Start impersonation
     * @param req express request
     * @param body
     */
    @Middlewares([isAuthenticated])
    @Post('/start')
    @OperationId('StartImpersonation')
    async startImpersonation(
        @Request() req: express.Request,
        @Body() body: ApiStartImpersonationRequest,
    ): Promise<ApiStartImpersonationResponse> {
        if (!req.account || req.account.authentication.type !== 'session') {
            throw new ForbiddenError(
                'Impersonation requires session authentication',
            );
        }

        if (!req.user) {
            throw new ForbiddenError('User session not found');
        }
        await this.services
            .getUserService()
            .startImpersonation(req.user, body.targetUserUuid, req.session);
        this.setStatus(200);
        return {
            status: 'ok',
            results: null,
        };
    }

    /**
     * Stop impersonating a user
     * @summary Stop impersonation
     * @param req express request
     */
    @Middlewares([isAuthenticated])
    @Post('/stop')
    @OperationId('StopImpersonation')
    async stopImpersonation(
        @Request() req: express.Request,
    ): Promise<ApiStopImpersonationResponse> {
        if (!req.account || req.account.authentication.type !== 'session') {
            throw new ForbiddenError(
                'Impersonation requires session authentication',
            );
        }

        await this.services.getUserService().stopImpersonation(req.session);
        this.setStatus(200);
        return {
            status: 'ok',
            results: null,
        };
    }
}
