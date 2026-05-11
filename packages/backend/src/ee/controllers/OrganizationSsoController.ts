import {
    ApiAzureAdSsoConfigResponse,
    ApiErrorPayload,
    ApiSuccessEmpty,
    ApiUpsertAzureAdSsoConfigResponse,
    assertRegisteredAccount,
    UpsertAzureAdSsoConfig,
} from '@lightdash/common';
import {
    Body,
    Delete,
    Get,
    Middlewares,
    OperationId,
    Put,
    Request,
    Response,
    Route,
    Tags,
} from '@tsoa/runtime';
import express from 'express';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
} from '../../controllers/authentication';
import { BaseController } from '../../controllers/baseController';

@Route('/api/v1/org/sso')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Organizations')
export class OrganizationSsoController extends BaseController {
    /**
     * Returns the current organization's Azure AD SSO configuration (sensitive
     * fields are not included).
     * @summary Get Azure AD SSO configuration
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @Get('/azuread')
    @OperationId('GetAzureAdSsoConfig')
    async getAzureAdConfig(
        @Request() req: express.Request,
    ): Promise<ApiAzureAdSsoConfigResponse> {
        assertRegisteredAccount(req.account);
        const results = await this.services
            .getOrganizationSsoService()
            .getAzureAdConfig(req.account);
        this.setStatus(200);
        return { status: 'ok', results };
    }

    /**
     * Creates or updates the current organization's Azure AD SSO configuration.
     * Omit `oauth2ClientSecret` to preserve the previously stored secret on
     * updates.
     * @summary Upsert Azure AD SSO configuration
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @Put('/azuread')
    @OperationId('UpsertAzureAdSsoConfig')
    async upsertAzureAdConfig(
        @Request() req: express.Request,
        @Body() body: UpsertAzureAdSsoConfig,
    ): Promise<ApiUpsertAzureAdSsoConfigResponse> {
        assertRegisteredAccount(req.account);
        const results = await this.services
            .getOrganizationSsoService()
            .upsertAzureAdConfig(req.account, body);
        this.setStatus(200);
        return { status: 'ok', results };
    }

    /**
     * Removes the current organization's Azure AD SSO configuration.
     * @summary Delete Azure AD SSO configuration
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @Delete('/azuread')
    @OperationId('DeleteAzureAdSsoConfig')
    async deleteAzureAdConfig(
        @Request() req: express.Request,
    ): Promise<ApiSuccessEmpty> {
        assertRegisteredAccount(req.account);
        await this.services
            .getOrganizationSsoService()
            .deleteAzureAdConfig(req.account);
        this.setStatus(200);
        return { status: 'ok', results: undefined };
    }
}
