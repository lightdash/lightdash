import {
    ApiErrorPayload,
    ApiGetRolesResponse,
    ApiOrganizationRoleSetResponse,
    ApiRoleAssignmentListResponse,
    ApiRoleAssignmentResponse,
    ApiRoleWithScopesResponse,
    CreateRole,
    OrganizationRoleSet,
    type UUID,
} from '@lightdash/common';
import {
    Body,
    Get,
    Middlewares,
    OperationId,
    Path,
    Post,
    Put,
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
     * @summary Get organization roles
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get()
    @OperationId('GetOrganizationRoles')
    async getOrganizationRoles(
        @Request() req: express.Request,
        @Path() orgUuid: UUID,
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
     * List organization role assignments
     * @summary List organization role assignments
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/assignments')
    @OperationId('GetOrganizationRoleAssignments')
    async getOrganizationRoleAssignments(
        @Request() req: express.Request,
        @Path() orgUuid: UUID,
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
     * @summary Get custom role
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/{roleUuid}')
    @OperationId('GetCustomRoleByUuid')
    async getCustomRoleByUuid(
        @Request() req: express.Request,
        @Path() orgUuid: UUID,
        @Path() roleUuid: UUID,
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
     * Assign system or organization-level custom role to user at organization level
     * @summary Assign organization role to user
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
        @Path() orgUuid: UUID,
        @Path() userId: UUID,
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
     * Get the complete role set (system role plus custom roles) a user holds in the organization.
     * Requires custom roles (Enterprise).
     * @summary Get organization role set for user
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/assignments/user/{userId}/set')
    @OperationId('GetOrganizationUserRoleSet')
    async getOrganizationUserRoleSet(
        @Request() req: express.Request,
        @Path() orgUuid: UUID,
        @Path() userId: UUID,
    ): Promise<ApiOrganizationRoleSetResponse> {
        const results = await this.getRolesService().getOrganizationUserRoleSet(
            req.account!,
            orgUuid,
            userId,
        );
        this.setStatus(200);
        return { status: 'ok', results };
    }

    /**
     * Atomically replace the complete role set a user holds in the organization.
     * At most one system role plus any number of custom roles; the set must not be empty.
     * Requires custom roles (Enterprise).
     * @summary Replace organization role set for user
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Put('/assignments/user/{userId}/set')
    @OperationId('ReplaceOrganizationUserRoleSet')
    async replaceOrganizationUserRoleSet(
        @Request() req: express.Request,
        @Path() orgUuid: UUID,
        @Path() userId: UUID,
        @Body() body: OrganizationRoleSet,
    ): Promise<ApiOrganizationRoleSetResponse> {
        const results =
            await this.getRolesService().replaceOrganizationUserRoleSet(
                req.account!,
                orgUuid,
                userId,
                body,
            );
        this.setStatus(200);
        return { status: 'ok', results };
    }

    /**
     * Duplicate a role
     * @summary Duplicate role
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
        @Path() orgUuid: UUID,
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
