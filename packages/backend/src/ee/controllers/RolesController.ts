import {
    AddScopesToRole,
    ApiDefaultRoleResponse,
    ApiDeleteRoleResponse,
    ApiErrorPayload,
    ApiRemoveScopeFromRoleResponse,
    ApiRoleWithScopesResponse,
    ApiUnassignRoleFromUserResponse,
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
 * Unified Roles API
 *
 * This controller handles all role management operations with the new namespace structure:
 *
 * Role Management: /api/v2/roles
 * - Creating, reading, updating, and deleting roles
 * - Managing role scopes (permissions)
 *
 * Organization Role Assignments: /api/v2/orgs/{orgId}/roles
 * - Listing roles for an organization
 * - Creating roles in an organization
 * - Managing role assignments within an organization
 *
 * Project Role Assignments: /api/v2/projects/{projectId}/roles
 * - Managing role assignments within a project
 * - Assigning users and groups to projects with specific roles
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

    // =====================================
    // ROLE MANAGEMENT
    // =====================================

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
