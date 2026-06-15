import {
    AiAgentAdminFilters,
    AiAgentAdminSort,
    AiAgentReviewItemStatus,
    ApiAiAgentAdminConversationsResponse,
    ApiAiAgentReviewItemActivityResponse,
    ApiAiAgentReviewItemPrDiffResponse,
    ApiAiAgentReviewItemResponse,
    ApiAiAgentReviewItemsResponse,
    ApiAiAgentReviewSignalsResponse,
    ApiAiAgentSummaryResponse,
    ApiAiOrganizationSettingsResponse,
    ApiErrorPayload,
    ApiUpdateAiOrganizationSettingsResponse,
    assertRegisteredAccount,
    KnexPaginateArgs,
    UpdateAiAgentReviewItemStatus,
    UpdateAiOrganizationSettings,
    type ApiAiAgentReviewItemWritebackPreviewResponse,
} from '@lightdash/common';
import {
    Body,
    Get,
    Hidden,
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
} from '@tsoa/runtime';
import express from 'express';
import { toSessionUser } from '../../auth/account';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
} from '../../controllers/authentication';
import { BaseController } from '../../controllers/baseController';
import { type AiAgentAdminService } from '../services/AiAgentAdminService';
import { type AiOrganizationSettingsService } from '../services/AiOrganizationSettingsService';

@Route('/api/v1/aiAgents/admin')
@Response<ApiErrorPayload>('default', 'Error')
export class AiAgentAdminController extends BaseController {
    /**
     * Get all AI agent threads for admin
     * @summary List AI agent threads
     */
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
        assertRegisteredAccount(req.account);
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
            toSessionUser(req.account),
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

    /**
     * Get all AI agents for admin
     * @summary List AI agents
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/agents')
    @OperationId('getAllAgents')
    async getAllAgents(
        @Request() req: express.Request,
    ): Promise<ApiAiAgentSummaryResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getAiAgentAdminService().listAgents(
                toSessionUser(req.account),
            ),
        };
    }

    /**
     * Get AI agent classifier review items for admin
     * @summary List AI agent review items
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/review-items')
    @OperationId('getAiAgentReviewItems')
    async getReviewItems(
        @Request() req: express.Request,
        @Query() status?: AiAgentReviewItemStatus[],
    ): Promise<ApiAiAgentReviewItemsResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getAiAgentAdminService().listReviewItems(
                toSessionUser(req.account),
                status,
            ),
        };
    }

    /**
     * Get AI agent classifier review signals for admin debugging
     * @summary List AI agent review signals
     */
    /**
     * Get a single AI agent review item (lightweight, for polling progress)
     * @summary Get AI agent review item
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/review-items/{fingerprint}')
    @OperationId('getAiAgentReviewItem')
    async getReviewItem(
        @Request() req: express.Request,
        @Path() fingerprint: string,
    ): Promise<ApiAiAgentReviewItemResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getAiAgentAdminService().getReviewItem(
                toSessionUser(req.account),
                fingerprint,
            ),
        };
    }

    /**
     * Get the remediation activity feed for a review item
     * @summary Get AI agent review item activity
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/review-items/{fingerprint}/activity')
    @OperationId('getAiAgentReviewItemActivity')
    async getReviewItemActivity(
        @Request() req: express.Request,
        @Path() fingerprint: string,
    ): Promise<ApiAiAgentReviewItemActivityResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getAiAgentAdminService().getReviewItemActivity(
                toSessionUser(req.account),
                fingerprint,
            ),
        };
    }

    /**
     * Get the file diff of the pull request linked to a review item
     * @summary Get AI agent review item PR diff
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/review-items/{fingerprint}/pr-diff')
    @OperationId('getAiAgentReviewItemPrDiff')
    async getReviewItemPrDiff(
        @Request() req: express.Request,
        @Path() fingerprint: string,
    ): Promise<ApiAiAgentReviewItemPrDiffResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getAiAgentAdminService().getReviewItemPrDiff(
                toSessionUser(req.account),
                fingerprint,
            ),
        };
    }

    /**
     * Get the review item linked to a remediation preview work thread
     * @summary Get AI agent review item by preview thread
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/review-items/by-preview-thread/{threadUuid}')
    @OperationId('getAiAgentReviewItemByPreviewThread')
    async getReviewItemByPreviewThread(
        @Request() req: express.Request,
        @Path() threadUuid: string,
    ): Promise<ApiAiAgentReviewItemResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results:
                await this.getAiAgentAdminService().getReviewItemByPreviewThread(
                    toSessionUser(req.account),
                    threadUuid,
                ),
        };
    }

    /**
     * Update the status of an AI agent review item (e.g. dismiss it)
     * @summary Update AI agent review item status
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Patch('/review-items/{fingerprint}')
    @OperationId('updateAiAgentReviewItemStatus')
    async updateReviewItemStatus(
        @Request() req: express.Request,
        @Path() fingerprint: string,
        @Body() body: UpdateAiAgentReviewItemStatus,
    ): Promise<ApiAiAgentReviewItemResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getAiAgentAdminService().updateReviewItemStatus(
                toSessionUser(req.account),
                fingerprint,
                body,
            ),
        };
    }

    /**
     * Open a writeback pull request for a review item (semantic-layer or
     * project-context root cause)
     * @summary Create AI agent review item writeback PR
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Post('/review-items/{fingerprint}/writeback')
    @OperationId('createAiAgentReviewItemWriteback')
    async createReviewItemWriteback(
        @Request() req: express.Request,
        @Path() fingerprint: string,
    ): Promise<ApiAiAgentReviewItemResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results:
                await this.getAiAgentAdminService().createReviewItemWriteback(
                    toSessionUser(req.account),
                    fingerprint,
                ),
        };
    }

    /**
     * Preview the file change a writeback PR would make, without opening it.
     * Only project_context findings have a deterministic diff.
     * @summary Preview AI agent review item writeback diff
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/review-items/{fingerprint}/writeback-preview')
    @OperationId('getAiAgentReviewItemWritebackPreview')
    async getReviewItemWritebackPreview(
        @Request() req: express.Request,
        @Path() fingerprint: string,
    ): Promise<ApiAiAgentReviewItemWritebackPreviewResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results:
                await this.getAiAgentAdminService().getReviewItemWritebackPreview(
                    toSessionUser(req.account),
                    fingerprint,
                ),
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/review-signals')
    @OperationId('getAiAgentReviewSignals')
    async getReviewSignals(
        @Request() req: express.Request,
    ): Promise<ApiAiAgentReviewSignalsResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getAiAgentAdminService().listReviewSignals(
                toSessionUser(req.account),
            ),
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
        assertRegisteredAccount(req.account);
        const results = await this.getAiAgentAdminService().generateEmbedToken(
            toSessionUser(req.account),
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
        assertRegisteredAccount(req.account);
        const settings =
            await this.getAiOrganizationSettingsService().getSettings(
                toSessionUser(req.account),
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
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Updated AI organization settings')
    @Patch('/settings')
    @OperationId('upsertAiOrganizationSettings')
    async upsertSettings(
        @Request() req: express.Request,
        @Body() body: UpdateAiOrganizationSettings,
    ): Promise<ApiUpdateAiOrganizationSettingsResponse> {
        assertRegisteredAccount(req.account);
        const settings =
            await this.getAiOrganizationSettingsService().upsertSettings(
                toSessionUser(req.account),
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
