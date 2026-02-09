import {
    ApiErrorPayload,
    ApiStartImpersonationRequest,
    ApiStartImpersonationResponse,
    ApiStopImpersonationResponse,
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
        await this.services
            .getUserService()
            .startImpersonation(req.user!, body.targetUserUuid, {
                isSessionAuth: req.account?.authentication.type === 'session',
                getImpersonation: () => req.session.impersonation,
                setImpersonation: (data) => {
                    req.session.impersonation = data;
                },
            });
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
        await this.services.getUserService().stopImpersonation({
            getImpersonation: () => req.session.impersonation,
            clearImpersonation: () => {
                delete req.session.impersonation;
            },
        });
        this.setStatus(200);
        return {
            status: 'ok',
            results: null,
        };
    }
}
