import {
    ApiErrorPayload,
    ApiOrganizationAgentIdentityOverviewResponse,
    ApiOrganizationAgentIdentityRuleResponse,
    OrganizationAgentIdentitySettings,
    UpdateOrganizationAgentIdentityRule,
    WarehouseTypes,
} from '@lightdash/common';
import {
    Body,
    Get,
    Middlewares,
    OperationId,
    Path,
    Put,
    Request,
    Response,
    Route,
    SuccessResponse,
    Tags,
} from '@tsoa/runtime';
import express from 'express';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
} from '../authentication';
import { BaseController } from '../baseController';

@Route('/api/v2/org/agent-identity')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('v2', 'Organizations')
@Middlewares([allowApiKeyAuthentication, isAuthenticated, unauthorisedInDemo])
export class OrganizationAgentIdentityController extends BaseController {
    @Get()
    @OperationId('getOrganizationAgentIdentitySettings')
    @SuccessResponse('200', 'Success')
    async getSettings(
        @Request() req: express.Request,
    ): Promise<ApiOrganizationAgentIdentityOverviewResponse> {
        return {
            status: 'ok',
            results: await this.services
                .getAiAccessService()
                .getOrganizationSettings(req.account!),
        };
    }

    @Put()
    @OperationId('updateOrganizationAgentIdentitySettings')
    @SuccessResponse('200', 'Success')
    async updateSettings(
        @Request() req: express.Request,
        @Body() settings: OrganizationAgentIdentitySettings,
    ): Promise<ApiOrganizationAgentIdentityOverviewResponse> {
        return {
            status: 'ok',
            results: await this.services
                .getAiAccessService()
                .updateOrganizationSettings(req.account!, settings),
        };
    }

    @Put('/{warehouseType}')
    @OperationId('updateOrganizationAgentIdentityRule')
    @SuccessResponse('200', 'Success')
    async updateRule(
        @Request() req: express.Request,
        @Path() warehouseType: WarehouseTypes,
        @Body() rule: UpdateOrganizationAgentIdentityRule,
    ): Promise<ApiOrganizationAgentIdentityRuleResponse> {
        return {
            status: 'ok',
            results: await this.services
                .getAiAccessService()
                .updateOrganizationRule(req.account!, warehouseType, rule),
        };
    }
}
