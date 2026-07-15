import {
    ApiConnectionDiagnosticResponse,
    ApiErrorPayload,
    ApiGrantScriptResponse,
    ApiOnboardingConnectCodeResponse,
    ApiOnboardingConnectionDepositResponse,
    ApiOnboardingConnectionKeyFingerprintResponse,
    ApiOnboardingConnectionValidationResponse,
    ApiOnboardingDashboardResponse,
    ApiOnboardingProfileResponse,
    ApiOnboardingProjectStateResponse,
    ApiOnboardingSemanticLayerResponse,
    ApiScheduleOnboardingDashboardResponse,
    ApiScheduleOnboardingProfileResponse,
    ApiScheduleOnboardingSemanticLayerResponse,
    assertRegisteredAccount,
    ConfigureOnboardingConnectionRequest,
    DepositOnboardingConnectionRequest,
    GrantScriptRequest,
    OnboardingConnectionKeyFingerprintRequest,
    TestOnboardingConnectionRequest,
    UpdateOnboardingProjectStep,
    UpdateSemanticLayerFieldRequest,
    ValidateOnboardingConnectionRequest,
    type UUID,
} from '@lightdash/common';
import {
    Body,
    Get,
    Middlewares,
    OperationId,
    Patch,
    Path,
    Post,
    Request,
    Response,
    Route,
    SuccessResponse,
    Tags,
} from '@tsoa/runtime';
import express from 'express';
import { toSessionUser } from '../auth/account';
import { allowApiKeyAuthentication, isAuthenticated } from './authentication';
import { BaseController } from './baseController';

@Route('/api/v1/projects/{projectUuid}/onboarding')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Projects')
export class OnboardingController extends BaseController {
    /**
     * Get the onboarding progress stored for a project.
     * @summary Get onboarding state
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/state')
    @OperationId('GetOnboardingProjectState')
    async getState(
        @Path() projectUuid: UUID,
        @Request() req: express.Request,
    ): Promise<ApiOnboardingProjectStateResponse> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.services
                .getOnboardingFlowService()
                .getState(req.account, projectUuid),
        };
    }

    /**
     * Update one onboarding step and return the current project state.
     * @summary Update onboarding state
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Patch('/state')
    @OperationId('UpdateOnboardingProjectState')
    async updateState(
        @Path() projectUuid: UUID,
        @Body() body: UpdateOnboardingProjectStep,
        @Request() req: express.Request,
    ): Promise<ApiOnboardingProjectStateResponse> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.services
                .getOnboardingFlowService()
                .updateStep(
                    req.account,
                    projectUuid,
                    body.step,
                    body.status,
                    body.result,
                ),
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/profile')
    @OperationId('ScheduleOnboardingProfile')
    async scheduleProfile(
        @Path() projectUuid: UUID,
        @Request() req: express.Request,
    ): Promise<ApiScheduleOnboardingProfileResponse> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.services
                .getProjectProfileService()
                .scheduleProfile(toSessionUser(req.account), projectUuid),
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/profile')
    @OperationId('GetOnboardingProfile')
    async getProfile(
        @Path() projectUuid: UUID,
        @Request() req: express.Request,
    ): Promise<ApiOnboardingProfileResponse> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.services
                .getProjectProfileService()
                .getProfile(toSessionUser(req.account), projectUuid),
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/semantic-layer')
    @OperationId('ScheduleOnboardingSemanticLayer')
    async scheduleSemanticLayer(
        @Path() projectUuid: UUID,
        @Request() req: express.Request,
    ): Promise<ApiScheduleOnboardingSemanticLayerResponse> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.services
                .getSemanticGenerationService()
                .scheduleGeneration(toSessionUser(req.account), projectUuid),
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/semantic-layer')
    @OperationId('GetOnboardingSemanticLayer')
    async getSemanticLayer(
        @Path() projectUuid: UUID,
        @Request() req: express.Request,
    ): Promise<ApiOnboardingSemanticLayerResponse> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.services
                .getSemanticGenerationService()
                .getSemanticLayer(toSessionUser(req.account), projectUuid),
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Patch('/semantic-layer/fields')
    @OperationId('UpdateOnboardingSemanticLayerField')
    async updateSemanticLayerField(
        @Path() projectUuid: UUID,
        @Body() body: UpdateSemanticLayerFieldRequest,
        @Request() req: express.Request,
    ): Promise<ApiOnboardingSemanticLayerResponse> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.services
                .getSemanticGenerationService()
                .updateField(toSessionUser(req.account), projectUuid, body),
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/dashboard')
    @OperationId('ScheduleOnboardingDashboard')
    async scheduleDashboard(
        @Path() projectUuid: UUID,
        @Request() req: express.Request,
    ): Promise<ApiScheduleOnboardingDashboardResponse> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.services
                .getOnboardingDashboardService()
                .scheduleDashboardBuild(
                    toSessionUser(req.account),
                    projectUuid,
                ),
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/dashboard')
    @OperationId('GetOnboardingDashboard')
    async getDashboard(
        @Path() projectUuid: UUID,
        @Request() req: express.Request,
    ): Promise<ApiOnboardingDashboardResponse> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.services
                .getOnboardingDashboardService()
                .getDashboard(toSessionUser(req.account), projectUuid),
        };
    }

    @Middlewares([isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/connect-code')
    @OperationId('CreateOnboardingConnectCode')
    async createConnectCode(
        @Path() projectUuid: UUID,
        @Request() req: express.Request,
    ): Promise<ApiOnboardingConnectCodeResponse> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.services
                .getOnboardingConnectionService()
                .createConnectCode(req.account, projectUuid),
        };
    }

    @Middlewares([isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/connection/configure')
    @OperationId('ConfigureOnboardingConnection')
    async configureConnection(
        @Path() projectUuid: UUID,
        @Body() body: ConfigureOnboardingConnectionRequest,
        @Request() req: express.Request,
    ): Promise<ApiOnboardingConnectionDepositResponse> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.services
                .getOnboardingConnectionService()
                .configureConnection(
                    req.account,
                    projectUuid,
                    body.connectionValues,
                ),
        };
    }

    /**
     * Validate onboarding connection choices without persisting them.
     * @summary Validate onboarding connection
     */
    @Middlewares([isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/connection/validate')
    @OperationId('ValidateOnboardingConnection')
    async validateConnection(
        @Path() projectUuid: UUID,
        @Body() body: ValidateOnboardingConnectionRequest,
        @Request() req: express.Request,
    ): Promise<ApiOnboardingConnectionValidationResponse> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.services
                .getOnboardingConnectionService()
                .validateConnection(
                    req.account,
                    projectUuid,
                    body.connectionValues,
                ),
        };
    }
}

