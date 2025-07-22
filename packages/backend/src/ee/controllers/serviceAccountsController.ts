import {
    ApiCreateServiceAccountRequest,
    ApiErrorPayload,
    AuthTokenPrefix,
    ServiceAccount,
    ServiceAccountScope,
} from '@lightdash/common';
import {
    Body,
    Delete,
    Get,
    Hidden,
    Middlewares,
    OperationId,
    Path,
    Post,
    Request,
    Response,
    Route,
    Tags,
} from '@tsoa/runtime';
import express from 'express';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
} from '../../controllers/authentication';
import { BaseController } from '../../controllers/baseController';
import { ServiceAccountService } from '../services/ServiceAccountService/ServiceAccountService';

@Route('/api/v1/service-accounts')
@Hidden()
@Response<ApiErrorPayload>('default', 'Error')
@Tags('service-accounts')
export class ServiceAccountsController extends BaseController {
    /**
     * Get a list of service accounts for the organization
     * @param req express request
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @Get('/')
    @OperationId('getServiceAccounts')
    @Response<ServiceAccount[]>('200', 'Success')
    async getServiceAccounts(
        @Request() req: express.Request,
    ): Promise<{ status: 'ok'; results: ServiceAccount[] }> {
        // Here all scopes but scim to get all non scim service accounts
        const scopes = Object.values(ServiceAccountScope).filter(
            (scope) => scope !== ServiceAccountScope.SCIM_MANAGE,
        );
        const results = await this.getServiceAccountService().list(
            req.user!,
            scopes,
        );
        this.setStatus(200);
        return {
            status: 'ok',
            results,
        };
    }

    /**
     * Create a new service account for the organization
     * @param req express request
     * @param body service account details
     */
    @Middlewares([isAuthenticated])
    @Post('/')
    @OperationId('CreateServiceAccount')
    @Response<ServiceAccount>('201', 'Created')
    async createServiceAccount(
        @Request() req: express.Request,
        @Body() body: ApiCreateServiceAccountRequest,
    ): Promise<{ status: 'ok'; results: ServiceAccount }> {
        const token = await this.getServiceAccountService().create({
            user: req.user!,
            tokenDetails: {
                ...body,
                organizationUuid: req.user?.organizationUuid as string,
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
     * Delete an access token by ID
     * @param req express request
     * @param tokenUuid UUID of the access token to delete
     */
    @Middlewares([isAuthenticated])
    @Delete('/{tokenUuid}')
    @OperationId('DeleteServiceAccount')
    @Response('204', 'No content')
    async deleteServiceAccount(
        @Request() req: express.Request,
        @Path() tokenUuid: string,
    ): Promise<{ status: 'ok'; results: undefined }> {
        await this.getServiceAccountService().delete({
            user: req.user!,
            tokenUuid,
        });
        return {
            status: 'ok',
            results: undefined,
        };
    }

    protected getServiceAccountService() {
        return this.services.getServiceAccountService<ServiceAccountService>();
    }
}
