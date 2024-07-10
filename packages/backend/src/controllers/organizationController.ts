import {
    ApiErrorPayload,
    ApiGroupListResponse,
    ApiGroupResponse,
    ApiOrganization,
    ApiOrganizationAllowedEmailDomains,
    ApiOrganizationMemberProfile,
    ApiOrganizationMemberProfiles,
    ApiOrganizationProjects,
    ApiSuccessEmpty,
    CreateGroup,
    CreateOrganization,
    IKnexPaginateArgs,
    OrganizationMemberProfileUpdate,
    UpdateAllowedEmailDomains,
    UpdateOrganization,
    UUID,
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
                .get(req.user!),
        };
    }

    /**
     * Creates a new organization, the current user becomes the Admin of the new organization.
     * This is only available to users that are not already in an organization.
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
                .getProjects(req.user!),
        };
    }

    /**
     * Gets all the members of the current user's organization
     * @param req express request
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
    ): Promise<ApiOrganizationMemberProfiles> {
        this.setStatus(200);
        let paginateArgs: IKnexPaginateArgs | undefined;

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
                .getUsers(req.user!, includeGroups, paginateArgs, searchQuery),
        };
    }

    /**
     * Get the member profile for a user in the current user's organization by uuid
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
     * Updates the membership profile for a user in the current user's organization
     * @param req express request
     * @param userUuid the uuid of the user to update
     * @param body the new membership profile
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
     * Gets the allowed email domains for the current user's organization
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
    ): Promise<ApiGroupResponse> {
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
     * @param req
     * @param includeMembers number of members to include
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @Get('/groups')
    @OperationId('ListGroupsInOrganization')
    async listGroupsInOrganization(
        @Request() req: express.Request,
        @Query() includeMembers?: number,
    ): Promise<ApiGroupListResponse> {
        const groups = await this.services
            .getOrganizationService()
            .listGroupsInOrganization(req.user!, includeMembers);
        this.setStatus(200);
        return {
            status: 'ok',
            results: groups,
        };
    }
}
