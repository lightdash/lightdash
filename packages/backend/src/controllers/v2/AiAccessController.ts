import {
    ApiAiAccessForUserResponse,
    ApiAiAccessPolicyResponse,
    ApiAiPrincipalResponse,
    ApiAiPrincipalsResponse,
    ApiAiQueryAuditResponse,
    ApiAiSetupScriptResponse,
    ApiAiWarehouseCapabilitiesResponse,
    ApiErrorPayload,
    ApiSuccessEmpty,
    UpsertAiAccessPolicy,
    UUID,
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

@Route('/api/v2/projects/{projectUuid}/ai-access')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('v2', 'Projects')
export class AiAccessController extends BaseController {
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/capabilities')
    @OperationId('getCapabilitiesAiAccess')
    async getCapabilities(
        @Path() projectUuid: UUID,
        @Request() req: express.Request,
        @Query() connection?: UUID,
    ): Promise<ApiAiWarehouseCapabilitiesResponse> {
        const service = this.services.getAiAccessService();
        return {
            status: 'ok',
            results: await service.getCapabilities(
                req.account!,
                projectUuid,
                connection ?? null,
            ),
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/policy')
    @OperationId('getPolicyAiAccess')
    async getPolicy(
        @Path() projectUuid: UUID,
        @Request() req: express.Request,
        @Query() connection?: UUID,
    ): Promise<ApiAiAccessPolicyResponse> {
        const service = this.services.getAiAccessService();
        return {
            status: 'ok',
            results: await service.getPolicy(
                req.account!,
                projectUuid,
                connection ?? null,
            ),
        };
    }

    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Put('/policy')
    @OperationId('upsertPolicyAiAccess')
    async upsertPolicy(
        @Path() projectUuid: UUID,
        @Request() req: express.Request,
        @Body() upsert: UpsertAiAccessPolicy,
        @Query() connection?: UUID,
    ): Promise<ApiAiAccessPolicyResponse> {
        const service = this.services.getAiAccessService();
        return {
            status: 'ok',
            results: await service.upsertPolicy(
                req.account!,
                projectUuid,
                connection ?? null,
                upsert,
            ),
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/principals')
    @OperationId('listPrincipalsAiAccess')
    async listPrincipals(
        @Path() projectUuid: UUID,
        @Request() req: express.Request,
        @Query() connection?: UUID,
    ): Promise<ApiAiPrincipalsResponse> {
        const service = this.services.getAiAccessService();
        return {
            status: 'ok',
            results: await service.listPrincipals(
                req.account!,
                projectUuid,
                connection ?? null,
            ),
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/setup-script')
    @OperationId('getSetupScriptAiAccess')
    async getSetupScript(
        @Path() projectUuid: UUID,
        @Request() req: express.Request,
        @Query() connection?: UUID,
        @Query() principal?: UUID,
    ): Promise<ApiAiSetupScriptResponse> {
        const service = this.services.getAiAccessService();
        return {
            status: 'ok',
            results: await service.getSetupScript(
                req.account!,
                projectUuid,
                connection ?? null,
                principal ?? null,
            ),
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/me')
    @OperationId('getMyAccessAiAccess')
    async getMyAccess(
        @Path() projectUuid: UUID,
        @Request() req: express.Request,
        @Query() connection?: UUID,
    ): Promise<ApiAiAccessForUserResponse> {
        const service = this.services.getAiAccessService();
        return {
            status: 'ok',
            results: await service.getMyAccess(
                req.account!,
                projectUuid,
                connection ?? null,
            ),
        };
    }

    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Post('/principals/{aiPrincipalUuid}/test')
    @OperationId('testPrincipalAiAccess')
    async testPrincipal(
        @Path() projectUuid: UUID,
        @Request() req: express.Request,
        @Path() aiPrincipalUuid: UUID,
    ): Promise<ApiAiPrincipalResponse> {
        const service = this.services.getAiAccessService();
        await service.assertPrincipalProject(
            req.account!,
            projectUuid,
            aiPrincipalUuid,
        );
        return {
            status: 'ok',
            results: await service.testPrincipal(req.account!, aiPrincipalUuid),
        };
    }

    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Post('/principals/{aiPrincipalUuid}/regenerate-secret')
    @OperationId('regenerateSecretAiAccess')
    async regenerateSecret(
        @Path() projectUuid: UUID,
        @Request() req: express.Request,
        @Path() aiPrincipalUuid: UUID,
    ): Promise<ApiAiPrincipalResponse> {
        const service = this.services.getAiAccessService();
        await service.assertPrincipalProject(
            req.account!,
            projectUuid,
            aiPrincipalUuid,
        );
        return {
            status: 'ok',
            results: await service.regenerateSecret(
                req.account!,
                aiPrincipalUuid,
            ),
        };
    }

    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Delete('/principals/{aiPrincipalUuid}')
    @OperationId('deletePrincipalAiAccess')
    async deletePrincipal(
        @Path() projectUuid: UUID,
        @Request() req: express.Request,
        @Path() aiPrincipalUuid: UUID,
    ): Promise<ApiSuccessEmpty> {
        const service = this.services.getAiAccessService();
        await service.assertPrincipalProject(
            req.account!,
            projectUuid,
            aiPrincipalUuid,
        );
        await service.deletePrincipal(req.account!, aiPrincipalUuid);
        return { status: 'ok', results: undefined };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/audit')
    @OperationId('listAuditAiAccess')
    async listAudit(
        @Path() projectUuid: UUID,
        @Request() req: express.Request,
        @Query() page: number = 1,
        @Query() pageSize: number = 25,
    ): Promise<ApiAiQueryAuditResponse> {
        const service = this.services.getAiAccessService();
        return {
            status: 'ok',
            results: await service.listAudit(req.account!, projectUuid, {
                page: Math.max(1, Math.floor(page)),
                pageSize: Math.min(100, Math.max(1, Math.floor(pageSize))),
            }),
        };
    }
}
