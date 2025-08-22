import {
    AddScopesToRole,
    ApiErrorPayload,
    ApiRemoveScopeFromRoleResponse,
    ApiRoleWithScopesResponse,
    ApiUnassignRoleFromUserResponse,
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
import { RolesService } from '../../services/RolesService/RolesService';

/**
 * This controller handles all role management operations with the new namespace structure:
 * Check ProjectRolesController.ts and OrganizationRolesController.ts for using these roles.
 *
 * Role Management: /api/v2/roles
 * - Creating, reading, updating, and deleting roles
 *
 * Role scope management: /api/v2/roles/{roleUuid}/scopes
 * - Adding scopes to roles
 * - Removing scopes from roles
 *
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
        return this.services.getRolesService();
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
