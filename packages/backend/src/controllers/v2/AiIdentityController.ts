import {
    ApiAiIdentitiesResponse,
    ApiAiIdentitiesSqlResponse,
    ApiAiIdentityResponse,
    ApiAiIdentitySettingsResponse,
    ApiErrorPayload,
    assertRegisteredAccount,
    UpdateAiIdentity,
    UpdateAiIdentitySettings,
    UUID,
} from '@lightdash/common';
import {
    Body,
    Get,
    Middlewares,
    OperationId,
    Patch,
    Path,
    Post,
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

@Route('/api/v2/projects/{projectUuid}/ai-identities')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('v2', 'AI identities')
export class AiIdentityController extends BaseController {
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('')
    @OperationId('getAiIdentities')
    async getSummary(
        @Path() projectUuid: UUID,
        @Request() req: express.Request,
    ): Promise<ApiAiIdentitiesResponse> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.services
                .getAiIdentityService()
                .getSummary(req.account, projectUuid),
        };
    }

    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Patch('settings')
    @OperationId('updateAiIdentitySettings')
    async updateSettings(
        @Path() projectUuid: UUID,
        @Request() req: express.Request,
        @Body() settings: UpdateAiIdentitySettings,
    ): Promise<ApiAiIdentitySettingsResponse> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.services
                .getAiIdentityService()
                .updateSettings(req.account, projectUuid, settings),
        };
    }

    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Post('provision')
    @OperationId('provisionAiIdentities')
    async provision(
        @Path() projectUuid: UUID,
        @Request() req: express.Request,
    ): Promise<ApiAiIdentitiesResponse> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.services
                .getAiIdentityService()
                .provision(req.account, projectUuid),
        };
    }

    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Patch('{userUuid}')
    @OperationId('updateAiIdentity')
    async updateIdentity(
        @Path() projectUuid: UUID,
        @Path() userUuid: UUID,
        @Request() req: express.Request,
        @Body() update: UpdateAiIdentity,
    ): Promise<ApiAiIdentityResponse> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.services
                .getAiIdentityService()
                .updateIdentity(
                    req.account,
                    projectUuid,
                    userUuid,
                    update.twinNameOverride,
                ),
        };
    }

    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Post('{userUuid}/regenerate-key')
    @OperationId('regenerateAiIdentityKey')
    async regenerateKey(
        @Path() projectUuid: UUID,
        @Path() userUuid: UUID,
        @Request() req: express.Request,
    ): Promise<ApiAiIdentityResponse> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.services
                .getAiIdentityService()
                .regenerateKey(req.account, projectUuid, userUuid),
        };
    }

    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Post('{userUuid}/test')
    @OperationId('testAiIdentity')
    async testIdentity(
        @Path() projectUuid: UUID,
        @Path() userUuid: UUID,
        @Request() req: express.Request,
    ): Promise<ApiAiIdentityResponse> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.services
                .getAiIdentityService()
                .testIdentity(req.account, projectUuid, userUuid),
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('sql')
    @OperationId('getAiIdentitySql')
    async getSql(
        @Path() projectUuid: UUID,
        @Request() req: express.Request,
        @Query() role?: string,
    ): Promise<ApiAiIdentitiesSqlResponse> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: {
                sql: await this.services
                    .getAiIdentityService()
                    .getProvisioningSql(req.account, projectUuid, role ?? null),
            },
        };
    }
}
