import {
    assertRegisteredAccount,
    type AgentConnectionApprovalDecision,
    type AgentConnectionApprovalDecisionResponse,
    type AgentConnectionApprovalErrorResponse,
    type AgentConnectionApprovalRequest,
    type AgentConnectionApprovalResponse,
    type AgentConnectionApprovalReviewResponse,
    type ApiErrorPayload,
    type UUID,
} from '@lightdash/common';
import {
    Body,
    Delete,
    Get,
    Middlewares,
    Path,
    Post,
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
import { AgentConnectionApprovalRequestError } from '../../models/AgentConnectionApprovalRequestModel';
import { serializeAgentConnectionApprovalError } from '../../services/AgentConnectionApprovalService/AgentConnectionApprovalError';
import { allowApiKeyAuthentication, isAuthenticated } from '../authentication';
import {
    authenticateAgentConnectionApproval,
    authenticateApprovalReview,
} from '../authentication/agentConnectionApproval';
import { BaseController } from '../baseController';

@Route('/api/v2/user/agent-connections')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('v2', 'Agent connections')
export class AgentConnectionController extends BaseController {
    @Post('requests')
    @Middlewares([authenticateAgentConnectionApproval])
    @Response<AgentConnectionApprovalErrorResponse>(
        'default',
        'Approval request error',
    )
    @SuccessResponse('200', 'Success')
    async requestApproval(
        @Request() req: express.Request,
        @Body() body: AgentConnectionApprovalRequest,
    ): Promise<
        AgentConnectionApprovalResponse | AgentConnectionApprovalErrorResponse
    > {
        this.setHeader('Cache-Control', 'no-store');
        try {
            return {
                status: 'ok',
                results: await this.services
                    .getAgentConnectionApprovalService()
                    .request(req.account, body),
            };
        } catch (error) {
            const payload = serializeAgentConnectionApprovalError(error);
            this.setStatus(payload.error.statusCode);
            if (
                error instanceof AgentConnectionApprovalRequestError &&
                error.retryAfterSeconds !== null
            )
                this.setHeader('Retry-After', String(error.retryAfterSeconds));
            return payload;
        }
    }

    @Get('requests/{requestUuid}')
    @Middlewares([authenticateApprovalReview])
    @Response<AgentConnectionApprovalErrorResponse>(
        'default',
        'Approval request error',
    )
    @SuccessResponse('200', 'Success')
    async reviewApproval(
        @Request() req: express.Request,
        @Path() requestUuid: UUID,
    ): Promise<
        | AgentConnectionApprovalReviewResponse
        | AgentConnectionApprovalErrorResponse
    > {
        this.setHeader('Cache-Control', 'no-store');
        try {
            return {
                status: 'ok',
                results: await this.services
                    .getAgentConnectionApprovalService()
                    .review(req.account, requestUuid, req.sessionID),
            };
        } catch (error) {
            const payload = serializeAgentConnectionApprovalError(error);
            this.setStatus(payload.error.statusCode);
            return payload;
        }
    }

    @Post('requests/{requestUuid}/decision')
    @Middlewares([authenticateApprovalReview])
    @Response<AgentConnectionApprovalErrorResponse>(
        'default',
        'Approval request error',
    )
    @SuccessResponse('200', 'Success')
    async decideApproval(
        @Request() req: express.Request,
        @Path() requestUuid: UUID,
        @Body() body: AgentConnectionApprovalDecision,
    ): Promise<
        | AgentConnectionApprovalDecisionResponse
        | AgentConnectionApprovalErrorResponse
    > {
        this.setHeader('Cache-Control', 'no-store');
        try {
            return {
                status: 'ok',
                results: await this.services
                    .getAgentConnectionApprovalService()
                    .decide(req.account, requestUuid, req.sessionID, body),
            };
        } catch (error) {
            const payload = serializeAgentConnectionApprovalError(error);
            this.setStatus(payload.error.statusCode);
            return payload;
        }
    }

    @Get('requests/{requestUuid}/completion')
    @Middlewares([authenticateApprovalReview])
    @Response<AgentConnectionApprovalErrorResponse>(
        'default',
        'Approval request error',
    )
    @SuccessResponse('302', 'Return to client')
    async completeApproval(
        @Request() req: express.Request,
        @Path() requestUuid: UUID,
    ): Promise<void | AgentConnectionApprovalErrorResponse> {
        this.setHeader('Cache-Control', 'no-store');
        try {
            const location = await this.services
                .getAgentConnectionApprovalService()
                .complete(req.account, requestUuid, req.sessionID);
            this.setHeader('Location', location);
            this.setStatus(302);
        } catch (error) {
            const payload = serializeAgentConnectionApprovalError(error);
            this.setStatus(payload.error.statusCode);
            return payload;
        }
    }

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
