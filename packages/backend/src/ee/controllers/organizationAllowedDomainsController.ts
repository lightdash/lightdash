import {
    ApiOrganizationAllowedDomainResponse,
    ApiOrganizationAllowedDomainsResponse,
    type ApiErrorPayload,
    type CreateAllowedDomain,
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
    SuccessResponse,
    Tags,
} from '@tsoa/runtime';
import express from 'express';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
} from '../../controllers/authentication';
import { BaseController } from '../../controllers/baseController';
import { OrganizationAllowedDomainsService } from '../services/OrganizationAllowedDomainsService';

@Route('/api/v1/org/allowedDomains')
@Hidden()
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Organizations')
export class OrganizationAllowedDomainsController extends BaseController {
    /**
     * List allowed domains for the current organization
     * @summary List allowed domains
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/')
    @OperationId('listOrganizationAllowedDomains')
    async listAllowedDomains(
        @Request() req: express.Request,
    ): Promise<ApiOrganizationAllowedDomainsResponse> {
        this.setStatus(200);
        const service =
            this.services.getOrganizationAllowedDomainsService<OrganizationAllowedDomainsService>();
        return {
            status: 'ok',
            results: await service.getAllowedDomains(req.user!),
        };
    }

    /**
     * Add a new allowed domain for the current organization
     * @summary Add allowed domain
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('201', 'Created')
    @Post('/')
    @OperationId('addOrganizationAllowedDomain')
    async addAllowedDomain(
        @Request() req: express.Request,
        @Body() body: CreateAllowedDomain,
    ): Promise<ApiOrganizationAllowedDomainResponse> {
        this.setStatus(201);
        const service =
            this.services.getOrganizationAllowedDomainsService<OrganizationAllowedDomainsService>();
        return {
            status: 'ok',
            results: await service.addAllowedDomain(req.user!, body),
        };
    }

    /**
     * Remove an allowed domain from the current organization
     * @summary Delete allowed domain
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('204', 'Deleted')
    @Delete('/{domainUuid}')
    @OperationId('deleteOrganizationAllowedDomain')
    async deleteAllowedDomain(
        @Request() req: express.Request,
        @Path() domainUuid: string,
    ): Promise<void> {
        this.setStatus(204);
        const service =
            this.services.getOrganizationAllowedDomainsService<OrganizationAllowedDomainsService>();
        await service.deleteAllowedDomain(req.user!, domainUuid);
    }
}
