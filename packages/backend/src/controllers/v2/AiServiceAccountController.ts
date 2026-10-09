import {
    AgentAccessTestRequest,
    AiServiceAccountCredentialInput,
    AiServiceAccountTestRequest,
    ApiAgentAccessReportResponse,
    ApiAiServiceAccountSlotResponse,
    ApiAiServiceAccountStatusResponse,
    ApiAiServiceAccountTestResponse,
    ApiErrorPayload,
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

@Route('/api/v2/projects/{projectUuid}/ai-access/service-account')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('v2', 'Projects')
export class AiServiceAccountController extends BaseController {
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get()
    @OperationId('getAiServiceAccount')
    async get(
        @Path() projectUuid: UUID,
        @Request() req: express.Request,
        @Query() connection?: UUID,
    ): Promise<ApiAiServiceAccountStatusResponse> {
        return {
            status: 'ok',
            ...(await this.services
                .getAiServiceAccountService()
                .getStatus(req.account!, projectUuid, connection ?? null)),
        };
    }

    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Put()
    @OperationId('upsertAiServiceAccount')
    async upsert(
        @Path() projectUuid: UUID,
        @Request() req: express.Request,
        @Body() body: AiServiceAccountCredentialInput,
        @Query() connection?: UUID,
    ): Promise<ApiAiServiceAccountSlotResponse> {
        return {
            status: 'ok',
            results: await this.services
                .getAiServiceAccountService()
                .upsert(req.account!, projectUuid, connection ?? null, body),
        };
    }

    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Delete()
    @OperationId('deleteAiServiceAccount')
    async delete(
        @Path() projectUuid: UUID,
        @Request() req: express.Request,
        @Query() connection?: UUID,
    ): Promise<ApiAiServiceAccountSlotResponse> {
        await this.services
            .getAiServiceAccountService()
            .delete(req.account!, projectUuid, connection ?? null);
        return { status: 'ok', results: null };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/test')
    @OperationId('testAiServiceAccount')
    async test(
        @Path() projectUuid: UUID,
        @Request() req: express.Request,
        @Body() body: AiServiceAccountTestRequest,
        @Query() connection?: UUID,
    ): Promise<ApiAiServiceAccountTestResponse> {
        return {
            status: 'ok',
            results: await this.services
                .getAiServiceAccountService()
                .test(
                    req.account!,
                    projectUuid,
                    connection ?? null,
                    body.credentials,
                ),
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/test-access')
    @OperationId('testAiServiceAccountAccess')
    async testAccess(
        @Path() projectUuid: UUID,
        @Request() req: express.Request,
        @Body() body: AgentAccessTestRequest,
        @Query() connection?: UUID,
    ): Promise<ApiAgentAccessReportResponse> {
        return {
            status: 'ok',
            results: await this.services
                .getAiServiceAccountService()
                .testAccess(
                    req.account!,
                    projectUuid,
                    connection ?? null,
                    body,
                ),
        };
    }
}
