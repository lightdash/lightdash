import {
    ApiErrorPayload,
    ApiGetRolesResponse,
    ApiRoleAssignmentListResponse,
    ApiRoleAssignmentResponse,
    ApiRoleWithScopesResponse,
    CreateRole,
} from '@lightdash/common';
import {
    Body,
    Get,
    Middlewares,
    OperationId,
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
} from './authentication';
import { BaseController } from './baseController';

/**
 * Organization Roles API
 *
 * This API is available for all users
 * - GET /{roleUuid} - Get role by ID
 * - GET / - Get roles for organization
 * - GET /assignments - Get role assignments for organization
 * - POST /assignments/user/{userId} - Upsert role assignment for user
 *
 *  For more endpoints to create custom roles, see the EE Organization Roles API
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
        return this.services.getRolesService();
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
        @Query() roleTypeFilter?: string,
    ): Promise<ApiGetRolesResponse | ApiRoleWithScopesResponse> {
        const loadScopes = load === 'scopes';
        const roles = await this.getRolesService().getRolesByOrganizationUuid(
            req.account!,
            orgUuid,
            loadScopes,
            roleTypeFilter,
        );

        this.setStatus(200);
        return {
            status: 'ok',
            results: roles,
        };
    }

    /**
     * List organization role assignments (system roles only)
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
     * Get custom role by uuid
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/{roleUuid}')
    @OperationId('GetCustomRoleByUuid')
    async getCustomRoleByUuid(
        @Request() req: express.Request,
        @Path() orgUuid: string,
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
     * Assign system role to user at organization level
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Post('/assignments/user/{userId}')
    @OperationId('UpsertOrganizationUserRoleAssignment')
    async upsertOrganizationUserRoleAssignment(
        @Request() req: express.Request,
        @Path() orgUuid: string,
        @Path() userId: string,
        @Body() body: { roleId: string },
    ): Promise<ApiRoleAssignmentResponse> {
        const assignment =
            await this.getRolesService().upsertOrganizationUserRoleAssignment(
                req.account!,
                orgUuid,
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
     * Duplicate a role
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('201', 'Role duplicated')
    @Post('/{roleId}/duplicate')
    @OperationId('DuplicateRole')
    async duplicateRole(
        @Request() req: express.Request,
        @Path() orgUuid: string,
        @Path() roleId: string,
        @Body() body: CreateRole,
    ): Promise<ApiRoleWithScopesResponse> {
        const duplicatedRole = await this.getRolesService().duplicateRole(
            req.account!,
            orgUuid,
            roleId,
            body,
        );

        this.setStatus(201);
        return {
            status: 'ok',
            results: duplicatedRole,
        };
    }
}
