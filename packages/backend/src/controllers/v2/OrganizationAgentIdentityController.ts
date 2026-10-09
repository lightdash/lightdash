import {
    ApiErrorPayload,
    ApiOrganizationAgentIdentityOverviewResponse,
    ApiOrganizationAgentIdentityRuleResponse,
    ApiOrganizationAgentIdentitySnowflakeSetupResponse,
    ApiOrganizationAgentIdentitySnowflakeVerifyResponse,
    ApiUpdateOrganizationSnowflakeAgentClientResponse,
    assertRegisteredAccount,
    OrganizationAgentIdentitySettings,
    UpdateOrganizationAgentIdentityRule,
    UpdateOrganizationSnowflakeAgentClient,
    WarehouseTypes,
} from '@lightdash/common';
import {
    Body,
    Get,
    Middlewares,
    OperationId,
    Path,
    Post,
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

    @Get('/snowflake/setup')
    @OperationId('getOrganizationAgentIdentitySnowflakeSetup')
    @SuccessResponse('200', 'Success')
    async getSnowflakeSetup(
        @Request() req: express.Request,
    ): Promise<ApiOrganizationAgentIdentitySnowflakeSetupResponse> {
        return {
            status: 'ok',
            results: await this.services
                .getAiAccessService()
                .getSnowflakeSetup(req.account!),
        };
    }

    /**
     * Saves the organization's Snowflake agent OAuth client.
     * @summary Save Snowflake client
     */
    @Put('/snowflake/client')
    @OperationId('updateOrganizationSnowflakeAgentClient')
    @SuccessResponse('200', 'Success')
    async saveSnowflakeAgentClient(
        @Request() req: express.Request,
        @Body() body: UpdateOrganizationSnowflakeAgentClient,
    ): Promise<ApiUpdateOrganizationSnowflakeAgentClientResponse> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.services
                .getAiAccessService()
                .saveSnowflakeAgentClient(req.account, body),
        };
    }

    @Post('/snowflake/verify')
    @OperationId('verifyOrganizationAgentIdentitySnowflakeSetup')
    @SuccessResponse('200', 'Success')
    async verifySnowflakeSetup(
        @Request() req: express.Request,
    ): Promise<ApiOrganizationAgentIdentitySnowflakeVerifyResponse> {
        return {
            status: 'ok',
            results: await this.services
                .getAiAccessService()
                .verifySnowflakeSetup(req.account!),
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
