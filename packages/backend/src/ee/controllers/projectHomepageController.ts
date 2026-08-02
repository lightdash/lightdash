import {
    assertRegisteredAccount,
    ParameterError,
    type ApiErrorPayload,
    type ApiHomepageAssignmentsResponse,
    type ApiHomepageLinkMetadataResponse,
    type ApiHomepageViewAsResponse,
    type ApiProjectHomepageOrNullResponse,
    type ApiProjectHomepageResponse,
    type ApiProjectHomepagesResponse,
    type ApiRecentlyViewedResponse,
    type ApiResolvedHomepageResponse,
    type ApiSuccessEmpty,
    type CreateProjectHomepageRequest,
    type HomepageViewAsTarget,
    type ProjectMemberRole,
    type PublishProjectHomepageRequest,
    type UpdateHomepageGroupPrioritiesRequest,
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
    @OperationId('getResolvedProjectHomepage')
    async getResolved(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
    ): Promise<ApiResolvedHomepageResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getHomepageService().getResolvedHomepage(
                toSessionUser(req.account),
                projectUuid,
            ),
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/view-as')
    @OperationId('viewHomepageAs')
    async viewAs(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
        @Query() targetType: 'user' | 'group' | 'role',
        @Query() userUuid?: UUID,
        @Query() groupUuid?: UUID,
        @Query() role?: ProjectMemberRole,
    ): Promise<ApiHomepageViewAsResponse> {
        assertRegisteredAccount(req.account);
        let target: HomepageViewAsTarget;
        if (targetType === 'user' && userUuid) {
            target = { type: 'user', userUuid };
        } else if (targetType === 'group' && groupUuid) {
            target = { type: 'group', groupUuid };
        } else if (targetType === 'role' && role) {
            target = { type: 'role', role };
        } else {
            throw new ParameterError(
                'View-as target requires a matching userUuid, groupUuid or role',
            );
        }
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getHomepageService().viewAsHomepage(
                toSessionUser(req.account),
                projectUuid,
                target,
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
    @Get('/link-metadata')
    @OperationId('getHomepageLinkMetadata')
    async getLinkMetadata(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
        @Query() url: string,
    ): Promise<ApiHomepageLinkMetadataResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getHomepageService().fetchLinkMetadata(
                toSessionUser(req.account),
                projectUuid,
                url,
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
    @Get('/assignments')
    @OperationId('getHomepageAssignments')
    async getAssignments(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
    ): Promise<ApiHomepageAssignmentsResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getHomepageService().getAssignments(
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
    @SuccessResponse('200', 'Success')
    @Patch('/group-priorities')
    @OperationId('updateHomepageGroupPriorities')
    async updateGroupPriorities(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
        @Body() body: UpdateHomepageGroupPrioritiesRequest,
    ): Promise<ApiSuccessEmpty> {
        assertRegisteredAccount(req.account);
        await this.getHomepageService().updateGroupPriorities(
            toSessionUser(req.account),
            projectUuid,
            body.groupUuids,
        );
        this.setStatus(200);
        return {
            status: 'ok',
            results: undefined,
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
    @Post('/{homepageUuid}/discard-draft')
    @OperationId('discardProjectHomepageDraft')
    async discardDraft(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
        @Path() homepageUuid: UUID,
    ): Promise<ApiProjectHomepageResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getHomepageService().discardDraft(
                toSessionUser(req.account),
                projectUuid,
                homepageUuid,
            ),
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
        @Body() body: PublishProjectHomepageRequest,
    ): Promise<ApiProjectHomepageResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getHomepageService().publishHomepage(
                toSessionUser(req.account),
                projectUuid,
                homepageUuid,
                body.audience,
            ),
        };
    }
}
