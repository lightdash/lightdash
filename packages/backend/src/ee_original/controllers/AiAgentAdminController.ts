import {
    AiAgentAdminFilters,
    AiAgentAdminSort,
    ApiAiAgentAdminConversationsResponse,
    ApiAiAgentResponse,
    ApiAiAgentSummaryResponse,
    ApiAiOrganizationSettingsResponse,
    ApiErrorPayload,
    ApiUpdateAiOrganizationSettingsResponse,
    KnexPaginateArgs,
    UpdateAiOrganizationSettings,
} from '@lightdash/common';
import {
    Body,
    Get,
    Hidden,
    Middlewares,
    OperationId,
    Patch,
    Query,
    Request,
    Response,
    Route,
    SuccessResponse,
} from '@tsoa/runtime';
import express from 'express';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
} from '../../controllers/authentication';
import { BaseController } from '../../controllers/baseController';
import { type AiAgentAdminService } from '../services/AiAgentAdminService';
import { type AiOrganizationSettingsService } from '../services/AiOrganizationSettingsService';

@Route('/api/v1/aiAgents/admin')
@Response<ApiErrorPayload>('default', 'Error')
export class AiAgentAdminController extends BaseController {
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/threads')
    @OperationId('getAllThreads')
    async getAllThreads(
        @Request() req: express.Request,
        // Pagination
        @Query() page?: KnexPaginateArgs['page'],
        @Query() pageSize?: KnexPaginateArgs['pageSize'],
        // Filtering
        @Query() projectUuids?: AiAgentAdminFilters['projectUuids'],
        @Query() agentUuids?: AiAgentAdminFilters['agentUuids'],
        @Query() userUuids?: AiAgentAdminFilters['userUuids'],
        @Query() createdFrom?: AiAgentAdminFilters['createdFrom'],
        @Query() humanScore?: AiAgentAdminFilters['humanScore'],
        @Query() dateFrom?: AiAgentAdminFilters['dateFrom'],
        @Query() dateTo?: AiAgentAdminFilters['dateTo'],
        @Query() search?: AiAgentAdminFilters['search'],
        // Sorting
        @Query() sortField?: AiAgentAdminSort['field'],
        @Query() sortDirection?: AiAgentAdminSort['direction'],
    ): Promise<ApiAiAgentAdminConversationsResponse> {
        const paginateArgs: KnexPaginateArgs | undefined =
            page !== undefined || pageSize !== undefined
                ? {
                      page: page ?? 1,
                      pageSize: pageSize ?? 50,
                  }
                : {
                      page: 1,
                      pageSize: 50,
                  };

        const filters: AiAgentAdminFilters = {
            ...(projectUuids && { projectUuids }),
            ...(agentUuids && { agentUuids }),
            ...(userUuids && { userUuids }),
            ...(createdFrom && { createdFrom }),
            ...(humanScore !== undefined && { humanScore }),
            ...(dateFrom && { dateFrom }),
            ...(dateTo && { dateTo }),
            ...(search && { search }),
        };

        const sort: AiAgentAdminSort | undefined = sortField
            ? {
                  field: sortField,
                  direction: sortDirection ?? 'desc',
              }
            : undefined;

        const threads = await this.getAiAgentAdminService().getAllThreads(
            req.user!,
            paginateArgs,
            filters,
            sort,
        );

        this.setStatus(200);
        return {
            status: 'ok',
            results: threads,
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/agents')
    @OperationId('getAllAgents')
    async getAllAgents(
        @Request() req: express.Request,
    ): Promise<ApiAiAgentSummaryResponse> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getAiAgentAdminService().listAgents(req.user!),
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/embed-token')
    @Hidden()
    @OperationId('getEmbedToken')
    async getEmbedToken(
        @Request() req: express.Request,
    ): Promise<{ status: string; results: { token: string; url: string } }> {
        const results = await this.getAiAgentAdminService().generateEmbedToken(
            req.user!,
        );

        this.setStatus(200);
        return {
            status: 'ok',
            results,
        };
    }

    /**
     * Get AI organization settings
     * @summary Get AI settings
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Retrieved AI organization settings')
    @Get('/settings')
    @OperationId('getAiOrganizationSettings')
    async getSettings(
        @Request() req: express.Request,
    ): Promise<ApiAiOrganizationSettingsResponse> {
        const settings =
            await this.getAiOrganizationSettingsService().getSettings(
                req.user!,
            );

        this.setStatus(200);
        return {
            status: 'ok',
            results: settings,
        };
    }

    /**
     * Update AI organization settings
     * @summary Update AI settings
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Updated AI organization settings')
    @Patch('/settings')
    @OperationId('upsertAiOrganizationSettings')
    async upsertSettings(
        @Request() req: express.Request,
        @Body() body: UpdateAiOrganizationSettings,
    ): Promise<ApiUpdateAiOrganizationSettingsResponse> {
        const settings =
            await this.getAiOrganizationSettingsService().upsertSettings(
                req.user!,
                body,
            );

        this.setStatus(200);
        return {
            status: 'ok',
            results: settings,
        };
    }

    protected getAiAgentAdminService() {
        return this.services.getAiAgentAdminService<AiAgentAdminService>();
    }

    protected getAiOrganizationSettingsService() {
        return this.services.getAiOrganizationSettingsService<AiOrganizationSettingsService>();
    }
}
