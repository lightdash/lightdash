import {
    assertRegisteredAccount,
    type ApiErrorPayload,
    type ApiProjectHomepageOrNullResponse,
    type ApiProjectHomepageResponse,
    type ApiProjectHomepagesResponse,
    type ApiPublishedHomepageResponse,
    type ApiRecentlyViewedResponse,
    type ApiSuccessEmpty,
    type CreateProjectHomepageRequest,
    type UpdateProjectHomepageDraftRequest,
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

@Route('/api/v1/projects/{projectUuid}/homepage')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Homepage')
export class ProjectHomepageController extends BaseController {
    private getHomepageService(): ProjectHomepageService {
        return this.services.getProjectHomepageService<ProjectHomepageService>();
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/')
    @OperationId('getPublishedProjectHomepage')
    async getPublished(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
    ): Promise<ApiPublishedHomepageResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getHomepageService().getPublishedHomepage(
                toSessionUser(req.account),
                projectUuid,
            ),
        };
    }

    // Literal route must be declared before '/{homepageUuid}' param routes
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/builder')
    @OperationId('getProjectHomepageForBuilder')
    async getForBuilder(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
        @Query() homepageUuid?: UUID,
    ): Promise<ApiProjectHomepageOrNullResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getHomepageService().getHomepageForBuilder(
                toSessionUser(req.account),
                projectUuid,
                homepageUuid,
            ),
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/recently-viewed')
    @OperationId('getHomepageRecentlyViewed')
    async getRecentlyViewed(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
    ): Promise<ApiRecentlyViewedResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getHomepageService().getRecentlyViewed(
                toSessionUser(req.account),
                projectUuid,
            ),
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/list')
    @OperationId('listProjectHomepages')
    async listHomepages(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
    ): Promise<ApiProjectHomepagesResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getHomepageService().listHomepages(
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
    @Post('/')
    @OperationId('createProjectHomepage')
    async create(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
        @Body() body: CreateProjectHomepageRequest,
    ): Promise<ApiProjectHomepageResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(201);
        return {
            status: 'ok',
            results: await this.getHomepageService().createHomepage(
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
    @Patch('/{homepageUuid}')
    @OperationId('updateProjectHomepageDraft')
    async updateDraft(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
        @Path() homepageUuid: UUID,
        @Body() body: UpdateProjectHomepageDraftRequest,
    ): Promise<ApiProjectHomepageResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getHomepageService().updateDraft(
                toSessionUser(req.account),
                projectUuid,
                homepageUuid,
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
    @Delete('/{homepageUuid}')
    @OperationId('deleteProjectHomepage')
    async delete(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
        @Path() homepageUuid: UUID,
    ): Promise<ApiSuccessEmpty> {
        assertRegisteredAccount(req.account);
        await this.getHomepageService().deleteHomepage(
            toSessionUser(req.account),
            projectUuid,
            homepageUuid,
        );
        this.setStatus(200);
        return {
            status: 'ok',
            results: undefined,
        };
    }

    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Post('/{homepageUuid}/publish')
    @OperationId('publishProjectHomepage')
    async publish(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
        @Path() homepageUuid: UUID,
    ): Promise<ApiProjectHomepageResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getHomepageService().publishHomepage(
                toSessionUser(req.account),
                projectUuid,
                homepageUuid,
            ),
        };
    }
}
