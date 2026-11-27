import {
    assertRegisteredAccount,
    type AgentCapabilityCeiling,
    type AgentPolicyOverviewResponse,
    type AgentPolicyResponse,
    type AgentProjectCapabilityPolicySave,
    type AgentProjectPoliciesResponse,
    type AgentProjectPolicyResponse,
    type ApiErrorPayload,
    type ApiSuccessEmpty,
    type ResetPolicyRequest,
} from '@lightdash/common';
import {
    Body,
    Delete,
    Get,
    Middlewares,
    OperationId,
    Path,
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
            results: await this.services
                .getAgentPermissionService()
                .getPolicy(req.account),
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
            results: await this.services
                .getAgentPermissionService()
                .saveCeiling(req.account, body),
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
            results: await this.services
                .getAgentPermissionService()
                .resetToLegacy(req.account, body?.version),
        };
    }

    /**
     * List the projects that have their own agent restrictions
     * @summary List project agent restrictions
     */
    @Get('/projects')
    @OperationId('getProjectAgentCapabilityPolicies')
    async getProjectPolicies(
        @Request() req: express.Request,
    ): Promise<AgentProjectPoliciesResponse> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.services
                .getAgentPermissionService()
                .getProjectPolicies(req.account),
        };
    }

    /**
     * Give a project its own agent restrictions, replacing the organization's for that project
     * @summary Save project agent restrictions
     */
    @Put('/projects/{projectUuid}')
    @OperationId('saveProjectAgentCapabilityPolicy')
    async saveProjectPolicy(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Body() body: AgentProjectCapabilityPolicySave,
    ): Promise<AgentProjectPolicyResponse> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.services
                .getAgentPermissionService()
                .saveProjectPolicy(req.account, projectUuid, body),
        };
    }

    /**
     * Remove a project's own agent restrictions so it follows the organization again
     * @summary Remove project agent restrictions
     */
    @Delete('/projects/{projectUuid}')
    @OperationId('deleteProjectAgentCapabilityPolicy')
    async deleteProjectPolicy(
        @Request() req: express.Request,
        @Path() projectUuid: string,
    ): Promise<ApiSuccessEmpty> {
        assertRegisteredAccount(req.account);
        await this.services
            .getAgentPermissionService()
            .deleteProjectPolicy(req.account, projectUuid);
        return { status: 'ok', results: undefined };
    }
}
