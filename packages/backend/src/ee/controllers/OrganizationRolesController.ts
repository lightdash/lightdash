import {
    ApiDefaultRoleResponse,
    ApiErrorPayload,
    ApiGetRolesResponse,
    ApiRoleAssignmentListResponse,
    ApiRoleAssignmentResponse,
    ApiRoleWithScopesResponse,
    ApiUnassignRoleFromUserResponse,
    CreateGroupRoleAssignmentRequest,
    CreateRole,
    CreateUserRoleAssignmentRequest,
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

/**
 * Organization Roles API
 *
 * Organization Role Assignments: /api/v2/orgs/{orgId}/roles
 * - Listing roles for an organization
 * - Creating roles in an organization
 * - Managing role assignments within an organization
 *
 * /api/v2/orgs/{orgId}/roles/assignments
 * - Listing role assignments for an organization
 * - Creating role assignments for an organization
 * - Managing role assignments within an organization
 *
 * /api/v2/orgs/{orgId}/roles/assignments/user/{userId}
 * - Listing role assignments for a user
 */
@Route('/api/v2/orgs/{orgUuid}/roles')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('v2', 'Organization Roles')
export class OrganizationRolesController extends BaseController {
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
    @Get()
    @OperationId('GetOrganizationRoles')
    async getOrganizationRoles(
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
     * Create a new role in organization
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('201', 'Created')
    @Post()
    @OperationId('CreateOrganizationRole')
    async createOrganizationRole(
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
     * Update role in organization
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Patch('/{roleUuid}')
    @OperationId('UpdateOrganizationRole')
    async updateOrganizationRole(
        @Request() req: express.Request,
        @Path() orgUuid: string,
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
     * Delete role from organization
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Delete('/{roleUuid}')
    @OperationId('DeleteOrganizationRole')
    async deleteOrganizationRole(
        @Request() req: express.Request,
        @Path() orgUuid: string,
        @Path() roleUuid: string,
    ): Promise<ApiUnassignRoleFromUserResponse> {
        await this.getRolesService().deleteRole(req.account!, roleUuid);

        this.setStatus(200);
        return {
            status: 'ok',
            results: undefined,
        };
    }

    /**
     * List organization role assignments
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/assignments')
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
     * Create organization role assignment for user
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('201', 'Created')
    @Post('/assignments/user/{userId}')
    @OperationId('CreateOrganizationUserRoleAssignment')
    async createOrganizationUserRoleAssignment(
        @Request() req: express.Request,
        @Path() orgUuid: string,
        @Path() userId: string,
        @Body() body: CreateUserRoleAssignmentRequest,
    ): Promise<ApiRoleAssignmentResponse> {
        const assignment =
            await this.getRolesService().createOrganizationRoleAssignment(
                req.account!,
                orgUuid,
                {
                    roleId: body.roleId,
                    assigneeType: 'user',
                    assigneeId: userId,
                },
            );

        this.setStatus(201);
        return {
            status: 'ok',
            results: assignment,
        };
    }

    /**
     * Create organization role assignment for group
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('201', 'Created')
    @Post('/assignments/group/{groupId}')
    @OperationId('CreateOrganizationGroupRoleAssignment')
    async createOrganizationGroupRoleAssignment(
        @Request() req: express.Request,
        @Path() orgUuid: string,
        @Path() groupId: string,
        @Body() body: CreateGroupRoleAssignmentRequest,
    ): Promise<ApiRoleAssignmentResponse> {
        const assignment =
            await this.getRolesService().createOrganizationRoleAssignment(
                req.account!,
                orgUuid,
                {
                    roleId: body.roleId,
                    assigneeType: 'group',
                    assigneeId: groupId,
                },
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
    @Delete('/assignments/user/{userId}')
    @OperationId('DeleteOrganizationUserRoleAssignment')
    async deleteOrganizationUserRoleAssignment(
        @Request() req: express.Request,
        @Path() orgUuid: string,
        @Path() userId: string,
    ): Promise<ApiUnassignRoleFromUserResponse> {
        await this.getRolesService().deleteOrganizationRoleAssignment(
            req.account!,
            orgUuid,
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
    @Delete('/assignments/group/{groupId}')
    @OperationId('DeleteOrganizationGroupRoleAssignment')
    async deleteOrganizationGroupRoleAssignment(
        @Request() req: express.Request,
        @Path() orgUuid: string,
        @Path() groupId: string,
    ): Promise<ApiUnassignRoleFromUserResponse> {
        await this.getRolesService().deleteOrganizationRoleAssignment(
            req.account!,
            orgUuid,
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
