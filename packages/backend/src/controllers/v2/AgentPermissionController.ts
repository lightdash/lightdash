import {
    assertRegisteredAccount,
    type AgentAccessPreviewRequest,
    type AgentCapabilityPolicy,
    type AgentWarehouseRestrictionConfirmation,
    type ApiAgentAccessPreviewResponse,
    type ApiErrorPayload,
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
    Put,
    Request,
    Response,
    Route,
    Tags,
} from '@tsoa/runtime';
import express from 'express';
import {
    type AgentCapabilityCeiling,
    type AgentCapabilityPolicyOverview,
} from '../../services/AgentPermissionService/AgentPermissionService';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
} from '../authentication';
import { BaseController } from '../baseController';

interface AgentPolicyResponse {
    status: 'ok';
    results: AgentCapabilityPolicy;
}
interface AgentPolicyOverviewResponse extends Omit<
    AgentPolicyResponse,
    'results'
> {
    results: AgentCapabilityPolicyOverview;
}
interface WarehouseConfirmationResponse {
    status: 'ok';
    results: AgentWarehouseRestrictionConfirmation;
}
interface WarehouseConfirmationStatusResponse extends Omit<
    WarehouseConfirmationResponse,
    'results'
> {
    results: {
        confirmation: AgentWarehouseRestrictionConfirmation | null;
        confirmed: boolean;
    };
}
interface DeleteConfirmationResponse extends Omit<
    WarehouseConfirmationResponse,
    'results'
> {
    results: undefined;
}
interface ResetPolicyRequest {
    version?: number;
}

@Route('/api/v2/org/agent-permissions')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('v2', 'Organizations')
@Middlewares([allowApiKeyAuthentication, isAuthenticated, unauthorisedInDemo])
export class AgentPermissionController extends BaseController {
    @Post('/explain')
    @OperationId('explainAgentPermissions')
    async explain(
        @Request() req: express.Request,
        @Body() body: AgentAccessPreviewRequest,
    ): Promise<ApiAgentAccessPreviewResponse> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.services
                .getAgentPermissionService()
                .previewAgentAccess(req.account, body),
        };
    }

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

    @Get('/projects/{projectUuid}/warehouse-confirmation')
    @OperationId('getAgentWarehouseRestrictionConfirmation')
    async getWarehouseConfirmation(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
    ): Promise<WarehouseConfirmationStatusResponse> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.services
                .getAgentPermissionService()
                .getWarehouseConfirmation(req.account, projectUuid),
        };
    }

    @Put('/projects/{projectUuid}/warehouse-confirmation')
    @OperationId('confirmAgentWarehouseRestrictions')
    async confirmWarehouse(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
    ): Promise<WarehouseConfirmationResponse> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.services
                .getAgentPermissionService()
                .confirmWarehouse(req.account, projectUuid),
        };
    }

    @Delete('/projects/{projectUuid}/warehouse-confirmation')
    @OperationId('deleteAgentWarehouseRestrictionConfirmation')
    async deleteWarehouseConfirmation(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
    ): Promise<DeleteConfirmationResponse> {
        assertRegisteredAccount(req.account);
        await this.services
            .getAgentPermissionService()
            .deleteWarehouseConfirmation(req.account, projectUuid);
        return { status: 'ok', results: undefined };
    }
}
