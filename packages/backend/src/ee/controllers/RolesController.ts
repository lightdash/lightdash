import {
    AddScopesToRole,
    ApiDefaultRoleResponse,
    ApiDeleteRoleResponse,
    ApiErrorPayload,
    ApiGetProjectAccessResponse,
    ApiGetRolesResponse,
    ApiRemoveScopeFromRoleResponse,
    ApiRoleAssignmentListResponse,
    ApiRoleAssignmentResponse,
    ApiRoleWithScopesResponse,
    ApiUnassignRoleFromUserResponse,
    CreateRole,
    CreateRoleAssignmentRequest,
    UpdateRole,
    UpdateRoleAssignmentRequest,
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

/**

UNIFIED API VISION:

1. Consistent Resource Hierarchy:
    GET    /api/v2/roles/org/{orgId}
    POST   /api/v2/roles/org/{orgId}
    GET    /api/v2/roles/{roleId}
    PATCH  /api/v2/roles/{roleId}
    DELETE /api/v2/roles/{roleId}

    POST   /api/v2/roles/{roleId}/scopes
    DELETE /api/v2/roles/{roleId}/scopes/{scopeName}

2. Unified Assignment Pattern:
    GET    /api/v2/roles/org/{orgId}/role-assignments
    POST   /api/v2/roles/org/{orgId}/role-assignments (users only - groups not supported at org level)
    DELETE /api/v2/roles/org/{orgId}/role-assignments/user/{userId}/{roleId}
    
    GET    /api/v2/roles/projects/{projectId}/role-assignments
    POST   /api/v2/roles/projects/{projectId}/role-assignments
    PATCH  /api/v2/roles/projects/{projectId}/role-assignments/user/{userId}
    PATCH  /api/v2/roles/projects/{projectId}/role-assignments/group/{groupId}
    DELETE /api/v2/roles/projects/{projectId}/role-assignments/user/{userId}
    DELETE /api/v2/roles/projects/{projectId}/role-assignments/group/{groupId}

3. Consistent Request Body:
    POST assignments: { "roleId": "uuid", "assigneeType": "user" | "group", "assigneeId": "uuid" }
    PATCH assignments: { "roleId": "uuid" }

 */
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
     * Get role by ID
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/{roleUuid}')
    @OperationId('GetRoleById')
    async getRoleById(
        @Request() req: express.Request,
        @Path() roleUuid: string,
    ): Promise<ApiRoleWithScopesResponse> {
        const role = await this.getRolesService().getRoleByUuid(
            req.account!,
            roleUuid,
        );

        this.setStatus(200);
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

    // =====================================
    // UNIFIED ORGANIZATION ROLE ASSIGNMENTS
    // =====================================

    /**
     * List organization role assignments
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/org/{orgUuid}/role-assignments')
    @OperationId('GetOrganizationRoleAssignments')
    async getOrganizationRoleAssignments(
        @Request() req: express.Request,
        @Path() orgUuid: string,
    ): Promise<ApiRoleAssignmentListResponse> {
        const assignments =
            await this.getRolesService().getOrganizationRoleAssignments(
                req.account!,
                orgUuid,
            );

        this.setStatus(200);
        return {
            status: 'ok',
            results: assignments,
        };
    }

    /**
     * Create organization role assignment
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('201', 'Created')
    @Post('/org/{orgUuid}/role-assignments')
    @OperationId('CreateOrganizationRoleAssignment')
    async createOrganizationRoleAssignment(
        @Request() req: express.Request,
        @Path() orgUuid: string,
        @Body() body: CreateRoleAssignmentRequest,
    ): Promise<ApiRoleAssignmentResponse> {
        const assignment =
            await this.getRolesService().createOrganizationRoleAssignment(
                req.account!,
                orgUuid,
                body,
            );

        this.setStatus(201);
        return {
            status: 'ok',
            results: assignment,
        };
    }

    /**
     * Delete organization role assignment for user
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Delete('/org/{orgUuid}/role-assignments/user/{userId}/{roleId}')
    @OperationId('DeleteOrganizationUserRoleAssignment')
    async deleteOrganizationUserRoleAssignment(
        @Request() req: express.Request,
        @Path() orgUuid: string,
        @Path() userId: string,
        @Path() roleId: string,
    ): Promise<ApiUnassignRoleFromUserResponse> {
        await this.getRolesService().deleteOrganizationRoleAssignment(
            req.account!,
            orgUuid,
            roleId,
            userId,
            'user',
        );

        this.setStatus(200);
        return {
            status: 'ok',
            results: undefined,
        };
    }

    /**
     * Delete organization role assignment for group
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Delete('/org/{orgUuid}/role-assignments/group/{groupId}/{roleId}')
    @OperationId('DeleteOrganizationGroupRoleAssignment')
    async deleteOrganizationGroupRoleAssignment(
        @Request() req: express.Request,
        @Path() orgUuid: string,
        @Path() groupId: string,
        @Path() roleId: string,
    ): Promise<ApiUnassignRoleFromUserResponse> {
        await this.getRolesService().deleteOrganizationRoleAssignment(
            req.account!,
            orgUuid,
            roleId,
            groupId,
            'group',
        );

        this.setStatus(200);
        return {
            status: 'ok',
            results: undefined,
        };
    }

    // =====================================
    // UNIFIED PROJECT ROLE ASSIGNMENTS
    // =====================================

    /**
     * List project role assignments
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/projects/{projectId}/role-assignments')
    @OperationId('GetProjectRoleAssignments')
    async getProjectRoleAssignments(
        @Request() req: express.Request,
        @Path() projectId: string,
    ): Promise<ApiRoleAssignmentListResponse> {
        const assignments =
            await this.getRolesService().getProjectRoleAssignments(
                req.account!,
                projectId,
            );

        this.setStatus(200);
        return {
            status: 'ok',
            results: assignments,
        };
    }

    /**
     * Create project role assignment
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('201', 'Created')
    @Post('/projects/{projectId}/role-assignments')
    @OperationId('CreateProjectRoleAssignment')
    async createProjectRoleAssignment(
        @Request() req: express.Request,
        @Path() projectId: string,
        @Body() body: CreateRoleAssignmentRequest,
    ): Promise<ApiRoleAssignmentResponse> {
        const assignment =
            await this.getRolesService().createProjectRoleAssignment(
                req.account!,
                projectId,
                body,
            );

        this.setStatus(201);
        return {
            status: 'ok',
            results: assignment,
        };
    }

    /**
     * Update project role assignment for user
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Patch('/projects/{projectId}/role-assignments/user/{userId}')
    @OperationId('UpdateProjectUserRoleAssignment')
    async updateProjectUserRoleAssignment(
        @Request() req: express.Request,
        @Path() projectId: string,
        @Path() userId: string,
        @Body() body: UpdateRoleAssignmentRequest,
    ): Promise<ApiRoleAssignmentResponse> {
        const assignment =
            await this.getRolesService().updateProjectRoleAssignment(
                req.account!,
                projectId,
                userId,
                'user',
                body,
            );

        this.setStatus(200);
        return {
            status: 'ok',
            results: assignment,
        };
    }

    /**
     * Update project role assignment for group
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Patch('/projects/{projectId}/role-assignments/group/{groupId}')
    @OperationId('UpdateProjectGroupRoleAssignment')
    async updateProjectGroupRoleAssignment(
        @Request() req: express.Request,
        @Path() projectId: string,
        @Path() groupId: string,
        @Body() body: UpdateRoleAssignmentRequest,
    ): Promise<ApiRoleAssignmentResponse> {
        const assignment =
            await this.getRolesService().updateProjectRoleAssignment(
                req.account!,
                projectId,
                groupId,
                'group',
                body,
            );

        this.setStatus(200);
        return {
            status: 'ok',
            results: assignment,
        };
    }

    /**
     * Delete project role assignment for user
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Delete('/projects/{projectId}/role-assignments/user/{userId}')
    @OperationId('DeleteProjectUserRoleAssignment')
    async deleteProjectUserRoleAssignment(
        @Request() req: express.Request,
        @Path() projectId: string,
        @Path() userId: string,
    ): Promise<ApiUnassignRoleFromUserResponse> {
        await this.getRolesService().deleteProjectRoleAssignment(
            req.account!,
            projectId,
            userId,
            'user',
        );

        this.setStatus(200);
        return {
            status: 'ok',
            results: undefined,
        };
    }

    /**
     * Delete project role assignment for group
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Delete('/projects/{projectId}/role-assignments/group/{groupId}')
    @OperationId('DeleteProjectGroupRoleAssignment')
    async deleteProjectGroupRoleAssignment(
        @Request() req: express.Request,
        @Path() projectId: string,
        @Path() groupId: string,
    ): Promise<ApiUnassignRoleFromUserResponse> {
        await this.getRolesService().deleteProjectRoleAssignment(
            req.account!,
            projectId,
            groupId,
            'group',
        );

        this.setStatus(200);
        return {
            status: 'ok',
            results: undefined,
        };
    }

    // =====================================
    // LEGACY ENDPOINTS (TO BE DEPRECATED)
    // =====================================

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
