import {
    ApiAzureAdSsoConfigResponse,
    ApiErrorPayload,
    ApiGenericOidcSsoConfigResponse,
    ApiGoogleSsoConfigResponse,
    ApiOktaSsoConfigResponse,
    ApiOneLoginSsoConfigResponse,
    ApiSuccessEmpty,
    ApiUpsertAzureAdSsoConfigResponse,
    ApiUpsertGenericOidcSsoConfigResponse,
    ApiUpsertGoogleSsoConfigResponse,
    ApiUpsertOktaSsoConfigResponse,
    ApiUpsertOneLoginSsoConfigResponse,
    assertRegisteredAccount,
    UpsertAzureAdSsoConfig,
    UpsertGenericOidcSsoConfig,
    UpsertGoogleSsoConfig,
    UpsertOktaSsoConfig,
    UpsertOneLoginSsoConfig,
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

    /**
     * Returns the current organization's Okta SSO configuration (sensitive
     * fields are not included).
     * @summary Get Okta SSO configuration
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @Get('/okta')
    @OperationId('GetOktaSsoConfig')
    async getOktaConfig(
        @Request() req: express.Request,
    ): Promise<ApiOktaSsoConfigResponse> {
        assertRegisteredAccount(req.account);
        const results = await this.services
            .getOrganizationSsoService()
            .getOktaConfig(req.account);
        this.setStatus(200);
        return { status: 'ok', results };
    }

    /**
     * Creates or updates the current organization's Okta SSO configuration.
     * Omit `oauth2ClientSecret` to preserve the previously stored secret on
     * updates.
     * @summary Upsert Okta SSO configuration
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @Put('/okta')
    @OperationId('UpsertOktaSsoConfig')
    async upsertOktaConfig(
        @Request() req: express.Request,
        @Body() body: UpsertOktaSsoConfig,
    ): Promise<ApiUpsertOktaSsoConfigResponse> {
        assertRegisteredAccount(req.account);
        const results = await this.services
            .getOrganizationSsoService()
            .upsertOktaConfig(req.account, body);
        this.setStatus(200);
        return { status: 'ok', results };
    }

    /**
     * Removes the current organization's Okta SSO configuration.
     * @summary Delete Okta SSO configuration
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @Delete('/okta')
    @OperationId('DeleteOktaSsoConfig')
    async deleteOktaConfig(
        @Request() req: express.Request,
    ): Promise<ApiSuccessEmpty> {
        assertRegisteredAccount(req.account);
        await this.services
            .getOrganizationSsoService()
            .deleteOktaConfig(req.account);
        this.setStatus(200);
        return { status: 'ok', results: undefined };
    }

    /**
     * Returns the current organization's generic OIDC SSO configuration
     * (sensitive fields are not included).
     * @summary Get generic OIDC SSO configuration
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @Get('/oidc')
    @OperationId('GetGenericOidcSsoConfig')
    async getGenericOidcConfig(
        @Request() req: express.Request,
    ): Promise<ApiGenericOidcSsoConfigResponse> {
        assertRegisteredAccount(req.account);
        const results = await this.services
            .getOrganizationSsoService()
            .getGenericOidcConfig(req.account);
        this.setStatus(200);
        return { status: 'ok', results };
    }

    /**
     * Creates or updates the current organization's generic OIDC SSO
     * configuration. Omit `clientSecret` to preserve the previously stored
     * secret on updates.
     * @summary Upsert generic OIDC SSO configuration
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @Put('/oidc')
    @OperationId('UpsertGenericOidcSsoConfig')
    async upsertGenericOidcConfig(
        @Request() req: express.Request,
        @Body() body: UpsertGenericOidcSsoConfig,
    ): Promise<ApiUpsertGenericOidcSsoConfigResponse> {
        assertRegisteredAccount(req.account);
        const results = await this.services
            .getOrganizationSsoService()
            .upsertGenericOidcConfig(req.account, body);
        this.setStatus(200);
        return { status: 'ok', results };
    }

    /**
     * Removes the current organization's generic OIDC SSO configuration.
     * @summary Delete generic OIDC SSO configuration
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @Delete('/oidc')
    @OperationId('DeleteGenericOidcSsoConfig')
    async deleteGenericOidcConfig(
        @Request() req: express.Request,
    ): Promise<ApiSuccessEmpty> {
        assertRegisteredAccount(req.account);
        await this.services
            .getOrganizationSsoService()
            .deleteGenericOidcConfig(req.account);
        this.setStatus(200);
        return { status: 'ok', results: undefined };
    }

    /**
     * Returns the current organization's OneLogin SSO configuration (sensitive
     * fields are not included).
     * @summary Get OneLogin SSO configuration
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @Get('/oneLogin')
    @OperationId('GetOneLoginSsoConfig')
    async getOneLoginConfig(
        @Request() req: express.Request,
    ): Promise<ApiOneLoginSsoConfigResponse> {
        assertRegisteredAccount(req.account);
        const results = await this.services
            .getOrganizationSsoService()
            .getOneLoginConfig(req.account);
        this.setStatus(200);
        return { status: 'ok', results };
    }

    /**
     * Creates or updates the current organization's OneLogin SSO
     * configuration. Omit `oauth2ClientSecret` to preserve the previously
     * stored secret on updates.
     * @summary Upsert OneLogin SSO configuration
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @Put('/oneLogin')
    @OperationId('UpsertOneLoginSsoConfig')
    async upsertOneLoginConfig(
        @Request() req: express.Request,
        @Body() body: UpsertOneLoginSsoConfig,
    ): Promise<ApiUpsertOneLoginSsoConfigResponse> {
        assertRegisteredAccount(req.account);
        const results = await this.services
            .getOrganizationSsoService()
            .upsertOneLoginConfig(req.account, body);
        this.setStatus(200);
        return { status: 'ok', results };
    }

    /**
     * Removes the current organization's OneLogin SSO configuration.
     * @summary Delete OneLogin SSO configuration
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @Delete('/oneLogin')
    @OperationId('DeleteOneLoginSsoConfig')
    async deleteOneLoginConfig(
        @Request() req: express.Request,
    ): Promise<ApiSuccessEmpty> {
        assertRegisteredAccount(req.account);
        await this.services
            .getOrganizationSsoService()
            .deleteOneLoginConfig(req.account);
        this.setStatus(200);
        return { status: 'ok', results: undefined };
    }

    /**
     * Returns the current organization's Google SSO policy. Google is enabled
     * by default using the shared instance OAuth app; a configuration only
     * exists when the org has set an explicit policy (e.g. disabled Google).
     * `null` means no explicit policy — Google follows the instance default.
     * @summary Get Google SSO configuration
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @Get('/google')
    @OperationId('GetGoogleSsoConfig')
    async getGoogleConfig(
        @Request() req: express.Request,
    ): Promise<ApiGoogleSsoConfigResponse> {
        assertRegisteredAccount(req.account);
        const results = await this.services
            .getOrganizationSsoService()
            .getGoogleConfig(req.account);
        this.setStatus(200);
        return { status: 'ok', results };
    }

    /**
     * Creates or updates the current organization's Google SSO policy. Google
     * has no per-org credentials — only the `enabled` / domain / password
     * flags are stored.
     * @summary Upsert Google SSO configuration
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @Put('/google')
    @OperationId('UpsertGoogleSsoConfig')
    async upsertGoogleConfig(
        @Request() req: express.Request,
        @Body() body: UpsertGoogleSsoConfig,
    ): Promise<ApiUpsertGoogleSsoConfigResponse> {
        assertRegisteredAccount(req.account);
        const results = await this.services
            .getOrganizationSsoService()
            .upsertGoogleConfig(req.account, body);
        this.setStatus(200);
        return { status: 'ok', results };
    }

    /**
     * Removes the current organization's Google SSO policy, reverting to the
     * instance default (Google enabled).
     * @summary Delete Google SSO configuration
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @Delete('/google')
    @OperationId('DeleteGoogleSsoConfig')
    async deleteGoogleConfig(
        @Request() req: express.Request,
    ): Promise<ApiSuccessEmpty> {
        assertRegisteredAccount(req.account);
        await this.services
            .getOrganizationSsoService()
            .deleteGoogleConfig(req.account);
        this.setStatus(200);
        return { status: 'ok', results: undefined };
    }
}
