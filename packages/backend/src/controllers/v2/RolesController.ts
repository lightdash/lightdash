import {
    AddScopesToRole,
    ApiDefaultRoleResponse,
    ApiDeleteRoleResponse,
    ApiErrorPayload,
    ApiGetRolesResponse,
    ApiRemoveScopeFromRoleResponse,
    ApiRoleWithScopesResponse,
    ApiUnassignRoleFromUserResponse,
    CreateRole,
    UpdateRole,
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
import {
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
} from '../authentication';
import { BaseController } from '../baseController';

@Route('/api/v2/roles')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('v2', 'Roles')
export class RolesController extends BaseController {
    /**
     * Get roles for organization
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/org/{orgUuid}')
    @OperationId('GetRolesByOrganization')
    async getRolesByOrganization(
        @Request() req: express.Request,
        @Path() orgUuid: string,
        @Query() load?: string,
    ): Promise<ApiGetRolesResponse | ApiRoleWithScopesResponse> {
        const loadScopes = load === 'scopes';
        const roles = await this.services
            .getRolesService()
            .getRolesByOrganizationUuid(req.user!, orgUuid, loadScopes);

        this.setStatus(200);
        return {
            status: 'ok',
            results: roles,
        };
    }

    /**
     * Create a new role
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('201', 'Created')
    @Post('/org/{orgUuid}')
    @OperationId('CreateRole')
    async createRole(
        @Request() req: express.Request,
        @Path() orgUuid: string,
        @Body() body: CreateRole,
    ): Promise<ApiDefaultRoleResponse> {
        const role = await this.services
            .getRolesService()
            .createRole(req.user!, orgUuid, body);

        this.setStatus(201);
        return {
            status: 'ok',
            results: role,
        };
    }

    /**
     * Update role
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Patch('/{roleUuid}')
    @OperationId('UpdateRole')
    async updateRole(
        @Request() req: express.Request,
        @Path() roleUuid: string,
        @Body() body: UpdateRole,
    ): Promise<ApiDefaultRoleResponse> {
        const role = await this.services
            .getRolesService()
            .updateRole(req.user!, roleUuid, body);

        this.setStatus(200);
        return {
            status: 'ok',
            results: role,
        };
    }

    /**
     * Delete role
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Delete('/{roleUuid}')
    @OperationId('DeleteRole')
    async deleteRole(
        @Request() req: express.Request,
        @Path() roleUuid: string,
    ): Promise<ApiDeleteRoleResponse> {
        await this.services.getRolesService().deleteRole(req.user!, roleUuid);

        this.setStatus(200);
        return {
            status: 'ok',
            results: undefined,
        };
    }

    /**
     * Assign role to user
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Patch('/org/{orgUuid}/users/{userId}/role/{roleId}')
    @OperationId('AssignRoleToUser')
    async assignRoleToUser(
        @Request() req: express.Request,
        @Path() orgUuid: string,
        @Path() userId: string,
        @Path() roleId: string,
    ): Promise<ApiUnassignRoleFromUserResponse> {
        await this.services
            .getRolesService()
            .assignRoleToUser(req.user!, userId, roleId, orgUuid);

        this.setStatus(200);
        return {
            status: 'ok',
            results: undefined,
        };
    }

    /**
     * Assign role to group
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Patch('/groups/{groupId}/role/{roleId}')
    @OperationId('AssignRoleToGroup')
    async assignRoleToGroup(
        @Request() req: express.Request,
        @Path() groupId: string,
        @Path() roleId: string,
        @Query() projectUuid?: string,
    ): Promise<ApiUnassignRoleFromUserResponse> {
        await this.services
            .getRolesService()
            .assignRoleToGroup(req.user!, groupId, roleId, projectUuid);

        this.setStatus(200);
        return {
            status: 'ok',
            results: undefined,
        };
    }

    /**
     * Get project access
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/projects/{projectId}/access')
    @OperationId('GetProjectAccess')
    async getProjectAccess(
        @Request() req: express.Request,
        @Path() projectId: string,
    ): Promise<{
        status: 'ok';
        results: {
            users: unknown[];
            groups: unknown[];
        };
    }> {
        const access = await this.services
            .getRolesService()
            .getProjectAccess(req.user!, projectId);

        this.setStatus(200);
        return {
            status: 'ok',
            results: access,
        };
    }

    /**
     * Assign group to project
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Patch('/groups/{groupId}/projects/{projectId}')
    @OperationId('AssignGroupToProject')
    async assignGroupToProject(
        @Request() req: express.Request,
        @Path() groupId: string,
        @Path() projectId: string,
        @Body() body: { roleUuid: string },
    ): Promise<ApiUnassignRoleFromUserResponse> {
        await this.services
            .getRolesService()
            .assignRoleToGroup(req.user!, groupId, body.roleUuid, projectId);

        this.setStatus(200);
        return {
            status: 'ok',
            results: undefined,
        };
    }

    /**
     * Remove group from project
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Delete('/groups/{groupId}/projects/{projectId}')
    @OperationId('RemoveGroupFromProject')
    async removeGroupFromProject(
        @Request() req: express.Request,
        @Path() groupId: string,
        @Path() projectId: string,
    ): Promise<ApiUnassignRoleFromUserResponse> {
        await this.services
            .getRolesService()
            .unassignRoleFromGroup(req.user!, groupId, projectId);

        this.setStatus(200);
        return {
            status: 'ok',
            results: undefined,
        };
    }

    /**
     * Update user project access
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Patch('/projects/{projectId}/access/{accessId}')
    @OperationId('UpdateUserProjectAccess')
    async updateUserProjectAccess(
        @Request() req: express.Request,
        @Path() projectId: string,
        @Path() accessId: string,
        @Body() body: { roleUuid: string },
    ): Promise<ApiUnassignRoleFromUserResponse> {
        await this.services
            .getRolesService()
            .updateUserProjectAccess(
                req.user!,
                projectId,
                accessId,
                body.roleUuid,
            );

        this.setStatus(200);
        return {
            status: 'ok',
            results: undefined,
        };
    }

    /**
     * Remove user project access
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Delete('/projects/{projectId}/access/{accessId}')
    @OperationId('RemoveUserProjectAccess')
    async removeUserProjectAccess(
        @Request() req: express.Request,
        @Path() projectId: string,
        @Path() accessId: string,
    ): Promise<ApiUnassignRoleFromUserResponse> {
        await this.services
            .getRolesService()
            .removeUserProjectAccess(req.user!, projectId, accessId);

        this.setStatus(200);
        return {
            status: 'ok',
            results: undefined,
        };
    }

    /**
     * Create user project access
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('201', 'Created')
    @Post('/projects/{projectId}/access')
    @OperationId('CreateUserProjectAccess')
    async createUserProjectAccess(
        @Request() req: express.Request,
        @Path() projectId: string,
        @Body() body: { userUuid: string; roleUuid: string },
    ): Promise<ApiUnassignRoleFromUserResponse> {
        await this.services
            .getRolesService()
            .createUserProjectAccess(
                req.user!,
                projectId,
                body.userUuid,
                body.roleUuid,
            );

        this.setStatus(201);
        return {
            status: 'ok',
            results: undefined,
        };
    }

    /**
     * Add scopes to role
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Post('/{roleUuid}/scopes')
    @OperationId('AddScopesToRole')
    async addScopesToRole(
        @Request() req: express.Request,
        @Path() roleUuid: string,
        @Body() body: AddScopesToRole,
    ): Promise<ApiUnassignRoleFromUserResponse> {
        await this.services
            .getRolesService()
            .addScopesToRole(req.user!, roleUuid, body);

        this.setStatus(200);
        return {
            status: 'ok',
            results: undefined,
        };
    }

    /**
     * Remove scope from role
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Delete('/{roleUuid}/scopes/{scopeName}')
    @OperationId('RemoveScopeFromRole')
    async removeScopeFromRole(
        @Request() req: express.Request,
        @Path() roleUuid: string,
        @Path() scopeName: string,
    ): Promise<ApiRemoveScopeFromRoleResponse> {
        await this.services
            .getRolesService()
            .removeScopeFromRole(req.user!, roleUuid, scopeName);

        this.setStatus(200);
        return {
            status: 'ok',
            results: undefined,
        };
    }
}
