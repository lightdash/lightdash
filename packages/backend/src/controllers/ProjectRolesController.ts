import {
    ApiErrorPayload,
    ApiRoleAssignmentListResponse,
    ApiRoleAssignmentResponse,
    ApiUnassignRoleFromUserResponse,
    CreateGroupRoleAssignmentRequest,
    CreateUserRoleAssignmentRequest,
    UpdateRoleAssignmentRequest,
    UpsertUserRoleAssignmentRequest,
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
        @Path() userId: string,
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
     * Create or update project role assignment for group (upsert)
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
        @Path() groupId: string,
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
    @Delete('/assignments/user/{userId}')
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
    @Delete('/assignments/group/{groupId}')
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
}
