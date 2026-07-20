import {
    assertRegisteredAccount,
    ParameterError,
    type ApiAnnouncementCategoriesResponse,
    type ApiAnnouncementCategoryResponse,
    type ApiAnnouncementImageUploadResponse,
    type ApiAnnouncementResponse,
    type ApiAnnouncementsResponse,
    type ApiErrorPayload,
    type ApiSuccessEmpty,
    type CreateAnnouncementCategoryRequest,
    type CreateAnnouncementRequest,
    type UpdateAnnouncementRequest,
    type UUID,
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
import { BaseController } from '../../controllers/baseController';
import { type ProjectHomepageService } from '../services/ProjectHomepageService';

@Route('/api/v1/projects/{projectUuid}/announcements')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Homepage')
export class ProjectAnnouncementsController extends BaseController {
    private getHomepageService(): ProjectHomepageService {
        return this.services.getProjectHomepageService<ProjectHomepageService>();
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/')
    @OperationId('listProjectAnnouncements')
    async list(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
        @Query() page: number = 1,
        @Query() pageSize: number = 25,
        @Query() categoryUuid?: UUID,
    ): Promise<ApiAnnouncementsResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getHomepageService().listAnnouncements(
                toSessionUser(req.account),
                projectUuid,
                { page, pageSize, categoryUuid },
            ),
        };
    }

    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('201', 'Created')
    @Post('/')
    @OperationId('createProjectAnnouncement')
    async create(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
        @Body() body: CreateAnnouncementRequest,
    ): Promise<ApiAnnouncementResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(201);
        return {
            status: 'ok',
            results: await this.getHomepageService().createAnnouncement(
                toSessionUser(req.account),
                projectUuid,
                body,
            ),
        };
    }

    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Patch('/{announcementUuid}')
    @OperationId('updateProjectAnnouncement')
    async update(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
        @Path() announcementUuid: UUID,
        @Body() body: UpdateAnnouncementRequest,
    ): Promise<ApiAnnouncementResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getHomepageService().updateAnnouncement(
                toSessionUser(req.account),
                projectUuid,
                announcementUuid,
                body,
            ),
        };
    }

    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Delete('/{announcementUuid}')
    @OperationId('deleteProjectAnnouncement')
    async delete(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
        @Path() announcementUuid: UUID,
    ): Promise<ApiSuccessEmpty> {
        assertRegisteredAccount(req.account);
        await this.getHomepageService().deleteAnnouncement(
            toSessionUser(req.account),
            projectUuid,
            announcementUuid,
        );
        this.setStatus(200);
        return { status: 'ok', results: undefined };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/categories')
    @OperationId('listProjectAnnouncementCategories')
    async listCategories(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
    ): Promise<ApiAnnouncementCategoriesResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getHomepageService().listAnnouncementCategories(
                toSessionUser(req.account),
                projectUuid,
            ),
        };
    }

    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('201', 'Created')
    @Post('/categories')
    @OperationId('createProjectAnnouncementCategory')
    async createCategory(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
        @Body() body: CreateAnnouncementCategoryRequest,
    ): Promise<ApiAnnouncementCategoryResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(201);
        return {
            status: 'ok',
            results: await this.getHomepageService().createAnnouncementCategory(
                toSessionUser(req.account),
                projectUuid,
                body,
            ),
        };
    }

    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Post('/images')
    @OperationId('uploadProjectAnnouncementImage')
    async uploadImage(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
    ): Promise<ApiAnnouncementImageUploadResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);

        const mimeType = req.headers['content-type'];
        if (!mimeType) {
            throw new ParameterError('Content-Type header is required');
        }

        const contentLengthHeader = req.headers['content-length'];
        if (!contentLengthHeader) {
            throw new ParameterError('Content-Length header is required');
        }

        const contentLength = parseInt(contentLengthHeader, 10);
        if (Number.isNaN(contentLength) || contentLength <= 0) {
            throw new ParameterError(
                'Content-Length must be a positive integer',
            );
        }

        const result = await this.getHomepageService().uploadAnnouncementImage(
            toSessionUser(req.account),
            projectUuid,
            mimeType,
            req,
            contentLength,
        );

        return { status: 'ok', results: result };
    }
}
