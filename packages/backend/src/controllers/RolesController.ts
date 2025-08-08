import {
    AddScopeToRole,
    ApiAddScopeToRoleResponse,
    ApiCreateRoleResponse,
    ApiDeleteRoleResponse,
    ApiErrorPayload,
    ApiGetRoleResponse,
    ApiGetRolesResponse,
    ApiGetScopesResponse,
    ApiRemoveScopeFromRoleResponse,
    ApiRemoveScopesFromRoleResponse,
    ApiUpdateRoleResponse,
    CreateRole,
    RemoveScopesFromRole,
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
import { allowApiKeyAuthentication, isAuthenticated } from './authentication';
import { BaseController } from './baseController';

@Route('/api/v1/organizations/{organizationUuid}/roles')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Roles')
@Middlewares([allowApiKeyAuthentication, isAuthenticated])
export class RolesController extends BaseController {
    /**
     * Get all roles for an organization
     * @summary List organization roles
     */

    @SuccessResponse('200', 'Success')
    @Get()
    @OperationId('getOrganizationRoles')
    async getRoles(
        @Path() organizationUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiGetRolesResponse> {
        const roles = await this.services
            .getRolesService()
            .listRolesByOrganization(req.account!, organizationUuid);

        this.setStatus(200);
        return {
            status: 'ok',
            results: roles,
        };
    }

    /**
     * Create a new role in an organization
     * @summary Create role
     */
    @SuccessResponse('201', 'Created')
    @Post()
    @OperationId('createOrganizationRole')
    async createRole(
        @Path() organizationUuid: string,
        @Body() body: CreateRole,
        @Request() req: express.Request,
    ): Promise<ApiCreateRoleResponse> {
        const role = await this.services
            .getRolesService()
            .createRole(req.account!, organizationUuid, body);

        this.setStatus(201);
        return {
            status: 'ok',
            results: role,
        };
    }

    /**
     * Get all available scopes
     * @summary List all scopes
     */
    @SuccessResponse('200', 'Success')
    @Get('/scopes')
    @OperationId('getAllScopes')
    async getAllScopes(
        @Path() organizationUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiGetScopesResponse> {
        const scopes = await this.services
            .getRolesService()
            .getAllScopes(req.account!);

        this.setStatus(200);
        return {
            status: 'ok',
            results: scopes,
        };
    }

    /**
     * Get a specific role with its scopes
     * @summary Get role details
     */
    @SuccessResponse('200', 'Success')
    @Get('{roleUuid}')
    @OperationId('getOrganizationRole')
    async getRole(
        @Path() organizationUuid: string,
        @Path() roleUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiGetRoleResponse> {
        const role = await this.services
            .getRolesService()
            .getRoleWithScopes(req.account!, organizationUuid, roleUuid);

        this.setStatus(200);
        return {
            status: 'ok',
            results: role,
        };
    }

    /**
     * Update a role's details
     * @summary Update role
     */
    @SuccessResponse('200', 'Success')
    @Patch('{roleUuid}')
    @OperationId('updateOrganizationRole')
    async updateRole(
        @Path() organizationUuid: string,
        @Path() roleUuid: string,
        @Body() body: UpdateRole,
        @Request() req: express.Request,
    ): Promise<ApiUpdateRoleResponse> {
        const role = await this.services
            .getRolesService()
            .updateRole(req.account!, organizationUuid, roleUuid, body);

        this.setStatus(200);
        return {
            status: 'ok',
            results: role,
        };
    }

    /**
     * Delete a role from an organization
     * @summary Delete role
     */
    @SuccessResponse('200', 'Success')
    @Delete('{roleUuid}')
    @OperationId('deleteOrganizationRole')
    async deleteRole(
        @Path() organizationUuid: string,
        @Path() roleUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiDeleteRoleResponse> {
        await this.services
            .getRolesService()
            .deleteRole(req.account!, organizationUuid, roleUuid);

        this.setStatus(200);
        return {
            status: 'ok',
            results: undefined,
        };
    }

    /**
     * Add scopes to a role
     * @summary Add scopes to role
     */
    @SuccessResponse('201', 'Created')
    @Post('{roleUuid}/scopes')
    @OperationId('addScopesToRole')
    async addScopesToRole(
        @Path() organizationUuid: string,
        @Path() roleUuid: string,
        @Body() body: AddScopeToRole,
        @Request() req: express.Request,
    ): Promise<ApiAddScopeToRoleResponse> {
        const scopes = await this.services
            .getRolesService()
            .addScopesToRole(req.account!, organizationUuid, roleUuid, body);

        this.setStatus(201);
        return {
            status: 'ok',
            results: scopes,
        };
    }

    /**
     * Remove multiple scopes from a role
     * @summary Remove scopes from role
     */
    @SuccessResponse('200', 'Success')
    @Delete('{roleUuid}/scopes')
    @OperationId('removeScopesFromRole')
    async removeScopesFromRole(
        @Path() organizationUuid: string,
        @Path() roleUuid: string,
        @Body() body: RemoveScopesFromRole,
        @Request() req: express.Request,
    ): Promise<ApiRemoveScopesFromRoleResponse> {
        await this.services
            .getRolesService()
            .removeScopesFromRole(
                req.account!,
                organizationUuid,
                roleUuid,
                body,
            );

        this.setStatus(200);
        return {
            status: 'ok',
            results: undefined,
        };
    }
}
