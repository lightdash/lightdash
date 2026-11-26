import {
    assertRegisteredAccount,
    type ApiErrorPayload,
    type ApiSecurityContactsResponse,
    type UpdateSecurityContactsRequest,
} from '@lightdash/common';
import {
    Body,
    Get,
    Hidden,
    Middlewares,
    OperationId,
    Put,
    Request,
    Response,
    Route,
    SuccessResponse,
} from '@tsoa/runtime';
import express from 'express';
import { isAuthenticated } from '../../controllers/authentication';
import { BaseController } from '../../controllers/baseController';
import type { SecurityContactsService } from '../services/SecurityContactsService/SecurityContactsService';

@Route('/api/v1/org/security-contacts')
// Under development and susceptible to breaking changes.
@Hidden()
@Response<ApiErrorPayload>('default', 'Error')
export class OrgSecurityContactsController extends BaseController {
    @Middlewares([isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/')
    @OperationId('getOrgSecurityContacts')
    async getContacts(
        @Request() req: express.Request,
    ): Promise<ApiSecurityContactsResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        this.setHeader('Cache-Control', 'no-store');
        return {
            status: 'ok',
            results: await this.services
                .getSecurityContactsService<SecurityContactsService>()
                .getContacts(req.account),
        };
    }

    @Middlewares([isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Put('/')
    @OperationId('updateOrgSecurityContacts')
    async updateContacts(
        @Request() req: express.Request,
        @Body() body: UpdateSecurityContactsRequest,
    ): Promise<ApiSecurityContactsResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        this.setHeader('Cache-Control', 'no-store');
        return {
            status: 'ok',
            results: await this.services
                .getSecurityContactsService<SecurityContactsService>()
                .updateContacts(req.account, body),
        };
    }
}
