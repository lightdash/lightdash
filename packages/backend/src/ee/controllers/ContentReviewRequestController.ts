import {
    assertRegisteredAccount,
    ContentReviewRequestView,
    type ApiContentReviewRequestListResponse,
    type ApiContentReviewRequestOrNullResponse,
    type ApiContentReviewRequestResponse,
    type ApiContentReviewSettingsResponse,
    type ApiContentReviewSimilarContentResponse,
    type ApiErrorPayload,
    type ApproveContentReviewRequestBody,
    type ContentReviewContentType,
    type ContentReviewRequestStatus,
    type CreateContentReviewRequestBody,
    type FindSimilarContentBody,
    type RejectContentReviewRequestBody,
    type UpdateContentReviewSettings,
    type UUID,
} from '@lightdash/common';
import {
    Body,
    Deprecated,
    Extension,
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
import { toSessionUser } from '../../auth/account/account';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
} from '../../controllers/authentication';
import { getDeprecatedRouteMiddleware } from '../../controllers/authentication/deprecation';
import { BaseController } from '../../controllers/baseController';
import { type ContentReviewRequestService } from '../services/ContentReviewRequestService/ContentReviewRequestService';

const DEFAULT_PAGE_SIZE = 25;

@Route('/api/v1/projects/{projectUuid}/review-requests')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Content Review Requests')
export class ContentReviewRequestController extends BaseController {
    private getService(): ContentReviewRequestService {
        return this.services.getContentReviewRequestService<ContentReviewRequestService>();
    }

    /**
     * Review settings for a project: reviewer group, verify-on-approve default and Slack channel
     * @summary Get review settings
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/settings')
    @OperationId('getContentReviewSettings')
    async getSettings(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
    ): Promise<ApiContentReviewSettingsResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getService().getSettings(
                toSessionUser(req.account),
                projectUuid,
            ),
        };
    }

    /**
     * @summary Update review settings
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Patch('/settings')
    @OperationId('updateContentReviewSettings')
    async updateSettings(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
        @Body() body: UpdateContentReviewSettings,
    ): Promise<ApiContentReviewSettingsResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getService().updateSettings(
                toSessionUser(req.account),
                projectUuid,
                body,
            ),
        };
    }

    /**
     * Deprecated — use POST /similar for AI-powered chart comparison instead.
     * Preserves name matching until 14 December 2026. The replacement requires Ambient AI and a saved chart UUID or metric query context.
     * @summary Find similar content
     * @deprecated Use POST /similar with a saved chart UUID or metric query context.
     */
    @Deprecated()
    @Extension('x-mint', {
        content:
            '<Warning>This endpoint is deprecated and scheduled for removal after 14 December 2026. Migrate to POST /api/v1/projects/{projectUuid}/review-requests/similar with contentType, name, excludeContentUuid, and chart query context when comparing unsaved charts. The replacement requires Ambient AI; it does not support name-only, SQL chart, or dashboard comparisons.</Warning>',
    })
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        getDeprecatedRouteMiddleware(new Date('2026-09-14'), {
            suffixMessage:
                'Use POST /api/v1/projects/{projectUuid}/review-requests/similar with Ambient AI and a saved chart UUID or metric query context instead.',
        }),
    ])
    @SuccessResponse('200', 'Success')
    @Get('/similar')
    @OperationId('findSimilarContentForReview')
    async findSimilar(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
        @Query() contentType: ContentReviewContentType,
        @Query() name: string,
        @Query() excludeContentUuid?: UUID,
    ): Promise<ApiContentReviewSimilarContentResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getService().findSimilarContent(
                toSessionUser(req.account),
                projectUuid,
                {
                    contentType,
                    name,
                    excludeContentUuid: excludeContentUuid ?? null,
                },
            ),
        };
    }

    /** @summary Find related charts using names and query definitions */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/similar')
    @OperationId('compareSimilarContentForReview')
    async compareSimilar(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
        @Body() body: FindSimilarContentBody,
    ): Promise<ApiContentReviewSimilarContentResponse> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.getService().findSimilarContentWithAi(
                toSessionUser(req.account),
                projectUuid,
                body,
            ),
        };
    }

    /**
     * The open review request on a chart or dashboard, if any
     * @summary Get the pending review request for content
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/content/{contentType}/{contentUuid}')
    @OperationId('getPendingContentReviewRequest')
    async getPendingForContent(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
        @Path() contentType: ContentReviewContentType,
        @Path() contentUuid: UUID,
    ): Promise<ApiContentReviewRequestOrNullResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getService().findPendingForContent(
                toSessionUser(req.account),
                projectUuid,
                contentType,
                contentUuid,
            ),
        };
    }

    /**
     * Requests to review (routed to the caller) or the caller's own requests
     * @summary List review requests
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/')
    @OperationId('listContentReviewRequests')
    async list(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
        @Query()
        view: ContentReviewRequestView = ContentReviewRequestView.TO_REVIEW,
        @Query() status?: ContentReviewRequestStatus,
        @Query() page: number = 1,
        @Query() pageSize: number = DEFAULT_PAGE_SIZE,
    ): Promise<ApiContentReviewRequestListResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getService().list(
                toSessionUser(req.account),
                projectUuid,
                { view, status: status ?? null },
                { page, pageSize },
            ),
        };
    }

    /**
     * Ask for a chart or dashboard in your personal space to be reviewed and moved to a shared space
     * @summary Submit a review request
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('201', 'Created')
    @Post('/')
    @OperationId('createContentReviewRequest')
    async submit(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
        @Body() body: CreateContentReviewRequestBody,
    ): Promise<ApiContentReviewRequestResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(201);
        return {
            status: 'ok',
            results: await this.getService().submit(
                toSessionUser(req.account),
                projectUuid,
                body,
            ),
        };
    }

    /**
     * @summary Get a review request
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/{requestUuid}')
    @OperationId('getContentReviewRequest')
    async get(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
        @Path() requestUuid: UUID,
    ): Promise<ApiContentReviewRequestResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getService().get(
                toSessionUser(req.account),
                projectUuid,
                requestUuid,
            ),
        };
    }

    /**
     * Move the content to the target space and optionally verify it
     * @summary Approve a review request
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Post('/{requestUuid}/approve')
    @OperationId('approveContentReviewRequest')
    async approve(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
        @Path() requestUuid: UUID,
        @Body() body: ApproveContentReviewRequestBody,
    ): Promise<ApiContentReviewRequestResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getService().approve(
                toSessionUser(req.account),
                projectUuid,
                requestUuid,
                body,
            ),
        };
    }

    /**
     * @summary Reject a review request
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Post('/{requestUuid}/reject')
    @OperationId('rejectContentReviewRequest')
    async reject(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
        @Path() requestUuid: UUID,
        @Body() body: RejectContentReviewRequestBody,
    ): Promise<ApiContentReviewRequestResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getService().reject(
                toSessionUser(req.account),
                projectUuid,
                requestUuid,
                body,
            ),
        };
    }

    /**
     * @summary Cancel your own review request
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Post('/{requestUuid}/cancel')
    @OperationId('cancelContentReviewRequest')
    async cancel(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
        @Path() requestUuid: UUID,
    ): Promise<ApiContentReviewRequestResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getService().cancel(
                toSessionUser(req.account),
                projectUuid,
                requestUuid,
            ),
        };
    }
}
