import {
    ApiDomainVerificationStatusResponse,
    ApiErrorPayload,
    ApiSuccessEmpty,
    ApiVerifiedDomainsResponse,
    assertRegisteredAccount,
    ConfirmDomainVerification,
    RequestDomainVerification,
} from '@lightdash/common';
import {
    Body,
    Delete,
    Get,
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
    unauthorisedInDemo,
} from '../../controllers/authentication';
import { BaseController } from '../../controllers/baseController';

@Route('/api/v1/org/domains')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Organizations')
export class OrganizationDomainVerificationController extends BaseController {
    /**
     * Lists the domains the current organization has verified ownership of.
     * @summary List verified domains
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @Get('/')
    @OperationId('ListVerifiedDomains')
    async listVerifiedDomains(
        @Request() req: express.Request,
    ): Promise<ApiVerifiedDomainsResponse> {
        assertRegisteredAccount(req.account);
        const results = await this.services
            .getOrganizationDomainVerificationService()
            .listVerifiedDomains(req.account);
        this.setStatus(200);
        return { status: 'ok', results };
    }

    /**
     * Sends a one-time passcode to an address at the domain to begin verifying
     * ownership. The domain must not be a public email provider and must not
     * already be verified by another organization.
     * @summary Request domain verification
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @Post('/verify')
    @OperationId('RequestDomainVerification')
    async requestVerification(
        @Request() req: express.Request,
        @Body() body: RequestDomainVerification,
    ): Promise<ApiDomainVerificationStatusResponse> {
        assertRegisteredAccount(req.account);
        const results = await this.services
            .getOrganizationDomainVerificationService()
            .requestVerification(req.account, body);
        this.setStatus(200);
        return { status: 'ok', results };
    }

    /**
     * Confirms a domain verification passcode. On success the domain is marked
     * verified for the organization.
     * @summary Confirm domain verification
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @Post('/confirm')
    @OperationId('ConfirmDomainVerification')
    async confirmVerification(
        @Request() req: express.Request,
        @Body() body: ConfirmDomainVerification,
    ): Promise<ApiDomainVerificationStatusResponse> {
        assertRegisteredAccount(req.account);
        const results = await this.services
            .getOrganizationDomainVerificationService()
            .confirmVerification(req.account, body);
        this.setStatus(200);
        return { status: 'ok', results };
    }

    /**
     * Removes a verified domain and strips it from any SSO provider that routed
     * to it.
     * @summary Delete verified domain
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @Delete('/{domain}')
    @OperationId('DeleteVerifiedDomain')
    async deleteVerifiedDomain(
        @Request() req: express.Request,
        @Path() domain: string,
    ): Promise<ApiSuccessEmpty> {
        assertRegisteredAccount(req.account);
        await this.services
            .getOrganizationDomainVerificationService()
            .deleteVerifiedDomain(req.account, domain);
        this.setStatus(200);
        return { status: 'ok', results: undefined };
    }
}
