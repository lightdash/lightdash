import {
    ApiColorPaletteResponse,
    ApiColorPalettesResponse,
    ApiCreatedColorPaletteResponse,
    ApiCreateGroupResponse,
    ApiErrorPayload,
    ApiGroupListResponse,
    ApiOrganization,
    ApiOrganizationAllowedEmailDomains,
    ApiOrganizationMemberProfile,
    ApiOrganizationMemberProfiles,
    ApiOrganizationProjects,
    ApiReassignUserSchedulersResponse,
    ApiSuccessEmpty,
    ApiUserSchedulersSummaryResponse,
    AuthorizationError,
    CreateColorPalette,
    CreateGroup,
    CreateOrganization,
    getRequestMethod,
    KnexPaginateArgs,
    LightdashRequestMethodHeader,
    OrganizationMemberProfileUpdate,
    ReassignUserSchedulersRequest,
    UpdateAllowedEmailDomains,
    UpdateColorPalette,
    UpdateOrganization,
    UUID,
    type ApiCreateProjectResults,
    type ApiSuccess,
    type CreateProjectOptionalCredentials,
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
    Put,
    Query,
    Request,
    Response,
    Route,
    Tags,
} from '@tsoa/runtime';
import express from 'express';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
} from './authentication';
import { BaseController } from './baseController';

@Route('/api/v1/org')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Organizations')
export class OrganizationController extends BaseController {
    /**
     * Get the current user's organization
     * @summary Get current organization
     * @param req express request
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @Get()
    @OperationId('GetMyOrganization')
    async getOrganization(
        @Request() req: express.Request,
    ): Promise<ApiOrganization> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getOrganizationService()
                .get(req.account!),
        };
    }

    /**
     * Creates a new organization, the current user becomes the Admin of the new organization.
     * This is only available to users that are not already in an organization.
     * @summary Create organization
     * @param req express request
     * @param body the new organization settings
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @Put()
    @OperationId('CreateOrganization')
    async createOrganization(
        @Request() req: express.Request,
        @Body() body: CreateOrganization,
    ): Promise<ApiSuccessEmpty> {
        await this.services
            .getOrganizationService()
            .createAndJoinOrg(req.user!, body);
        const sessionUser = await req.services
            .getUserService()
            .getSessionByUserUuid(req.user!.userUuid);
        await new Promise<void>((resolve, reject) => {
            req.login(sessionUser, (err) => {
                if (err) {
                    reject(err);
                }
                resolve();
            });
        });
        this.setStatus(200);
        return {
            status: 'ok',
            results: undefined,
        };
    }

    /**
     * Update the current user's organization
     * @summary Update current organization
     * @param req express request
     * @param body the new organization settings
     */
    @Middlewares([isAuthenticated, unauthorisedInDemo])
    @Patch()
    @OperationId('UpdateMyOrganization')
    async updateOrganization(
        @Request() req: express.Request,
        @Body() body: UpdateOrganization,
    ): Promise<ApiSuccessEmpty> {
        await this.services.getOrganizationService().updateOrg(req.user!, body);
        this.setStatus(200);
        return {
            status: 'ok',
            results: undefined,
        };
    }

    /**
     * Deletes an organization and all users inside that organization
     * @summary Delete organization
     * @param req express request
     * @param organizationUuid the uuid of the organization to delete
     */
    @Middlewares([isAuthenticated, unauthorisedInDemo])
    @Delete('{organizationUuid}')
    @OperationId('DeleteMyOrganization')
    async deleteOrganization(
        @Request() req: express.Request,
        @Path() organizationUuid: string,
    ): Promise<ApiSuccessEmpty> {
        await this.services
            .getOrganizationService()
            .delete(organizationUuid, req.user!);
        await new Promise<void>((resolve, reject) => {
            req.session.destroy((err) => {
                if (err) {
                    reject(err);
                }
                resolve();
            });
        });
        this.setStatus(200);
        return {
            status: 'ok',
            results: undefined,
        };
    }

