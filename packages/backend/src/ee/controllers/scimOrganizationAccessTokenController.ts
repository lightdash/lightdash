import {
    ApiCreateScimServiceAccountRequest,
    ApiErrorPayload,
    AuthTokenPrefix,
    ScimErrorPayload,
    ServiceAccount,
    ServiceAccountScope,
    ServiceAccountWithToken,
} from '@lightdash/common';
import {
    Body,
    Delete,
    Get,
    Hidden,
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
import { ServiceAccountService } from '../services/ServiceAccountService/ServiceAccountService';

const SCIM_SCOPES = [ServiceAccountScope.SCIM_MANAGE];

@Route('/api/v1/scim/organization-access-tokens')
@Hidden()
@Response<ApiErrorPayload>('default', 'Error')
@Tags('SCIM')
export class ScimOrganizationAccessTokenController extends BaseController {
    /**
     * Get a list of access tokens for the organization
     * @param req express request
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @Get('/')
    @OperationId('GetScimOrganizationAccessTokens')
    @Response<ServiceAccount[]>('200', 'Success')
    async getOrganizationAccessTokens(
        @Request() req: express.Request,
    ): Promise<{ status: 'ok'; results: ServiceAccount[] }> {
        const results = await this.getServiceAccountService().list(
            req.user!,
            SCIM_SCOPES,
        );
        this.setStatus(200);
        return {
            status: 'ok',
            results,
        };
    }

    /**
     * Create a new access token for the organization
     * @param req express request
     * @param body Access token details
     */
    @Middlewares([isAuthenticated])
    @Post('/')
    @OperationId('CreateScimOrganizationAccessToken')
    @Response<ServiceAccount>('201', 'Created')
    @Response<ScimErrorPayload>('400', 'Bad request')
    async createOrganizationAccessToken(
        @Request() req: express.Request,
        @Body() body: ApiCreateScimServiceAccountRequest, // Service account request without scopes
    ): Promise<{ status: 'ok'; results: ServiceAccount }> {
        const token = await this.getServiceAccountService().create({
            user: req.user!,
            tokenDetails: {
                ...body,
                organizationUuid: req.user?.organizationUuid as string,
                scopes: SCIM_SCOPES,
            },
            prefix: AuthTokenPrefix.SCIM,
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
    @OperationId('DeleteScimOrganizationAccessToken')
    @Response('204', 'No content')
    @Response<ScimErrorPayload>('404', 'Not found')
    async deleteOrganizationAccessToken(
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

    /**
     * Get token by UUID
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Get('/{tokenUuid}')
    @OperationId('Get SCIM Access Token')
    async getOrganizationAccessToken(
        @Path() tokenUuid: string,
        @Request() req: express.Request,
    ): Promise<{ status: 'ok'; results: ServiceAccount }> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getServiceAccountService().get({
                user: req.user!,
                tokenUuid,
            }),
        };
    }

    /**
     * Rotate an access token by UUID
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Patch('/{tokenUuid}/rotate')
    @OperationId('Rotate SCIM Access Token')
    async rotateOrganizationAccessToken(
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
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getServiceAccountService().rotate({
                user: req.user!,
                tokenUuid,
                update: body,
                prefix: AuthTokenPrefix.SCIM,
            }),
        };
    }

    // Convenience method to access the getServiceAccountService
    protected getServiceAccountService() {
        return this.services.getServiceAccountService<ServiceAccountService>();
    }
}
