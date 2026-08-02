import {
    ApiEmailWhitelabelResponse,
    ApiErrorPayload,
    ApiSuccessEmpty,
    assertRegisteredAccount,
    CreateEmailWhitelabel,
    UpdateEmailWhitelabel,
    UUID,
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
    Put,
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
} from './authentication';
import { BaseController } from './baseController';

/**
 * Cloud-only email whitelabelling — lets an organization send report emails
 * from their own verified domain. Gated by the EmailWhitelabel feature flag and
 * a configured Postmark account token.
 */
@Route('/api/v1/org/{organizationUuid}/email-whitelabel')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Organizations')
export class EmailWhitelabelController extends BaseController {
    /**
     * Returns the organization's email sending domain configuration, or null if
     * none has been set up.
     * @summary Get email whitelabel configuration
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @Get('/')
    @OperationId('GetEmailWhitelabel')
    async getEmailWhitelabel(
        @Request() req: express.Request,
        @Path() organizationUuid: UUID,
    ): Promise<ApiEmailWhitelabelResponse> {
        assertRegisteredAccount(req.account);
        const results = await this.services
            .getEmailWhitelabelService()
            .getStatus(req.account, organizationUuid);
        this.setStatus(200);
        return { status: 'ok', results };
    }

    /**
     * Sets up (or replaces) the organization's sending domain and returns the
     * DNS records to publish. Does not start sending — the domain must be
     * verified and enabled first.
     * @summary Set up email sending domain
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @Put('/')
    @OperationId('SetupEmailWhitelabel')
    async setupEmailWhitelabel(
        @Request() req: express.Request,
        @Path() organizationUuid: UUID,
        @Body() body: CreateEmailWhitelabel,
    ): Promise<ApiEmailWhitelabelResponse> {
        assertRegisteredAccount(req.account);
        const results = await this.services
            .getEmailWhitelabelService()
            .setupDomain(req.account, organizationUuid, body);
        this.setStatus(200);
        return { status: 'ok', results };
    }

    /**
     * Triggers verification of the DNS records with the email provider and
     * returns the refreshed status. Safe to call repeatedly while DNS
     * propagates.
     * @summary Verify email sending domain
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @Post('/verify')
    @OperationId('VerifyEmailWhitelabel')
    async verifyEmailWhitelabel(
        @Request() req: express.Request,
        @Path() organizationUuid: UUID,
    ): Promise<ApiEmailWhitelabelResponse> {
        assertRegisteredAccount(req.account);
        const results = await this.services
            .getEmailWhitelabelService()
            .verify(req.account, organizationUuid);
        this.setStatus(200);
        return { status: 'ok', results };
    }

    /**
     * Enables or disables sending from the verified domain. Can only be enabled
     * once both DKIM and return-path are verified.
     * @summary Enable or disable email sending domain
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @Patch('/')
    @OperationId('UpdateEmailWhitelabel')
    async updateEmailWhitelabel(
        @Request() req: express.Request,
        @Path() organizationUuid: UUID,
        @Body() body: UpdateEmailWhitelabel,
    ): Promise<ApiEmailWhitelabelResponse> {
        assertRegisteredAccount(req.account);
        const results = await this.services
            .getEmailWhitelabelService()
            .updateEnabled(req.account, organizationUuid, body);
        this.setStatus(200);
        return { status: 'ok', results };
    }

    /**
     * Removes the sending domain and reverts the organization to the Lightdash
     * sending identity.
     * @summary Delete email sending domain
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @Delete('/')
    @OperationId('DeleteEmailWhitelabel')
    async deleteEmailWhitelabel(
        @Request() req: express.Request,
        @Path() organizationUuid: UUID,
    ): Promise<ApiSuccessEmpty> {
        assertRegisteredAccount(req.account);
        await this.services
            .getEmailWhitelabelService()
            .deleteDomain(req.account, organizationUuid);
        this.setStatus(200);
        return { status: 'ok', results: undefined };
    }
}
