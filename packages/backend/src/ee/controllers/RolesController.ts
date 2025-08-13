import {
    AddScopesToRole,
    ApiDefaultRoleResponse,
    ApiDeleteRoleResponse,
    ApiErrorPayload,
    ApiGetProjectAccessResponse,
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
} from '../../controllers/authentication';
import { BaseController } from '../../controllers/baseController';
import { RolesService } from '../services/RolesService';

@Route('/api/v2/roles')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('v2', 'Roles')
export class RolesController extends BaseController {
    /**
     * Convenience method to access the roles service without having
     * to specify an interface type.
     */
    protected getRolesService() {
        return this.services.getRolesService<RolesService>();
    }

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
        const roles = await this.getRolesService().getRolesByOrganizationUuid(
            req.account!,
            orgUuid,
            loadScopes,
        );

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
        const role = await this.getRolesService().createRole(
            req.account!,
            orgUuid,
            body,
        );

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
        const role = await this.getRolesService().updateRole(
            req.account!,
            roleUuid,
            body,
        );

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
        await this.getRolesService().deleteRole(req.account!, roleUuid);

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
        await this.getRolesService().assignRoleToUser(
            req.account!,
            userId,
            roleId,
            orgUuid,
        );

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
        await this.getRolesService().assignRoleToGroup(
            req.account!,
            groupId,
            roleId,
            projectUuid,
        );

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
    ): Promise<ApiGetProjectAccessResponse> {
        const user = await this.getRolesService().getProjectAccess(
            req.account!,
            projectId,
        );

        this.setStatus(200);
        return {
            status: 'ok',
            results: user,
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
        await this.getRolesService().assignRoleToGroup(
            req.account!,
            groupId,
            body.roleUuid,
            projectId,
        );

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
        await this.getRolesService().unassignRoleFromGroup(
            req.account!,
            groupId,
            projectId,
        );

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
    @Patch('/projects/{projectId}/user/{userUuid}')
    @OperationId('UpdateUserProjectAccess')
    async updateUserProjectAccess(
        @Request() req: express.Request,
        @Path() projectId: string,
        @Path() userUuid: string,
        @Body() body: { roleUuid: string },
    ): Promise<ApiUnassignRoleFromUserResponse> {
        await this.getRolesService().updateUserProjectAccess(
            req.account!,
            projectId,
            userUuid,
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
    @Delete('/projects/{projectId}/user/{userUuid}')
    @OperationId('RemoveUserProjectAccess')
    async removeUserProjectAccess(
        @Request() req: express.Request,
        @Path() projectId: string,
        @Path() userUuid: string,
    ): Promise<ApiUnassignRoleFromUserResponse> {
        await this.getRolesService().removeUserProjectAccess(
            req.account!,
            projectId,
            userUuid,
        );

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
        await this.getRolesService().createUserProjectAccess(
            req.account!,
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
        await this.getRolesService().addScopesToRole(
            req.account!,
            roleUuid,
            body,
        );

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
        await this.getRolesService().removeScopeFromRole(
            req.account!,
            roleUuid,
            scopeName,
        );

        this.setStatus(200);
        return {
            status: 'ok',
            results: undefined,
        };
    }
}