@Route('/api/v1/onboarding/connection')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Onboarding')
export class OnboardingConnectionController extends BaseController {
    @SuccessResponse('200', 'Success')
    @Post('/key-fingerprint')
    @OperationId('GetOnboardingConnectionKeyFingerprint')
    async getKeyFingerprint(
        @Body() body: OnboardingConnectionKeyFingerprintRequest,
    ): Promise<ApiOnboardingConnectionKeyFingerprintResponse> {
        return {
            status: 'ok',
            results: await this.services
                .getOnboardingConnectionService()
                .getKeyFingerprint(body),
        };
    }

    @SuccessResponse('200', 'Success')
    @Post('/deposit')
    @OperationId('DepositOnboardingConnection')
    async depositConnection(
        @Body() body: DepositOnboardingConnectionRequest,
    ): Promise<ApiOnboardingConnectionDepositResponse> {
        return {
            status: 'ok',
            results: await this.services
                .getOnboardingConnectionService()
                .depositConnection(body),
        };
    }

    /**
     * Test draft warehouse credentials without persisting them.
     * @summary Test connection
     */
    @Middlewares([isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/test')
    @OperationId('TestOnboardingConnection')
    async testConnection(
        @Body() body: TestOnboardingConnectionRequest,
        @Request() req: express.Request,
    ): Promise<ApiConnectionDiagnosticResponse> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.services
                .getWarehouseDiagnosticsService()
                .testConnection(req.account, body.warehouseConnection),
        };
    }

    /**
     * Generate a least-privilege Snowflake grant script for draft connection settings without persisting them.
     * @summary Generate grants
     */
    @Middlewares([isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/grant-script')
    @OperationId('GenerateOnboardingGrantScript')
    async getGrantScript(
        @Body() body: GrantScriptRequest,
        @Request() req: express.Request,
    ): Promise<ApiGrantScriptResponse> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.services
                .getWarehouseDiagnosticsService()
                .getGrantScript(req.account, {
                    roleName: body.roleName,
                    databaseName: body.databaseName,
                    warehouseName: body.warehouseName,
                    userName: body.userName ?? undefined,
                    schemas: body.schemas ?? undefined,
                }),
        };
    }
}
