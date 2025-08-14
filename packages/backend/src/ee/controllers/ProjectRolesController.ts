import {
    ApiErrorPayload,
    ApiRoleAssignmentListResponse,
    ApiRoleAssignmentResponse,
    ApiUnassignRoleFromUserResponse,
    CreateRoleAssignmentRequest,
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
        return this.services.getRolesService<RolesService>();
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
     * Create project role assignment
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('201', 'Created')
    @Post('/assignments')
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
    @Patch('/assignments/user/{userId}')
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
