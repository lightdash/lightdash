import {
    assertRegisteredAccount,
    type ApiBillingPortalLinkResponse,
    type ApiErrorPayload,
} from '@lightdash/common';
import {
    Hidden,
    Middlewares,
    OperationId,
    Post,
    Request,
    Response,
    Route,
    SuccessResponse,
} from '@tsoa/runtime';
import express from 'express';
import { isAuthenticated } from '../../controllers/authentication';
import { BaseController } from '../../controllers/baseController';
import type { BillingService } from '../services/BillingService/BillingService';

@Route('/api/v1/org/billing')
// Under development and susceptible to breaking changes.
@Hidden()
@Response<ApiErrorPayload>('default', 'Error')
export class OrgBillingController extends BaseController {
    // Session only: the portal is interactive, so tokens have no use for it.
    @Middlewares([isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/portal-link')
    @OperationId('createOrgBillingPortalLink')
    async createPortalLink(
        @Request() req: express.Request,
    ): Promise<ApiBillingPortalLinkResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        this.setHeader('Cache-Control', 'no-store');
        return {
            status: 'ok',
            results: await this.services
                .getBillingService<BillingService>()
                .createPortalLink(req.account),
        };
    }
}
