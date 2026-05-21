import {
    AddScopesToRole,
    ApiDefaultRoleResponse,
    ApiErrorPayload,
    ApiRemoveScopeFromRoleResponse,
    ApiRoleAssigneesResponse,
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

/**
 * EE Custom Roles API
 *
 * This API is only available for enterprise customers.
 * EE custom role management endpoints under organization scope:
 * - POST / - Create custom organization role
 * - PATCH /{roleUuid} - Update custom organization role
 * - DELETE /{roleUuid} - Delete custom organization role
 * - POST /{roleUuid}/scopes - Add scopes to custom organization role
 * - DELETE /{roleUuid}/scopes/{scopeName} - Remove scope from custom organization role
 *
 * For read-only operations (GET endpoints), see the OSS Organization Roles API
 */
@Route('/api/v2/orgs/{orgUuid}/roles')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('v2', 'Custom Roles')
export class CustomRolesController extends BaseController {
    /**
     * Convenience method to access the roles service without having
     * to specify an interface type.
     */
    protected getRolesService() {
        return this.services.getRolesService();
    }

    /**
     * Create a new role in organization
     * @summary Create custom role
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
     * @summary Update custom role
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
            orgUuid,
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
     * @summary Delete custom role
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
     * List the users, groups, and service accounts currently assigned to a role.
     * Used by the delete-confirmation modal to explain why a role cannot
     * be deleted while still in use.
     * @summary List role assignees
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/{roleUuid}/assignees')
    @OperationId('GetOrganizationRoleAssignees')
    async getOrganizationRoleAssignees(
        @Request() req: express.Request,
        @Path() orgUuid: string,
        @Path() roleUuid: string,
    ): Promise<ApiRoleAssigneesResponse> {
        const assignees = await this.getRolesService().getRoleAssignees(
            req.account!,
            roleUuid,
        );

        this.setStatus(200);
        return {
            status: 'ok',
            results: assignees,
        };
    }

    /**
     * Add scopes to role
     * @summary Add scopes to role
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
        @Path() orgUuid: string,
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
     * @summary Remove scope from role
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
        @Path() orgUuid: string,
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
