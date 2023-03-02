import { ApiEmailStatusResponse, ApiErrorPayload } from '@lightdash/common';
import { Controller } from '@tsoa/runtime';
import express from 'express';
import { Middlewares, OperationId, Put, Request, Response, Route } from 'tsoa';
import { userService } from '../services/services';
import { isAuthenticated, unauthorisedInDemo } from './authentication';

@Route('/api/v1/user')
@Response<ApiErrorPayload>('default', 'Error')
export class UserController extends Controller {
    /**
     * Create a new one-time passcode for the current user's primary email
     * @param req express request
     */
    @Middlewares([isAuthenticated, unauthorisedInDemo])
    @Put('/me/email/otp')
    @OperationId('createEmailOneTimePasscode')
    async createEmailOneTimePasscode(
        @Request() req: express.Request,
    ): Promise<ApiEmailStatusResponse> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await userService.sendOneTimePasscodeToPrimaryEmail(
                req.user!,
            ),
        };
    }
}
