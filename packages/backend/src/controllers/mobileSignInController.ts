import {
    ApiErrorPayload,
    ApiMobileSignInCodeResponse,
    ApiMobileSignInCodeStateResponse,
    ApiMobileSignInDecisionResponse,
    assertRegisteredAccount,
    ForbiddenError,
    isMobileSignInMintReason,
    MobileSignInRefusal,
    ParameterError,
} from '@lightdash/common';
import {
    Body,
    Delete,
    Get,
    Middlewares,
    OperationId,
    Path,
    Post,
    Request,
    Response,
    Route,
    SuccessResponse,
    Tags,
} from '@tsoa/runtime';
import express from 'express';
import { toSessionUser } from '../auth/account';
import { lightdashConfig } from '../config/lightdashConfig';
import { isAuthenticated } from './authentication';
import { hasApprovalBrowserSession } from './authentication/agentConnectionApproval';
import { BaseController } from './baseController';

type MintMobileSignInCodeRequest = {
    reason: 'show' | 'auto_refresh';
};

type DecideMobileSignInCodeRequest = {
    nonce: string;
};

const requireBrowserSession = (
    req: express.Request,
    { stateChanging }: { stateChanging: boolean },
): string => {
    if (!hasApprovalBrowserSession(req)) {
        throw new ForbiddenError('Use the web app to manage sign-in codes', {
            reason: MobileSignInRefusal.FEATURE_DISABLED,
        });
    }
    if (
        stateChanging &&
        req.get('origin') !== new URL(lightdashConfig.siteUrl).origin
    ) {
        throw new ForbiddenError('Use the web app to manage sign-in codes', {
            reason: MobileSignInRefusal.APPROVAL_SESSION_MISMATCH,
        });
    }
    return req.sessionID;
};

const requireNonce = (body: DecideMobileSignInCodeRequest): string => {
    if (typeof body?.nonce !== 'string' || body.nonce.length === 0) {
        throw new ForbiddenError(
            'Confirm the code from the page that shows it',
            {
                reason: MobileSignInRefusal.APPROVAL_SESSION_MISMATCH,
            },
        );
    }
    return body.nonce;
};

@Route('/api/v1/user/mobile/sign-in-codes')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('My Account')
export class MobileSignInController extends BaseController {
    /**
     * Creates a one-time code that signs the mobile app in as the current
     * user. Replaces the earlier code of this browser session
     * @summary Create mobile sign-in code
     */
    @Middlewares([isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/')
    @OperationId('CreateMobileSignInCode')
    async mint(
        @Request() req: express.Request,
        @Body() body: MintMobileSignInCodeRequest,
    ): Promise<ApiMobileSignInCodeResponse> {
        assertRegisteredAccount(req.account);
        const sessionId = requireBrowserSession(req, { stateChanging: true });
        if (!isMobileSignInMintReason(body?.reason)) {
            throw new ParameterError('reason must be show or auto_refresh');
        }
        this.setHeader('Cache-Control', 'no-store');
        return {
            status: 'ok',
            results: await this.services
                .getMobileSignInService()
                .mint(toSessionUser(req.account), sessionId, body.reason),
        };
    }

    /**
     * Gets the state of a mobile sign-in code created by this browser session
     * @summary Get mobile sign-in code
     */
    @Middlewares([isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/{codeUuid}')
    @OperationId('GetMobileSignInCode')
    async getState(
        @Request() req: express.Request,
        @Path() codeUuid: string,
    ): Promise<ApiMobileSignInCodeStateResponse> {
        assertRegisteredAccount(req.account);
        const sessionId = requireBrowserSession(req, { stateChanging: false });
        this.setHeader('Cache-Control', 'no-store');
        return {
            status: 'ok',
            results: await this.services
                .getMobileSignInService()
                .getState(toSessionUser(req.account), sessionId, codeUuid),
        };
    }

    /**
     * Confirms that the phone that claimed this code may sign in
     * @summary Approve mobile sign-in code
     */
    @Middlewares([isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/{codeUuid}/approve')
    @OperationId('ApproveMobileSignInCode')
    async approve(
        @Request() req: express.Request,
        @Path() codeUuid: string,
        @Body() body: DecideMobileSignInCodeRequest,
    ): Promise<ApiMobileSignInDecisionResponse> {
        return this.decide(req, codeUuid, body, 'approved');
    }

    /**
     * Refuses the phone that claimed this code
     * @summary Decline mobile sign-in code
     */
    @Middlewares([isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/{codeUuid}/decline')
    @OperationId('DeclineMobileSignInCode')
    async decline(
        @Request() req: express.Request,
        @Path() codeUuid: string,
        @Body() body: DecideMobileSignInCodeRequest,
    ): Promise<ApiMobileSignInDecisionResponse> {
        return this.decide(req, codeUuid, body, 'declined');
    }

    /**
     * Deletes an unused mobile sign-in code created by this browser session
     * @summary Cancel mobile sign-in code
     */
    @Middlewares([isAuthenticated])
    @SuccessResponse('204', 'Deleted')
    @Delete('/{codeUuid}')
    @OperationId('CancelMobileSignInCode')
    async cancel(
        @Request() req: express.Request,
        @Path() codeUuid: string,
    ): Promise<void> {
        assertRegisteredAccount(req.account);
        const sessionId = requireBrowserSession(req, { stateChanging: true });
        await this.services
            .getMobileSignInService()
            .cancel(toSessionUser(req.account), sessionId, codeUuid);
        this.setStatus(204);
    }

    private async decide(
        req: express.Request,
        codeUuid: string,
        body: DecideMobileSignInCodeRequest,
        decision: 'approved' | 'declined',
    ): Promise<ApiMobileSignInDecisionResponse> {
        assertRegisteredAccount(req.account);
        const sessionId = requireBrowserSession(req, { stateChanging: true });
        this.setHeader('Cache-Control', 'no-store');
        return {
            status: 'ok',
            results: await this.services
                .getMobileSignInService()
                .decide(
                    toSessionUser(req.account),
                    sessionId,
                    codeUuid,
                    requireNonce(body),
                    decision,
                    { ip: req.ip, userAgent: req.get('user-agent') },
                ),
        };
    }
}
