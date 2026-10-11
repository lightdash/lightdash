import {
    assertRegisteredAccount,
    type ApiErrorPayload,
    type UUID,
} from '@lightdash/common';
import {
    Delete,
    Get,
    Middlewares,
    Path,
    Request,
    Response,
    Route,
    SuccessResponse,
    Tags,
} from '@tsoa/runtime';
import express from 'express';
import {
    type AgentConnectionRecord,
    type AgentConnectionStatus,
} from '../../auth/agentConnectionGrants/AgentConnectionService';
import { allowApiKeyAuthentication, isAuthenticated } from '../authentication';
import { BaseController } from '../baseController';

@Route('/api/v2/user/agent-connections')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('v2', 'Agent connections')
export class AgentConnectionController extends BaseController {
    /**
     * Lists the signed-in person's agent connections and stored approvals.
     * @summary List agent connections
     */
    @Get()
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    async list(
        @Request() req: express.Request,
    ): Promise<{ status: 'ok'; results: AgentConnectionRecord[] }> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.services
                .getAgentConnectionService()
                .list(req.account),
        };
    }

    /**
     * Reads stored approval and current project and action restrictions.
     * An allowed action has current person permission, organisation agent policy
     * approval, and support from an agent connection in that project.
     * A request can still be refused by a narrower rule: private-space access,
     * a protected branch, a second required action (uploads need Deploy and upload),
     * or scheduled pre-aggregate refreshes in the project.
     * @summary Get connection status
     */
    @Get('{grantUuid}/status')
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    async getConnectionStatus(
        @Request() req: express.Request,
        @Path() grantUuid: UUID,
    ): Promise<{ status: 'ok'; results: AgentConnectionStatus }> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.services
                .getAgentConnectionService()
                .status(req.account, grantUuid),
        };
    }

    /**
     * Revokes the whole connection and returns its stored state.
     * @summary Revoke agent connection
     */
    @Delete('{grantUuid}')
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    async revoke(
        @Request() req: express.Request,
        @Path() grantUuid: UUID,
    ): Promise<{ status: 'ok'; results: AgentConnectionRecord }> {
        assertRegisteredAccount(req.account);
        const service = this.services.getAgentConnectionService();
        await service.revoke({
            grantUuid,
            organizationUuid: req.account.organization.organizationUuid!,
            actor: req.account,
            reason: 'owner_revoked',
        });
        return {
            status: 'ok',
            results: await service.get(req.account, grantUuid),
        };
    }
}
