import {
    ApiErrorPayload,
    ApiGroupListResponse,
    ApiGroupResponse,
    ApiOrganization,
    ApiOrganizationAllowedEmailDomains,
    ApiOrganizationMemberProfile,
    ApiOrganizationMemberProfiles,
    ApiSuccessEmpty,
    CreateGroup,
    CreateOrganization,
    OrganizationMemberProfileUpdate,
    UpdateAllowedEmailDomains,
    UpdateOrganization,
} from '@lightdash/common';
import express from 'express';
import {
    Body,
    Controller,
    Delete,
    Get,
    Middlewares,
    OperationId,
    Patch,
    Path,
    Post,
    Put,
    Request,
    Response,
    Route,
} from 'tsoa';
import { userModel } from '../models/models';
import { organizationService, userService } from '../services/services';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
} from './authentication';

@Route('/api/v1/org')
@Response<ApiErrorPayload>('default', 'Error')
export class OrganizationController extends Controller {
    /**
     * Get the current user's organization
     * @param req express request
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @Get()
    @OperationId('getOrganization')
    async getOrganization(
        @Request() req: express.Request,
    ): Promise<ApiOrganization> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await organizationService.get(req.user!),
        };
    }

    /**
     * Create and join a new organization
     * @param req express request
     * @param body the new organization settings
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @Put()
    @OperationId('createOrganization')
    async createOrganization(
        @Request() req: express.Request,
        @Body() body: CreateOrganization,
    ): Promise<ApiSuccessEmpty> {
        await organizationService.createAndJoinOrg(req.user!, body);
        const sessionUser = await userModel.findSessionUserByUUID(
            req.user!.userUuid,
        );
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
    @OperationId('updateOrganization')
    async updateOrganization(
        @Request() req: express.Request,
        @Body() body: UpdateOrganization,
    ): Promise<ApiSuccessEmpty> {
        await organizationService.updateOrg(req.user!, body);
        this.setStatus(200);
        return {
            status: 'ok',
            results: undefined,
        };
    }

    /**
     * Delete an organization and all users inside that organization
     * @param req express request
     * @param organizationUuid the uuid of the organization to delete
     */
    @Middlewares([isAuthenticated, unauthorisedInDemo])
    @Delete('{organizationUuid}')
    @OperationId('deleteOrganization')
    async deleteOrganization(
        @Request() req: express.Request,
        @Path() organizationUuid: string,
    ): Promise<ApiSuccessEmpty> {
        await organizationService.delete(organizationUuid, req.user!);
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
     * Gets all the members of the current user's organization
     * @param req express request
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @Get('/users')
    @OperationId('getOrganizationMembers')
    async getOrganizationMembers(
        @Request() req: express.Request,
    ): Promise<ApiOrganizationMemberProfiles> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await organizationService.getUsers(req.user!),
        };
    }

    /**
     * Updates the membership profile for a user in the current user's organization
     * @param req express request
     * @param userUuid the uuid of the user to update
     * @param body the new membership profile
     */
    @Middlewares([isAuthenticated, unauthorisedInDemo])
    @Patch('/users/{userUuid}')
    @OperationId('updateOrganizationMember')
    async updateOrganizationMember(
        @Request() req: express.Request,
        @Path() userUuid: string,
        @Body() body: OrganizationMemberProfileUpdate,
    ): Promise<ApiOrganizationMemberProfile> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await organizationService.updateMember(
                req.user!,
                userUuid,
                body,
            ),
        };
    }

    /**
     * Deletes a user
     * @param req express request
     * @param userUuid the uuid of the user to delete
     */
    @Middlewares([isAuthenticated, unauthorisedInDemo])
    @Delete('/user/{userUuid}')
    @OperationId('deleteUser')
    async deleteUser(
        @Request() req: express.Request,
        @Path() userUuid: string,
    ): Promise<ApiSuccessEmpty> {
        await userService.delete(req.user!, userUuid);
        this.setStatus(200);
        return {
            status: 'ok',
            results: undefined,
        };
    }

    /**
     * Gets allowed email domains for the current user's organization
     * @param req express request
     */
    @Middlewares([isAuthenticated])
    @Get('/allowedEmailDomains')
    @OperationId('getOrganizationAllowedEmailDomains')
    async getOrganizationAllowedEmailDomains(
        @Request() req: express.Request,
    ): Promise<ApiOrganizationAllowedEmailDomains> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await organizationService.getAllowedEmailDomains(
                req.user!,
            ),
        };
    }

    @Middlewares([isAuthenticated, unauthorisedInDemo])
    @Patch('/allowedEmailDomains')
    @OperationId('updateOrganizationAllowedEmailDomains')
    async updateOrganizationAllowedEmailDomains(
        @Request() req: express.Request,
        @Body() body: UpdateAllowedEmailDomains,
    ): Promise<ApiOrganizationAllowedEmailDomains> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await organizationService.updateAllowedEmailDomains(
                req.user!,
                body,
            ),
        };
    }

    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @Post('/groups')
    @OperationId('createGroup')
    async createGroup(
        @Request() req: express.Request,
        @Body() body: Pick<CreateGroup, 'name'>,
    ): Promise<ApiGroupResponse> {
        const group = await organizationService.addGroupToOrganization(
            req.user!,
            body,
        );
        this.setStatus(201);
        return {
            status: 'ok',
            results: group,
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @Get('/groups')
    @OperationId('listGroupsInOrganization')
    async listGroupsInOrganization(
        @Request() req: express.Request,
    ): Promise<ApiGroupListResponse> {
        const groups = await organizationService.listGroupsInOrganization(
            req.user!,
        );
        this.setStatus(200);
        return {
            status: 'ok',
            results: groups,
        };
    }
}
