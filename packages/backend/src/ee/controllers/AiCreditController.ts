import {
    assertRegisteredAccount,
    type AiCreditUsageBreakdown,
    type ApiAiCreditDailyUsageResponse,
    type ApiAiCreditUsageResponse,
    type ApiErrorPayload,
} from '@lightdash/common';
import {
    Get,
    Middlewares,
    OperationId,
    Query,
    Request,
    Response,
    Route,
    SuccessResponse,
} from '@tsoa/runtime';
import express from 'express';
import { toSessionUser } from '../../auth/account';
import { requireOAuthScopeOperation } from '../../auth/oauthScopes/unchecked';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
} from '../../controllers/authentication';
import { BaseController } from '../../controllers/baseController';
import { type AiCreditService } from '../services/AiCreditService';

@Route('/api/v1/org/ai-credits')
@Response<ApiErrorPayload>('default', 'Error')
export class AiCreditController extends BaseController {
    /**
     * The organization's AI usage for the current period, in tokens and credits,
     * with its allowance when one is agreed. Organization admins only.
     * @summary Get AI credit usage
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        requireOAuthScopeOperation('AiCreditController.getUsage'),
    ])
    @SuccessResponse('200', 'Retrieved AI credit usage')
    @Get('/usage')
    @OperationId('getOrganizationAiCreditUsage')
    async getUsage(
        @Request() req: express.Request,
    ): Promise<ApiAiCreditUsageResponse> {
        assertRegisteredAccount(req.account);
        const results = await this.services
            .getAiCreditService<AiCreditService>()
            .getOrganizationUsage(toSessionUser(req.account));
        this.setStatus(200);
        return { status: 'ok', results };
    }

    /**
     * Billable AI credits per day of the current period, split by feature,
     * channel, user, project or agent. Organization admins only.
     * @summary Get daily AI credit usage
     * @param breakdown what to split each day's credits by
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        requireOAuthScopeOperation('AiCreditController.getDailyUsage'),
    ])
    @SuccessResponse('200', 'Retrieved daily AI credit usage')
    @Get('/usage/daily')
    @OperationId('getOrganizationAiCreditDailyUsage')
    async getDailyUsage(
        @Request() req: express.Request,
        @Query() breakdown: AiCreditUsageBreakdown,
    ): Promise<ApiAiCreditDailyUsageResponse> {
        assertRegisteredAccount(req.account);
        const results = await this.services
            .getAiCreditService<AiCreditService>()
            .getOrganizationDailyUsage(toSessionUser(req.account), breakdown);
        this.setStatus(200);
        return { status: 'ok', results };
    }
}
