import {
    assertRegisteredAccount,
    type ApiErrorPayload,
    type ApiMobileSetupCodeMintRequest,
    type ApiMobileSetupCodeMintResponse,
    type ApiMobileSetupCodeRevokeResponse,
    type ApiMobileSetupCodeStatusResponse,
    type UUID,
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
import { isAuthenticated } from './authentication';
import { BaseController } from './baseController';

@Route('/api/v1/user/me/mobile-setup-codes')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('My Account')
@Middlewares([isAuthenticated])
export class MobileSetupController extends BaseController {
    @Post('/')
    @SuccessResponse('201', 'Created')
    @OperationId('MintMobileSetupCode')
    async mint(
        @Request() req: express.Request,
        @Body() body: ApiMobileSetupCodeMintRequest,
    ): Promise<ApiMobileSetupCodeMintResponse> {
        assertRegisteredAccount(req.account);
        const results = await this.services
            .getMobileSetupService()
            .mint(req.account, body.projectUuid);
        this.setStatus(201);
        this.setHeader('Cache-Control', 'no-store');
        return { status: 'ok', results };
    }

    @Get('/{codeId}')
    @OperationId('GetMobileSetupCodeStatus')
    async getCodeStatus(
        @Request() req: express.Request,
        @Path() codeId: UUID,
    ): Promise<ApiMobileSetupCodeStatusResponse> {
        assertRegisteredAccount(req.account);
        this.setHeader('Cache-Control', 'no-store');
        return {
            status: 'ok',
            results: await this.services
                .getMobileSetupService()
                .getStatus(req.account, codeId),
        };
    }

    @Delete('/{codeId}')
    @OperationId('RevokeMobileSetupCode')
    async revoke(
        @Request() req: express.Request,
        @Path() codeId: UUID,
    ): Promise<ApiMobileSetupCodeRevokeResponse> {
        assertRegisteredAccount(req.account);
        await this.services.getMobileSetupService().revoke(req.account, codeId);
        return { status: 'ok', results: undefined };
    }
}
