import {
    assertRegisteredAccount,
    type ApiAiOrganizationRuntimeSettingsResponse,
    type ApiErrorPayload,
    type ApiOrganizationMcpAccessResponse,
    type UpdateOrganizationMcpAccess,
} from '@lightdash/common';
import {
    Body,
    Get,
    Middlewares,
    OperationId,
    Patch,
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
    unauthorisedInDemo,
} from '../../controllers/authentication';
import { BaseController } from '../../controllers/baseController';
import { type AiOrganizationSettingsService } from '../services/AiOrganizationSettingsService';

@Route('/api/v1/aiAgents')
@Response<ApiErrorPayload>('default', 'Error')
export class AiOrganizationSettingsController extends BaseController {
    /**
     * Allows an organization administrator to control inbound MCP access.
     * @summary Update MCP access
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Updated organization MCP access')
    @Patch('/settings/mcp-access')
    @OperationId('updateOrganizationMcpAccess')
    async updateMcpAccess(
        @Request() req: express.Request,
        @Body() body: UpdateOrganizationMcpAccess,
    ): Promise<ApiOrganizationMcpAccessResponse> {
        assertRegisteredAccount(req.account);
        const results =
            await this.getAiOrganizationSettingsService().updateMcpEnabled(
                req.account,
                body.mcpEnabled,
            );
        return { status: 'ok', results };
    }

    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        requireOAuthScopeOperation(
            'AiOrganizationSettingsController.getRuntimeSettings',
        ),
    ])
    @SuccessResponse('200', 'Retrieved AI organization runtime settings')
    @Get('/settings')
    @OperationId('getAiOrganizationRuntimeSettings')
    async getRuntimeSettings(
        @Request() req: express.Request,
    ): Promise<ApiAiOrganizationRuntimeSettingsResponse> {
        assertRegisteredAccount(req.account);
        const results =
            await this.getAiOrganizationSettingsService().getRuntimeSettings(
                toSessionUser(req.account),
            );
        this.setStatus(200);
        return { status: 'ok', results };
    }

    protected getAiOrganizationSettingsService() {
        return this.services.getAiOrganizationSettingsService<AiOrganizationSettingsService>();
    }
}
