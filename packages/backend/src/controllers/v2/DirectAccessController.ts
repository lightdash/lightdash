import {
    assertRegisteredAccount,
    type ApiDirectAccessGrantResponse,
    type ApiDirectAccessListResponse,
    type ApiErrorPayload,
    type ApiSuccessEmpty,
    type DirectAccessResourceType,
    type DirectAccessRoleAssignment,
    type KnexPaginateArgs,
} from '@lightdash/common';
import {
    Body,
    Delete,
    Get,
    Middlewares,
    OperationId,
    Path,
    Put,
    Query,
    Request,
    Response,
    Route,
    SuccessResponse,
    Tags,
} from '@tsoa/runtime';
import express from 'express';
import { toSessionUser } from '../../auth/account';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
} from '../authentication/middlewares';
import { BaseController } from '../baseController';

@Route('/api/v2/projects/{projectUuid}/access/{resourceType}/{resourceUuid}')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('v2', 'Direct access')
export class DirectAccessController extends BaseController {
    /**
     * List direct grants for a resource.
     * @summary List direct access
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/')
    @OperationId('listResourceDirectAccess')
    async listAccess(
        @Path() projectUuid: string,
        @Path() resourceType: DirectAccessResourceType,
        @Path() resourceUuid: string,
        @Request() req: express.Request,
        @Query() page?: number,
        @Query() pageSize?: number,
        @Query() searchQuery?: string,
    ): Promise<ApiDirectAccessListResponse> {
        assertRegisteredAccount(req.account);
        const paginateArgs: KnexPaginateArgs | undefined =
            page !== undefined || pageSize !== undefined
                ? { page: page ?? 1, pageSize: pageSize ?? 100 }
                : undefined;
        return {
            status: 'ok',
            results: await this.services
                .getDirectAccessService()
                .getHandler(resourceType)
                .listAccess({
                    user: toSessionUser(req.account),
                    projectUuid,
                    resourceUuid,
                    paginateArgs,
                    filters: { searchQuery },
                }),
        };
    }

    /**
     * Replace a user's direct role on a resource.
     * @summary Replace user direct access
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Put('/users/{userUuid}')
    @OperationId('replaceResourceUserDirectAccess')
    async replaceUserRole(
        @Path() projectUuid: string,
        @Path() resourceType: DirectAccessResourceType,
        @Path() resourceUuid: string,
        @Path() userUuid: string,
        @Body() body: DirectAccessRoleAssignment,
        @Request() req: express.Request,
    ): Promise<ApiDirectAccessGrantResponse> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.services
                .getDirectAccessService()
                .getHandler(resourceType)
                .replaceUserRole({
                    user: toSessionUser(req.account),
                    projectUuid,
                    resourceUuid,
                    userUuid,
                    role: body.role,
                }),
        };
    }

    /**
     * Revoke a user's direct role on a resource.
     * @summary Revoke user direct access
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Delete('/users/{userUuid}')
    @OperationId('revokeResourceUserDirectAccess')
    async revokeUser(
        @Path() projectUuid: string,
        @Path() resourceType: DirectAccessResourceType,
        @Path() resourceUuid: string,
        @Path() userUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiSuccessEmpty> {
        assertRegisteredAccount(req.account);
        await this.services
            .getDirectAccessService()
            .getHandler(resourceType)
            .revokeUser({
                user: toSessionUser(req.account),
                projectUuid,
                resourceUuid,
                userUuid,
            });
        return { status: 'ok', results: undefined };
    }

    /**
     * Replace a group's direct role on a resource.
     * @summary Replace group direct access
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Put('/groups/{groupUuid}')
    @OperationId('replaceResourceGroupDirectAccess')
    async replaceGroupRole(
        @Path() projectUuid: string,
        @Path() resourceType: DirectAccessResourceType,
        @Path() resourceUuid: string,
        @Path() groupUuid: string,
        @Body() body: DirectAccessRoleAssignment,
        @Request() req: express.Request,
    ): Promise<ApiDirectAccessGrantResponse> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.services
                .getDirectAccessService()
                .getHandler(resourceType)
                .replaceGroupRole({
                    user: toSessionUser(req.account),
                    projectUuid,
                    resourceUuid,
                    groupUuid,
                    role: body.role,
                }),
        };
    }

    /**
     * Revoke a group's direct role on a resource.
     * @summary Revoke group direct access
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Delete('/groups/{groupUuid}')
    @OperationId('revokeResourceGroupDirectAccess')
    async revokeGroup(
        @Path() projectUuid: string,
        @Path() resourceType: DirectAccessResourceType,
        @Path() resourceUuid: string,
        @Path() groupUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiSuccessEmpty> {
        assertRegisteredAccount(req.account);
        await this.services
            .getDirectAccessService()
            .getHandler(resourceType)
            .revokeGroup({
                user: toSessionUser(req.account),
                projectUuid,
                resourceUuid,
                groupUuid,
            });
        return { status: 'ok', results: undefined };
    }

    /**
     * Revoke every direct grant on a resource.
     * @summary Reset direct access
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Delete('/')
    @OperationId('resetResourceDirectAccess')
    async resetAccess(
        @Path() projectUuid: string,
        @Path() resourceType: DirectAccessResourceType,
        @Path() resourceUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiSuccessEmpty> {
        assertRegisteredAccount(req.account);
        await this.services
            .getDirectAccessService()
            .getHandler(resourceType)
            .reset({
                user: toSessionUser(req.account),
                projectUuid,
                resourceUuid,
            });
        return { status: 'ok', results: undefined };
    }
}
