import {
    ApiCreateScimTokenRequest,
    ApiErrorPayload,
    ScimErrorPayload,
    ScimOrganizationAccessToken,
    ScimOrganizationAccessTokenWithToken,
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
import { ScimService } from '../services/ScimService/ScimService';

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
    @Response<ScimOrganizationAccessToken[]>('200', 'Success')
    async getOrganizationAccessTokens(
        @Request() req: express.Request,
    ): Promise<{ status: 'ok'; results: ScimOrganizationAccessToken[] }> {
        const results =
            await this.getScimService().listOrganizationAccessTokens(req.user!);
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
    @Response<ScimOrganizationAccessToken>('201', 'Created')
    @Response<ScimErrorPayload>('400', 'Bad request')
    async createOrganizationAccessToken(
        @Request() req: express.Request,
        @Body() body: ApiCreateScimTokenRequest,
    ): Promise<{ status: 'ok'; results: ScimOrganizationAccessToken }> {
        const token = await this.getScimService().createOrganizationAccessToken(
            {
                user: req.user!,
                tokenDetails: {
                    ...body,
                    organizationUuid: req.user?.organizationUuid as string,
                },
            },
        );
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
        await this.getScimService().deleteOrganizationAccessToken({
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
    ): Promise<{ status: 'ok'; results: ScimOrganizationAccessToken }> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getScimService().getOrganizationAccessToken({
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
        results: ScimOrganizationAccessTokenWithToken;
    }> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getScimService().rotateOrganizationAccessToken({
                user: req.user!,
                tokenUuid,
                update: body,
            }),
        };
    }

    // Convenience method to access the SCIM service
    protected getScimService() {
        return this.services.getScimService<ScimService>();
    }
}
