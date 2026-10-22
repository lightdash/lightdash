import {
    ApiCreateServiceAccountRequest,
    ApiErrorPayload,
    ApiServiceAccountProjectGrantsResponse,
    ApiSuccessEmpty,
    ApiUpdateServiceAccountRequest,
    assertRegisteredAccount,
    AuthTokenPrefix,
    ServiceAccount,
    ServiceAccountScope,
    ServiceAccountWithProjectAccessCount,
    ServiceAccountWithToken,
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
import { toSessionUser } from '../../auth/account';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
} from '../../controllers/authentication';
import { BaseController } from '../../controllers/baseController';
import { ServiceAccountService } from '../services/ServiceAccountService/ServiceAccountService';

@Route('/api/v1/service-accounts')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Service Accounts')
export class ServiceAccountsController extends BaseController {
    /**
     * List the organization's service accounts, excluding SCIM-only tokens.
     * Requires organization administration permission. Tokens are never returned.
     * @summary List service accounts
     * @param req express request
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @Get('/')
    @OperationId('getServiceAccounts')
    @SuccessResponse('200', 'Success')
    async getServiceAccounts(@Request() req: express.Request): Promise<{
        status: 'ok';
        results: ServiceAccountWithProjectAccessCount[];
    }> {
        assertRegisteredAccount(req.account);
        // Here all scopes but scim to get all non scim service accounts
        const scopes = Object.values(ServiceAccountScope).filter(
            (scope) => scope !== ServiceAccountScope.SCIM_MANAGE,
        );
        const results = await this.getServiceAccountService().list(
            toSessionUser(req.account),
            scopes,
        );
        this.setStatus(200);
        return {
            status: 'ok',
            results,
        };
    }

    /**
     * List a service account's project grants. Requires organization
     * administration permission in the account's organization.
     * @summary List service-account project grants
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/{serviceAccountUuid}/projects')
    @OperationId('GetServiceAccountProjectGrants')
    async getServiceAccountProjectGrants(
        @Path() serviceAccountUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiServiceAccountProjectGrantsResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        const results = await this.getServiceAccountService().getProjectGrants(
            toSessionUser(req.account),
            serviceAccountUuid,
        );
        return { status: 'ok', results };
    }

    /**
     * Create a service account using an admin session, personal access token,
     * or service account token. Requires organization administration permission.
     * Specify either organization scopes or an organization custom role UUID.
     * For project access, use scopes ["system:member"] and projectAccess grants.
     * The returned token is only available on creation; store it securely.
     * @summary Create service account
     * @param req express request
     * @param body service account details
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @Post('/')
    @OperationId('CreateServiceAccount')
    @SuccessResponse('201', 'Created')
    async createServiceAccount(
        @Request() req: express.Request,
        @Body() body: ApiCreateServiceAccountRequest,
    ): Promise<{ status: 'ok'; results: ServiceAccountWithToken }> {
        assertRegisteredAccount(req.account);
        const token = await this.getServiceAccountService().create({
            user: toSessionUser(req.account),
            tokenDetails: {
                ...body,
                organizationUuid: req.account.organization
                    .organizationUuid as string,
            },
            prefix: AuthTokenPrefix.SERVICE_ACCOUNT,
        });
        this.setStatus(201);
        return {
            status: 'ok',
            results: token,
        };
    }

    /**
     * Revoke a service account by UUID. Requires organization administration
     * permission in the account's organization. Its token immediately stops working.
     * @summary Delete service account
     * @param req express request
     * @param tokenUuid UUID of the access token to delete
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @Delete('/{tokenUuid}')
    @OperationId('DeleteServiceAccount')
    @SuccessResponse('200', 'Success')
    async deleteServiceAccount(
        @Request() req: express.Request,
        @Path() tokenUuid: string,
    ): Promise<ApiSuccessEmpty> {
        assertRegisteredAccount(req.account);
        await this.getServiceAccountService().delete({
            user: toSessionUser(req.account),
            tokenUuid,
        });
        this.setStatus(200);
        return {
            status: 'ok',
            results: undefined,
        };
    }

    /**
     * Update a service account's name and permissions in place by UUID,
     * without rotating its token. Requires organization administration permission.
     * Providing projectAccess replaces all project grants. Omit all permission
     * fields to preserve existing permissions. Grants are limited to the caller's
     * organization permissions.
     * @summary Update service account
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Patch('/{tokenUuid}')
    @OperationId('UpdateServiceAccount')
    async updateServiceAccount(
        @Path() tokenUuid: string,
        @Request() req: express.Request,
        @Body() body: ApiUpdateServiceAccountRequest,
    ): Promise<{
        status: 'ok';
        results: ServiceAccount;
    }> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getServiceAccountService().update({
                user: toSessionUser(req.account),
                tokenUuid,
                update: body,
            }),
        };
    }

    /**
     * Rotate an expiring service account's token. Requires organization
     * administration permission. The old token is immediately revoked and the
     * replacement is returned once. Rotation is limited to once per hour.
     * @summary Rotate service account
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Patch('/{tokenUuid}/rotate')
    @OperationId('RotateServiceAccount')
    async rotateServiceAccount(
        @Path() tokenUuid: string,
        @Request() req: express.Request,
        @Body()
        body: {
            expiresAt: Date;
        },
    ): Promise<{
        status: 'ok';
        results: ServiceAccountWithToken;
    }> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getServiceAccountService().rotate({
                user: toSessionUser(req.account),
                tokenUuid,
                update: body,
                prefix: AuthTokenPrefix.SERVICE_ACCOUNT,
            }),
        };
    }

    protected getServiceAccountService() {
        return this.services.getServiceAccountService<ServiceAccountService>();
    }
}
