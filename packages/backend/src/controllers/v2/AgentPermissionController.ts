import {
    AGENT_CAPABILITY_LIMIT_DEFAULTS,
    assertRegisteredAccount,
    OrganizationMemberRole,
    type AgentCapabilityCeiling,
    type AgentPolicyOverviewResponse,
    type AgentPolicyResponse,
    type AgentSystemRoleMatrix,
    type ApiErrorPayload,
    type ResetPolicyRequest,
} from '@lightdash/common';
import {
    Body,
    Get,
    Middlewares,
    OperationId,
    Post,
    Put,
    Request,
    Response,
    Route,
    Tags,
} from '@tsoa/runtime';
import express from 'express';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
} from '../authentication';
import { BaseController } from '../baseController';

const deprecatedAgentSystemRoleMatrix = (): AgentSystemRoleMatrix =>
    Object.fromEntries(
        Object.values(OrganizationMemberRole).map((role) => [
            role,
            [...AGENT_CAPABILITY_LIMIT_DEFAULTS],
        ]),
    ) as AgentSystemRoleMatrix;

@Route('/api/v2/org/agent-permissions')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('v2', 'Organizations')
@Middlewares([allowApiKeyAuthentication, isAuthenticated, unauthorisedInDemo])
export class AgentPermissionController extends BaseController {
    @Get()
    @OperationId('getAgentCapabilityPolicy')
    async getPolicy(
        @Request() req: express.Request,
    ): Promise<AgentPolicyOverviewResponse> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: {
                ...(await this.services
                    .getAgentPermissionService()
                    .getPolicy(req.account)),
                systemRoleMatrix: deprecatedAgentSystemRoleMatrix(),
                defaults: deprecatedAgentSystemRoleMatrix(),
            },
        };
    }

    @Put()
    @OperationId('saveAgentCapabilityCeiling')
    async saveCeiling(
        @Request() req: express.Request,
        @Body() body: AgentCapabilityCeiling,
    ): Promise<AgentPolicyResponse> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: {
                ...(await this.services
                    .getAgentPermissionService()
                    .saveCeiling(req.account, body)),
                systemRoleMatrix: deprecatedAgentSystemRoleMatrix(),
            },
        };
    }

    @Post('/reset')
    @OperationId('resetAgentCapabilityPolicy')
    async resetToLegacy(
        @Request() req: express.Request,
        @Body() body?: ResetPolicyRequest,
    ): Promise<AgentPolicyResponse> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: {
                ...(await this.services
                    .getAgentPermissionService()
                    .resetToLegacy(req.account, body?.version)),
                systemRoleMatrix: deprecatedAgentSystemRoleMatrix(),
            },
        };
    }
}
