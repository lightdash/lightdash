import {
    ApiErrorPayload,
    ApiProjectRoleSetResponse,
    ApiRoleAssignmentListResponse,
    ApiRoleAssignmentResponse,
    ApiUnassignRoleFromUserResponse,
    CreateGroupRoleAssignmentRequest,
    CreateUserRoleAssignmentRequest,
    ProjectRoleSet,
    UpdateRoleAssignmentRequest,
    UpsertUserRoleAssignmentRequest,
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
    Put,
    Request,
    Response,
    Route,
    SuccessResponse,
    Tags,
} from '@tsoa/runtime';
import express from 'express';
import { RolesService } from '../services/RolesService/RolesService';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
} from './authentication';
import { BaseController } from './baseController';

/**
 * Project Roles API
 *
 * Project Role Assignments: /api/v2/projects/{projectId}/roles
 * - Managing role assignments within a project
 * - Assigning users and groups to projects with specific roles
 *
 * /api/v2/projects/{projectId}/roles/assignments
 * - Listing role assignments for a project
 * - Creating role assignments for a project
 * - Managing role assignments within a project
 *
 * /api/v2/projects/{projectId}/roles/assignments/user/{userId}
 * - Listing role assignments for a user
 */
@Route('/api/v2/projects/{projectId}/roles')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('v2', 'Project Roles')
export class ProjectRolesController extends BaseController {
    /**
     * Convenience method to access the roles service without having
     * to specify an interface type.
     */
    protected getRolesService() {
        return this.services.getRolesService();
    }

    /**
     * List project role assignments
     * @summary List project role assignments
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/assignments')
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
     * Create or update project role assignment for user (upsert)
     * @summary Assign project role to user
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Post('/assignments/user/{userId}')
    @OperationId('UpsertProjectUserRoleAssignment')
    async upsertProjectUserRoleAssignment(
        @Request() req: express.Request,
        @Path() projectId: string,
        @Path() userId: UUID,
        @Body() body: UpsertUserRoleAssignmentRequest,
    ): Promise<ApiRoleAssignmentResponse> {
        const assignment =
            await this.getRolesService().upsertProjectUserRoleAssignment(
                req.account!,
                projectId,
                userId,
                body,
            );

        this.setStatus(200);
        return {
            status: 'ok',
            results: assignment,
        };
    }

    /**
     * Get the complete role set a user holds directly on the project.
     * Requires custom roles (Enterprise).
     * @summary Get project role set for user
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/assignments/user/{userId}/set')
    @OperationId('GetProjectUserRoleSet')
    async getProjectUserRoleSet(
        @Request() req: express.Request,
        @Path() projectId: string,
        @Path() userId: UUID,
    ): Promise<ApiProjectRoleSetResponse> {
        const results = await this.getRolesService().getProjectUserRoleSet(
            req.account!,
            projectId,
            userId,
        );
        this.setStatus(200);
        return { status: 'ok', results };
    }

    /**
     * Atomically replace the complete role set a user holds directly on the project.
     * At most one system role plus any number of custom roles; the set must not be empty.
     * Requires custom roles (Enterprise).
     * @summary Replace project role set for user
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Put('/assignments/user/{userId}/set')
    @OperationId('ReplaceProjectUserRoleSet')
    async replaceProjectUserRoleSet(
        @Request() req: express.Request,
        @Path() projectId: string,
        @Path() userId: UUID,
        @Body() body: ProjectRoleSet,
    ): Promise<ApiProjectRoleSetResponse> {
        const results = await this.getRolesService().replaceProjectUserRoleSet(
            req.account!,
            projectId,
            userId,
            body,
        );
        this.setStatus(200);
        return { status: 'ok', results };
    }

    /**
     * Get the complete role set a group holds on the project.
     * Requires custom roles (Enterprise).
     * @summary Get project role set for group
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/assignments/group/{groupId}/set')
    @OperationId('GetProjectGroupRoleSet')
    async getProjectGroupRoleSet(
        @Request() req: express.Request,
        @Path() projectId: string,
        @Path() groupId: UUID,
    ): Promise<ApiProjectRoleSetResponse> {
        const results = await this.getRolesService().getProjectGroupRoleSet(
            req.account!,
            projectId,
            groupId,
        );
        this.setStatus(200);
        return { status: 'ok', results };
    }

    /**
     * Atomically replace the complete role set a group holds on the project.
     * At most one system role plus any number of custom roles; the set must not be empty.
     * Requires custom roles (Enterprise).
     * @summary Replace project role set for group
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Put('/assignments/group/{groupId}/set')
    @OperationId('ReplaceProjectGroupRoleSet')
    async replaceProjectGroupRoleSet(
        @Request() req: express.Request,
        @Path() projectId: string,
        @Path() groupId: UUID,
        @Body() body: ProjectRoleSet,
    ): Promise<ApiProjectRoleSetResponse> {
        const results = await this.getRolesService().replaceProjectGroupRoleSet(
            req.account!,
            projectId,
            groupId,
            body,
        );
        this.setStatus(200);
        return { status: 'ok', results };
    }

    /**
     * Create or update project role assignment for group (upsert)
     * @summary Assign project role to group
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Post('/assignments/group/{groupId}')
    @OperationId('UpsertProjectGroupRoleAssignment')
    async upsertProjectGroupRoleAssignment(
        @Request() req: express.Request,
        @Path() projectId: string,
        @Path() groupId: UUID,
        @Body() body: UpsertUserRoleAssignmentRequest,
    ): Promise<ApiRoleAssignmentResponse> {
        const assignment =
            await this.getRolesService().upsertProjectGroupRoleAssignment(
                req.account!,
                projectId,
                groupId,
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
     * @summary Update project group role
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Patch('/assignments/group/{groupId}')
    @OperationId('UpdateProjectGroupRoleAssignment')
    async updateProjectGroupRoleAssignment(
        @Request() req: express.Request,
        @Path() projectId: string,
        @Path() groupId: UUID,
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
     * @summary Remove project role from user
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Delete('/assignments/user/{userId}')
    @OperationId('DeleteProjectUserRoleAssignment')
    async deleteProjectUserRoleAssignment(
        @Request() req: express.Request,
        @Path() projectId: string,
        @Path() userId: UUID,
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
     * @summary Remove project role from group
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Delete('/assignments/group/{groupId}')
    @OperationId('DeleteProjectGroupRoleAssignment')
    async deleteProjectGroupRoleAssignment(
        @Request() req: express.Request,
        @Path() projectId: string,
        @Path() groupId: UUID,
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
}
