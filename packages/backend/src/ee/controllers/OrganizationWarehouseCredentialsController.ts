import {
    ApiErrorPayload,
    ApiOrganizationWarehouseCredentialsListResponse,
    ApiOrganizationWarehouseCredentialsResponse,
    ApiOrganizationWarehouseCredentialsSummaryListResponse,
    ApiSuccessEmpty,
    CreateOrganizationWarehouseCredentials,
    UpdateOrganizationWarehouseCredentials,
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
    Query,
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
import { OrganizationWarehouseCredentialsService } from '../services/OrganizationWarehouseCredentialsService';

@Route('/api/v1/org/warehouse-credentials')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Organization Warehouse Credentials')
export class OrganizationWarehouseCredentialsController extends BaseController {
    /**
     * Get all warehouse credentials for the current organization
     * @summary List warehouse credentials
     * @param req express request
     * @param summary If true, returns only summaries (name, type) accessible to all members. If false/undefined, returns full credentials requiring manage permission.
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @Get()
    @OperationId('ListOrganizationWarehouseCredentials')
    async getAll(
        @Request() req: express.Request,
        @Query() summary?: boolean,
    ): Promise<
        | ApiOrganizationWarehouseCredentialsListResponse
        | ApiOrganizationWarehouseCredentialsSummaryListResponse
    > {
        this.setStatus(200);

        if (summary) {
            return {
                status: 'ok',
                results:
                    await this.getOrganizationWarehouseCredentialsService().getAllSummaries(
                        req.account!,
                    ),
            };
        }

        return {
            status: 'ok',
            results:
                await this.getOrganizationWarehouseCredentialsService().getAll(
                    req.account!,
                ),
        };
    }

    /**
     * Get a specific warehouse credential by UUID
     * @summary Get warehouse credential
     * @param req express request
     * @param credentialsUuid the UUID of the warehouse credentials
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @Get('{credentialsUuid}')
    @OperationId('GetOrganizationWarehouseCredentials')
    async get(
        @Request() req: express.Request,
        @Path() credentialsUuid: string,
    ): Promise<ApiOrganizationWarehouseCredentialsResponse> {
        this.setStatus(200);
        return {
            status: 'ok',
            results:
                await this.getOrganizationWarehouseCredentialsService().get(
                    req.account!,
                    credentialsUuid,
                ),
        };
    }

    /**
     * Create new warehouse credentials for the organization
     * @summary Create warehouse credentials
     * @param req express request
     * @param body the warehouse credentials to create
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @Post()
    @OperationId('CreateOrganizationWarehouseCredentials')
    async create(
        @Request() req: express.Request,
        @Body() body: CreateOrganizationWarehouseCredentials,
    ): Promise<ApiOrganizationWarehouseCredentialsResponse> {
        this.setStatus(201);
        return {
            status: 'ok',
            results:
                await this.getOrganizationWarehouseCredentialsService().create(
                    req.account!,
                    body,
                ),
        };
    }

    /**
     * Update existing warehouse credentials
     * @summary Update warehouse credentials
     * @param req express request
     * @param credentialsUuid the UUID of the warehouse credentials to update
     * @param body the updated warehouse credentials
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @Patch('{credentialsUuid}')
    @OperationId('UpdateOrganizationWarehouseCredentials')
    async update(
        @Request() req: express.Request,
        @Path() credentialsUuid: string,
        @Body() body: UpdateOrganizationWarehouseCredentials,
    ): Promise<ApiOrganizationWarehouseCredentialsResponse> {
        this.setStatus(200);
        return {
            status: 'ok',
            results:
                await this.getOrganizationWarehouseCredentialsService().update(
                    req.account!,
                    credentialsUuid,
                    body,
                ),
        };
    }

    /**
     * Delete warehouse credentials
     * @summary Delete warehouse credentials
     * @param req express request
     * @param credentialsUuid the UUID of the warehouse credentials to delete
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @Delete('{credentialsUuid}')
    @OperationId('DeleteOrganizationWarehouseCredentials')
    async delete(
        @Request() req: express.Request,
        @Path() credentialsUuid: string,
    ): Promise<ApiSuccessEmpty> {
        await this.getOrganizationWarehouseCredentialsService().delete(
            req.account!,
            credentialsUuid,
        );
        this.setStatus(200);
        return {
            status: 'ok',
            results: undefined,
        };
    }

    /**
     * Helper to get the typed service
     */
    protected getOrganizationWarehouseCredentialsService() {
        return this.services.getOrganizationWarehouseCredentialsService<OrganizationWarehouseCredentialsService>();
    }
}
