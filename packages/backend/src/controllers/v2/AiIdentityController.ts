import {
    AiIdentityBulkTestRequest,
    AiIdentityExportRequest,
    AiIdentityFailureReason,
    AiIdentitySort,
    AiIdentityState,
    ApiAiAccessForUserResponse,
    ApiAiIdentityAccountResponse,
    ApiAiIdentityAccountsResponse,
    ApiAiIdentityDetailResponse,
    ApiAiIdentityEventsResponse,
    ApiAiIdentityJobResponse,
    ApiAiIdentityListResponse,
    ApiAiIdentityPreviewResponse,
    ApiAiIdentityProvisioningPlanResponse,
    ApiAiIdentityProvisioningSettingsResponse,
    ApiAiIdentityResponse,
    ApiErrorPayload,
    assertRegisteredAccount,
    CreateAiIdentityProvisioner,
    RunAiIdentityProvisioningRequest,
    UpdateAiIdentity,
    UpdateAiIdentityAccount,
    UpdateAiIdentityAiRoleDefinition,
    UpdateAiIdentityProvisioningSettings,
    UpdateAiIdentityRoleMapping,
    UUID,
} from '@lightdash/common';
import {
    Body,
    Delete,
    Get,
    Middlewares,
    OperationId,
    Patch,
    Path,
    Post,
    Put,
    Query,
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

@Route('/api/v2/org/ai-identities')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('v2', 'AI identities')
export class AiIdentityController extends BaseController {
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Patch('accounts/{aiIdentityAccountUuid}/provisioning')
    @OperationId('updateAiIdentityProvisioningSettings')
    async updateProvisioningSettings(
        @Path() aiIdentityAccountUuid: UUID,
        @Request() req: express.Request,
        @Body() body: UpdateAiIdentityProvisioningSettings,
    ): Promise<ApiAiIdentityProvisioningSettingsResponse> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.services
                .getAiIdentityService()
                .updateProvisioningMode(
                    req.account,
                    aiIdentityAccountUuid,
                    body.mode,
                ),
        };
    }

    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Post('accounts/{aiIdentityAccountUuid}/provisioning/provisioner')
    @OperationId('createAiIdentityProvisioner')
    async createProvisioner(
        @Path() aiIdentityAccountUuid: UUID,
        @Request() req: express.Request,
        @Body() body: CreateAiIdentityProvisioner,
    ): Promise<ApiAiIdentityProvisioningSettingsResponse> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.services
                .getAiIdentityService()
                .createProvisioner(req.account, aiIdentityAccountUuid, body),
        };
    }

    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Delete('accounts/{aiIdentityAccountUuid}/provisioning/provisioner')
    @OperationId('deleteAiIdentityProvisioner')
    async deleteProvisioner(
        @Path() aiIdentityAccountUuid: UUID,
        @Request() req: express.Request,
    ): Promise<ApiAiIdentityProvisioningSettingsResponse> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.services
                .getAiIdentityService()
                .deleteProvisioner(req.account, aiIdentityAccountUuid),
        };
    }

    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Put('accounts/{aiIdentityAccountUuid}/provisioning/ai-roles')
    @OperationId('replaceAiIdentityAiRoles')
    async replaceAiRoles(
        @Path() aiIdentityAccountUuid: UUID,
        @Request() req: express.Request,
        @Body() body: UpdateAiIdentityAiRoleDefinition[],
    ): Promise<ApiAiIdentityProvisioningSettingsResponse> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.services
                .getAiIdentityService()
                .replaceAiRoles(req.account, aiIdentityAccountUuid, body),
        };
    }

    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Post('accounts/{aiIdentityAccountUuid}/provisioning/provisioner/verify')
    @OperationId('verifyAiIdentityProvisioner')
    async verifyProvisioner(
        @Path() aiIdentityAccountUuid: UUID,
        @Request() req: express.Request,
    ): Promise<ApiAiIdentityProvisioningSettingsResponse> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.services
                .getAiIdentityService()
                .verifyProvisioner(req.account, aiIdentityAccountUuid),
        };
    }

    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Post(
        'accounts/{aiIdentityAccountUuid}/provisioning/provisioner/start-waiting',
    )
    @OperationId('startWaitingForAiIdentitySetup')
    async startWaitingForSetup(
        @Path() aiIdentityAccountUuid: UUID,
        @Request() req: express.Request,
    ): Promise<ApiAiIdentityProvisioningSettingsResponse> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.services
                .getAiIdentityService()
                .startWaitingForSetup(req.account, aiIdentityAccountUuid),
        };
    }

    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Post('accounts/{aiIdentityAccountUuid}/provisioning/provisioner/check')
    @OperationId('pollAiIdentitySetupCheck')
    async pollSetupCheck(
        @Path() aiIdentityAccountUuid: UUID,
        @Request() req: express.Request,
    ): Promise<ApiAiIdentityProvisioningSettingsResponse> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.services
                .getAiIdentityService()
                .pollSetupCheck(req.account, aiIdentityAccountUuid),
        };
    }

    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Put('accounts/{aiIdentityAccountUuid}/provisioning/mappings')
    @OperationId('replaceAiIdentityRoleMappings')
    async replaceProvisioningMappings(
        @Path() aiIdentityAccountUuid: UUID,
        @Request() req: express.Request,
        @Body() body: UpdateAiIdentityRoleMapping[],
    ): Promise<ApiAiIdentityProvisioningSettingsResponse> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.services
                .getAiIdentityService()
                .replaceProvisioningMappings(
                    req.account,
                    aiIdentityAccountUuid,
                    body,
                ),
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('accounts/{aiIdentityAccountUuid}/provisioning/plan')
    @OperationId('getAiIdentityProvisioningPlan')
    async getProvisioningPlan(
        @Path() aiIdentityAccountUuid: UUID,
        @Request() req: express.Request,
    ): Promise<ApiAiIdentityProvisioningPlanResponse> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.services
                .getAiIdentityService()
                .getProvisioningPlan(req.account, aiIdentityAccountUuid),
        };
    }

    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Post('accounts/{aiIdentityAccountUuid}/provisioning/run')
    @OperationId('runAiIdentityProvisioning')
    async runProvisioning(
        @Path() aiIdentityAccountUuid: UUID,
        @Request() req: express.Request,
        @Body() body: RunAiIdentityProvisioningRequest,
    ): Promise<ApiAiIdentityJobResponse> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.services
                .getAiIdentityService()
                .runProvisioning(
                    req.account,
                    aiIdentityAccountUuid,
                    body.approveStatements,
                ),
        };
    }
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('accounts')
    @OperationId('getAiIdentityAccounts')
    async getAccounts(
        @Request() req: express.Request,
    ): Promise<ApiAiIdentityAccountsResponse> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.services
                .getAiIdentityService()
                .getAccounts(req.account),
        };
    }

    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Patch('accounts/{aiIdentityAccountUuid}')
    @OperationId('updateAiIdentityAccount')
    async updateAccount(
        @Path() aiIdentityAccountUuid: UUID,
        @Request() req: express.Request,
        @Body() update: UpdateAiIdentityAccount,
    ): Promise<ApiAiIdentityAccountResponse> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.services
                .getAiIdentityService()
                .updateAccount(
                    req.account,
                    aiIdentityAccountUuid,
                    update.twinNameTemplate,
                    update.roleTemplate,
                ),
        };
    }

    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Post('accounts/{aiIdentityAccountUuid}/sync')
    @OperationId('syncAiIdentityAccount')
    async sync(
        @Path() aiIdentityAccountUuid: UUID,
        @Request() req: express.Request,
    ): Promise<ApiAiIdentityJobResponse> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.services
                .getAiIdentityService()
                .sync(req.account, aiIdentityAccountUuid),
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('')
    @OperationId('listAiIdentities')
    async list(
        @Request() req: express.Request,
        @Query() aiIdentityAccountUuid: UUID,
        @Query() state?: AiIdentityState[],
        @Query() reason?: AiIdentityFailureReason[],
        @Query() projectUuid?: UUID,
        @Query() search?: string,
        @Query() staleOnly?: boolean,
        @Query() sort?: AiIdentitySort,
        @Query() order?: 'asc' | 'desc',
        @Query() page?: number,
        @Query() pageSize?: number,
    ): Promise<ApiAiIdentityListResponse> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.services.getAiIdentityService().list(
                req.account,
                {
                    aiIdentityAccountUuid,
                    states: state ?? [],
                    reasons: reason ?? [],
                    projectUuid: projectUuid ?? null,
                    search: search ?? null,
                    staleOnly: staleOnly ?? false,
                },
                sort ?? AiIdentitySort.SEVERITY,
                order ?? 'asc',
                Math.max(1, page ?? 1),
                Math.min(100, Math.max(1, pageSize ?? 50)),
            ),
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('request-log')
    @OperationId('getAiIdentityRequestLog')
    async getRequestLog(
        @Request() req: express.Request,
        @Query() page?: number,
        @Query() pageSize?: number,
        @Query() includeReads?: boolean,
        @Query() exclusionAccountUuid?: string,
    ): Promise<ApiAiIdentityEventsResponse> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.services
                .getAiIdentityService()
                .getRequestLog(
                    req.account,
                    Math.max(1, page ?? 1),
                    Math.min(100, Math.max(1, pageSize ?? 50)),
                    includeReads ?? false,
                    exclusionAccountUuid ?? null,
                ),
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('accounts/{aiIdentityAccountUuid}/preview')
    @OperationId('getAiIdentityPreview')
    async getPreview(
        @Path() aiIdentityAccountUuid: UUID,
        @Request() req: express.Request,
    ): Promise<ApiAiIdentityPreviewResponse> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.services
                .getAiIdentityService()
                .getPreview(req.account, aiIdentityAccountUuid),
        };
    }

    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Post('bulk-test')
    @OperationId('bulkTestAiIdentities')
    async bulkTest(
        @Request() req: express.Request,
        @Body() body: AiIdentityBulkTestRequest,
    ): Promise<ApiAiIdentityJobResponse> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.services
                .getAiIdentityService()
                .bulkTest(req.account, body),
        };
    }

    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Post('export')
    @OperationId('exportAiIdentities')
    async export(
        @Request() req: express.Request,
        @Body() body: AiIdentityExportRequest,
    ): Promise<ApiAiIdentityJobResponse> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.services
                .getAiIdentityService()
                .export(req.account, body),
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('jobs/{jobUuid}')
    @OperationId('getAiIdentityJob')
    async getJob(
        @Path() jobUuid: UUID,
        @Request() req: express.Request,
    ): Promise<ApiAiIdentityJobResponse> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.services
                .getAiIdentityService()
                .getJob(req.account, jobUuid),
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('{aiIdentityUuid}')
    @OperationId('getAiIdentityDetail')
    async getDetail(
        @Path() aiIdentityUuid: UUID,
        @Request() req: express.Request,
        @Query() includeReads?: boolean,
    ): Promise<ApiAiIdentityDetailResponse> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.services
                .getAiIdentityService()
                .getDetail(req.account, aiIdentityUuid, includeReads ?? false),
        };
    }

    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Patch('{aiIdentityUuid}')
    @OperationId('updateAiIdentity')
    async updateIdentity(
        @Path() aiIdentityUuid: UUID,
        @Request() req: express.Request,
        @Body() body: UpdateAiIdentity,
    ): Promise<ApiAiIdentityResponse> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.services
                .getAiIdentityService()
                .updateIdentity(
                    req.account,
                    aiIdentityUuid,
                    body.twinNameOverride,
                ),
        };
    }

    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Post('{aiIdentityUuid}/test')
    @OperationId('testAiIdentity')
    async testIdentity(
        @Path() aiIdentityUuid: UUID,
        @Request() req: express.Request,
    ): Promise<ApiAiIdentityResponse> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.services
                .getAiIdentityService()
                .testIdentity(req.account, aiIdentityUuid),
        };
    }

    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Post('{aiIdentityUuid}/regenerate-key')
    @OperationId('regenerateAiIdentityKey')
    async regenerateKey(
        @Path() aiIdentityUuid: UUID,
        @Request() req: express.Request,
    ): Promise<ApiAiIdentityResponse> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.services
                .getAiIdentityService()
                .regenerateKey(req.account, aiIdentityUuid),
        };
    }
}

@Route('/api/v2/user/me/ai-access')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('v2', 'AI identities')
export class AiAccessController extends BaseController {
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('')
    @OperationId('getAiAccessForUser')
    async getAiAccessForUser(
        @Request() req: express.Request,
        @Query() projectUuid: UUID,
    ): Promise<ApiAiAccessForUserResponse> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.services
                .getAiIdentityService()
                .getAiAccessForUser({ account: req.account, projectUuid }),
        };
    }
}

@Route('/api/v2/user/me/ai-identities')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('v2', 'AI identities')
export class MyAiIdentitiesController extends BaseController {
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('')
    @OperationId('getMyAiIdentities')
    async getMyAiIdentities(@Request() req: express.Request): Promise<{
        status: 'ok';
        results: Array<{
            aiIdentityAccountUuid: string;
            accountLabel: string;
            aiIdentityName: string | null;
            state: AiIdentityState;
            lastCheckedAt: Date | null;
            action: 'sign_in' | 'ask_admin' | null;
            message: string | null;
        }>;
    }> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.services
                .getAiIdentityService()
                .getMyAiIdentities(req.account),
        };
    }
}