    /**
     * Gets all projects of the current user's organization
     * @summary List organization projects
     * @param req express request
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @Get('/projects')
    @OperationId('ListOrganizationProjects')
    async getProjects(
        @Request() req: express.Request,
    ): Promise<ApiOrganizationProjects> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getOrganizationService()
                .getProjects(req.account!),
        };
    }

    /**
     * Gets all the members of the current user's organization
     * @summary List organization members
     * @param req express request
     * @param projectUuid filter users who can view this project
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @Get('/users')
    @OperationId('ListOrganizationMembers')
    async getOrganizationMembers(
        @Request() req: express.Request,
        @Query() includeGroups?: number,
        @Query() pageSize?: number,
        @Query() page?: number,
        @Query() searchQuery?: string,
        @Query() projectUuid?: string,
        @Query() googleOidcOnly?: boolean,
    ): Promise<ApiOrganizationMemberProfiles> {
        this.setStatus(200);
        let paginateArgs: KnexPaginateArgs | undefined;

        if (pageSize && page) {
            paginateArgs = {
                page,
                pageSize,
            };
        }

        return {
            status: 'ok',
            results: await this.services
                .getOrganizationService()
                .getUsers(
                    req.user!,
                    includeGroups,
                    paginateArgs,
                    searchQuery,
                    projectUuid,
                    googleOidcOnly,
                ),
        };
    }

    /**
     * Get the member profile for a user in the current user's organization by uuid
     * @summary Get organization member by UUID
     * @param req express request
     * @param userUuid the uuid of the user
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @Get('/users/{userUuid}')
    @OperationId('GetOrganizationMemberByUuid')
    async getOrganizationMemberByUuid(
        @Request() req: express.Request,
        @Path() userUuid: UUID,
    ): Promise<ApiOrganizationMemberProfile> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getOrganizationService()
                .getMemberByUuid(req.user!, userUuid),
        };
    }

    /**
     * Get the member profile for a user in the current user's organization by email
     * @summary Get organization member by email
     * @param req express request
     * @param email the email of the user
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @Get('/users/email/{email}')
    @OperationId('GetOrganizationMemberByEmail')
    async getOrganizationMemberByEmail(
        @Request() req: express.Request,
        @Path() email: string,
    ): Promise<ApiOrganizationMemberProfile> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getOrganizationService()
                .getMemberByEmail(req.user!, email),
        };
    }

    /**
     * Updates the membership profile for a user in the current user's organization
     * @summary Update organization member
     * @param req express request
     * @param userUuid the uuid of the user to update
     * @param body the new membership profile
     *
     * @deprecated Use the /api/v2/org/assignments/user/{userId} endpoint instead
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @Patch('/users/{userUuid}')
    @OperationId('UpdateOrganizationMember')
    @Tags('Roles & Permissions')
    async updateOrganizationMember(
        @Request() req: express.Request,
        @Path() userUuid: string,
        @Body() body: OrganizationMemberProfileUpdate,
    ): Promise<ApiOrganizationMemberProfile> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getOrganizationService()
                .updateMember(req.user!, userUuid, body),
        };
    }

    /**
     * Deletes a user from the current user's organization
     * @summary Delete organization member
     * @param req express request
     * @param userUuid the uuid of the user to delete
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @Delete('/user/{userUuid}')
    @OperationId('DeleteOrganizationMember')
    async deleteUser(
        @Request() req: express.Request,
        @Path() userUuid: string,
    ): Promise<ApiSuccessEmpty> {
        await this.services.getUserService().delete(req.user!, userUuid);
        this.setStatus(200);
        return {
            status: 'ok',
            results: undefined,
        };
    }

    /**
     * Gets a summary of scheduled deliveries owned by a user across all projects
     * @summary Get user schedulers
     * @param req express request
     * @param userUuid the uuid of the user
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @Get('/user/{userUuid}/schedulers-summary')
    @OperationId('GetUserSchedulersSummary')
    async getUserSchedulersSummary(
        @Request() req: express.Request,
        @Path() userUuid: string,
    ): Promise<ApiUserSchedulersSummaryResponse> {
        if (!req.user) {
            throw new AuthorizationError('User session not found');
        }

        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getSchedulerService()
                .getUserSchedulersSummary(req.user, userUuid),
        };
    }

    /**
     * Reassigns all scheduled deliveries from one user to another
     * @summary Reassign schedulers
     * @param req express request
     * @param userUuid the uuid of the user whose schedulers will be reassigned
     * @param body the new owner details
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @Patch('/user/{userUuid}/reassign-schedulers')
    @OperationId('ReassignUserSchedulers')
    async reassignUserSchedulers(
        @Request() req: express.Request,
        @Path() userUuid: string,
        @Body() body: ReassignUserSchedulersRequest,
    ): Promise<ApiReassignUserSchedulersResponse> {
        if (!req.user) {
            throw new AuthorizationError('User session not found');
        }

        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getSchedulerService()
                .reassignUserSchedulers(
                    req.user,
                    userUuid,
                    body.newOwnerUserUuid,
                ),
        };
    }

    /**
     * Gets the allowed email domains for the current user's organization
     * @summary List allowed email domains
     * @param req express request
     */
    @Middlewares([isAuthenticated])
    @Get('/allowedEmailDomains')
    @OperationId('ListOrganizationEmailDomains')
    async getOrganizationAllowedEmailDomains(
        @Request() req: express.Request,
    ): Promise<ApiOrganizationAllowedEmailDomains> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getOrganizationService()
                .getAllowedEmailDomains(req.user!),
        };
    }

    /**
     * Updates the allowed email domains for the current user's organization
     * @summary Update allowed email domains
     * @param req express request
     * @param body the new allowed email domains
     */
    @Middlewares([isAuthenticated, unauthorisedInDemo])
    @Patch('/allowedEmailDomains')
    @OperationId('UpdateOrganizationEmailDomains')
    async updateOrganizationAllowedEmailDomains(
        @Request() req: express.Request,
        @Body() body: UpdateAllowedEmailDomains,
    ): Promise<ApiOrganizationAllowedEmailDomains> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getOrganizationService()
                .updateAllowedEmailDomains(req.user!, body),
        };
    }

    /**
     * Creates a new group in the current user's organization
     * @summary Create group
     * @param req express request
     * @param body the new group details
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @Post('/groups')
    @OperationId('CreateGroupInOrganization')
    async createGroup(
        @Request() req: express.Request,
        @Body() body: CreateGroup,
    ): Promise<ApiCreateGroupResponse> {
        const group = await this.services
            .getOrganizationService()
            .addGroupToOrganization(req.user!, body);
        this.setStatus(201);
        return {
            status: 'ok',
            results: group,
        };
    }

    /**
     * Gets all the groups in the current user's organization
     * @summary List organization groups
     * @param req
     * @param includeMembers number of members to include
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @Get('/groups')
    @OperationId('ListGroupsInOrganization')
    async listGroupsInOrganization(
        @Request() req: express.Request,
        @Query() page?: number,
        @Query() pageSize?: number,
        @Query() includeMembers?: number,
        @Query() searchQuery?: string,
    ): Promise<ApiGroupListResponse> {
        let paginateArgs: KnexPaginateArgs | undefined;

        if (pageSize && page) {
            paginateArgs = {
                page,
                pageSize,
            };
        }

        const groups = await this.services
            .getOrganizationService()
            .listGroupsInOrganization(
                req.user!,
                includeMembers,
                paginateArgs,
                searchQuery,
            );

        this.setStatus(200);

        return {
            status: 'ok',
            results: groups,
        };
    }

    /**
     * Create a new color palette
     * @summary Create color palette
     */
    @Middlewares([isAuthenticated, unauthorisedInDemo])
    @Post('/color-palettes')
    @OperationId('CreateColorPalette')
    async createColorPalette(
        @Request() req: express.Request,
        @Body() body: CreateColorPalette,
    ): Promise<ApiCreatedColorPaletteResponse> {
        this.setStatus(201);
        return {
            status: 'ok',
            results: await this.services
                .getOrganizationService()
                .createColorPalette(req.user!, body),
        };
    }

    /**
     * List all color palettes in the organization
     * @summary List color palettes
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @Get('/color-palettes')
    @OperationId('ListColorPalettes')
    async getColorPalettes(
        @Request() req: express.Request,
    ): Promise<ApiColorPalettesResponse> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getOrganizationService()
                .getColorPalettes(req.user!),
        };
    }

    /**
     * Update a color palette
     * @summary Update color palette
     */
    @Middlewares([isAuthenticated, unauthorisedInDemo])
    @Patch('/color-palettes/{colorPaletteUuid}')
    @OperationId('UpdateColorPalette')
    async updateColorPalette(
        @Request() req: express.Request,
        @Path() colorPaletteUuid: string,
        @Body() body: UpdateColorPalette,
    ): Promise<ApiColorPaletteResponse> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getOrganizationService()
                .updateColorPalette(req.user!, colorPaletteUuid, body),
        };
    }

    /**
     * Delete a color palette
     * @summary Delete color palette
     */
    @Middlewares([isAuthenticated, unauthorisedInDemo])
    @Delete('/color-palettes/{colorPaletteUuid}')
    @OperationId('DeleteColorPalette')
    async deleteColorPalette(
        @Request() req: express.Request,
        @Path() colorPaletteUuid: string,
    ): Promise<ApiSuccessEmpty> {
        await this.services
            .getOrganizationService()
            .deleteColorPalette(req.user!, colorPaletteUuid);
        this.setStatus(200);
        return {
            status: 'ok',
            results: undefined,
        };
    }

    /**
     * Set a color palette as the active palette
     * @summary Set active color palette
     */
    @Middlewares([isAuthenticated, unauthorisedInDemo])
    @Post('/color-palettes/{colorPaletteUuid}/active')
    @OperationId('SetActiveColorPalette')
    async setActiveColorPalette(
        @Request() req: express.Request,
        @Path() colorPaletteUuid: string,
    ): Promise<ApiColorPaletteResponse> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getOrganizationService()
                .setActiveColorPalette(req.user!, colorPaletteUuid),
        };
    }

    /**
     * Create a new project in the organization
     * @summary Create project
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @Post('/projects')
    @OperationId('CreateProject')
    async createProject(
        @Request() req: express.Request,
        @Body() body: CreateProjectOptionalCredentials,
    ): Promise<ApiSuccess<ApiCreateProjectResults>> {
        const results = await this.services
            .getProjectService()
            .createWithoutCompile(
                req.user!,
                body,
                getRequestMethod(req.header(LightdashRequestMethodHeader)),
            );

        return {
            status: 'ok',
            results,
        };
    }
}
