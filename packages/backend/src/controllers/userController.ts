import { ApiEmailStatusResponse, ApiErrorPayload } from '@lightdash/common';
import { Controller, Query } from '@tsoa/runtime';
import express from 'express';
import {
    Get,
    Middlewares,
    OperationId,
    Put,
    Request,
    Response,
    Route,
} from 'tsoa';
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

    /**
     * Get the verification status for the current user's primary email
     * @param req express request
     * @param pascode the one-time passcode sent to the user's primary email
     */
    @Middlewares([isAuthenticated, unauthorisedInDemo])
    @Get('/me/email/status')
    @OperationId('getEmailVerificationStatus')
    async getEmailVerificationStatus(
        @Request() req: express.Request,
        @Query() passcode?: string,
    ): Promise<ApiEmailStatusResponse> {
        // Throws 404 error if not found
        const status = await userService.getPrimaryEmailStatus(
            req.user!,
            passcode,
        );
        this.setStatus(200);
        return {
            status: 'ok',
            results: status,
        };
    }
}
