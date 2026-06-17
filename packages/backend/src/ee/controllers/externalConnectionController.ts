import {
    assertRegisteredAccount,
    type ApiErrorPayload,
    type ApiSaveExternalConnectionSampleRequest,
    type ApiSaveExternalConnectionSampleResponse,
    type ApiTestExternalConnectionRequest,
    type ApiTestExternalConnectionResponse,
    type CreateExternalConnection,
    type ExternalConnection,
    type ExternalFetchRequest,
    type ExternalFetchResponse,
    type UpdateExternalConnection,
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
} from '@tsoa/runtime';
import express from 'express';
import { toSessionUser } from '../../auth/account';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
} from '../../controllers/authentication';
import { BaseController } from '../../controllers/baseController';
import { ExternalConnectionService } from '../services/ExternalConnectionService/ExternalConnectionService';

type ApiExternalConnectionResponse = {
    status: 'ok';
    results: ExternalConnection;
};

type ApiExternalConnectionListResponse = {
    status: 'ok';
    results: ExternalConnection[];
};

type ApiAppExternalConnectionListResponse = {
    status: 'ok';
    results: Array<{ alias: string; connection: ExternalConnection }>;
};

type ApiExternalFetchResponse = {
    status: 'ok';
    results: ExternalFetchResponse;
};

@Route('/api/v1/ee/projects/{projectUuid}')
@Hidden()
@Response<ApiErrorPayload>('default', 'Error')
export class ExternalConnectionController extends BaseController {
    /**
     * Create an external connection for a project
     * @summary Create external connection
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('201', 'Created')
    @Post('external-connections')
    @OperationId('createExternalConnection')
    async createExternalConnection(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Body() body: CreateExternalConnection,
    ): Promise<ApiExternalConnectionResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(201);
        return {
            status: 'ok',
            results: await this.getService().create(
                req.account,
                projectUuid,
                body,
            ),
        };
    }

    /**
     * List external connections for a project
     * @summary List external connections
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('external-connections')
    @OperationId('listExternalConnections')
    async listExternalConnections(
        @Request() req: express.Request,
        @Path() projectUuid: string,
    ): Promise<ApiExternalConnectionListResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getService().list(req.account, projectUuid),
        };
    }

    /**
     * Get a single external connection by UUID
     * @summary Get external connection
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('external-connections/{connectionUuid}')
    @OperationId('getExternalConnection')
    async getExternalConnection(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Path() connectionUuid: string,
    ): Promise<ApiExternalConnectionResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getService().get(
                req.account,
                projectUuid,
                connectionUuid,
            ),
        };
    }

    /**
     * Update an external connection
     * @summary Update external connection
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Patch('external-connections/{connectionUuid}')
    @OperationId('updateExternalConnection')
    async updateExternalConnection(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Path() connectionUuid: string,
        @Body() body: UpdateExternalConnection,
    ): Promise<ApiExternalConnectionResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getService().update(
                req.account,
                projectUuid,
                connectionUuid,
                body,
            ),
        };
    }

    /**
     * Delete an external connection
     * @summary Delete external connection
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Delete('external-connections/{connectionUuid}')
    @OperationId('deleteExternalConnection')
    async deleteExternalConnection(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Path() connectionUuid: string,
    ): Promise<{ status: 'ok'; results: undefined }> {
        assertRegisteredAccount(req.account);
        await this.getService().delete(
            req.account,
            projectUuid,
            connectionUuid,
        );
        this.setStatus(200);
        return { status: 'ok', results: undefined };
    }

    /**
     * Rotate the secret of an external connection
     * @summary Rotate external connection secret
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Post('external-connections/{connectionUuid}/rotate-secret')
    @OperationId('rotateExternalConnectionSecret')
    async rotateExternalConnectionSecret(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Path() connectionUuid: string,
        @Body() body: { secret: string },
    ): Promise<ApiExternalConnectionResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getService().rotateSecret(
                req.account,
                projectUuid,
                connectionUuid,
                body.secret,
            ),
        };
    }

    /**
     * List external connections linked to a data app
     * @summary List app external connections
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('apps/{appUuid}/external-connections')
    @OperationId('listAppExternalConnections')
    async listAppExternalConnections(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Path() appUuid: string,
    ): Promise<ApiAppExternalConnectionListResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getService().listAppLinks(
                req.account,
                projectUuid,
                appUuid,
            ),
        };
    }

    /**
     * Link an external connection to a data app
     * @summary Link external connection to app
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Post('apps/{appUuid}/external-connections')
    @OperationId('linkAppExternalConnection')
    async linkAppExternalConnection(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Path() appUuid: string,
        @Body() body: { externalConnectionUuid: string; alias: string },
    ): Promise<{ status: 'ok'; results: undefined }> {
        assertRegisteredAccount(req.account);
        await this.getService().linkToApp(
            req.account,
            projectUuid,
            appUuid,
            body.externalConnectionUuid,
            body.alias,
        );
        this.setStatus(200);
        return { status: 'ok', results: undefined };
    }

    /**
     * Unlink an external connection from a data app by alias
     * @summary Unlink external connection from app
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Delete('apps/{appUuid}/external-connections/{alias}')
    @OperationId('unlinkAppExternalConnection')
    async unlinkAppExternalConnection(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Path() appUuid: string,
        @Path() alias: string,
    ): Promise<{ status: 'ok'; results: undefined }> {
        assertRegisteredAccount(req.account);
        await this.getService().unlinkFromApp(
            req.account,
            projectUuid,
            appUuid,
            alias,
        );
        this.setStatus(200);
        return { status: 'ok', results: undefined };
    }

    /**
     * Proxy an outbound HTTP request from a data app through a configured,
     * authorized connection alias. The app never sees the connection's secret
     * or origin — only the alias + a relative path.
     * @summary External fetch proxy for data apps
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('apps/{appUuid}/external-fetch')
    @OperationId('externalFetch')
    async externalFetch(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Path() appUuid: string,
        @Body() body: ExternalFetchRequest,
    ): Promise<ApiExternalFetchResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        const results = await this.getService().proxyFetch(
            toSessionUser(req.account),
            projectUuid,
            appUuid,
            body,
        );
        return {
            status: 'ok',
            results,
        };
    }

    /**
     * Run a single test request through the same validation + fetch core as
     * the runtime proxy. Admin-only. Returns the bounded response.
     * @summary Test an external connection
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Post('external-connections/{connectionUuid}/test')
    @OperationId('testExternalConnection')
    async testExternalConnection(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Path() connectionUuid: string,
        @Body() body: ApiTestExternalConnectionRequest,
    ): Promise<ApiTestExternalConnectionResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        const results = await this.getService().testConnection(
            req.account,
            projectUuid,
            connectionUuid,
            {
                method: body.method,
                path: body.path,
                query: body.query,
                body: body.body,
            },
        );
        return { status: 'ok', results };
    }

    /**
     * Save a sanitized, truncated sample of the connection's response so the
     * data-app generate pipeline can ground Claude in the API's shape.
     * Admin-only. Stores no secrets.
     * @summary Save an external connection sample
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Post('external-connections/{connectionUuid}/sample')
    @OperationId('saveExternalConnectionSample')
    async saveExternalConnectionSample(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Path() connectionUuid: string,
        @Body() body: ApiSaveExternalConnectionSampleRequest,
    ): Promise<ApiSaveExternalConnectionSampleResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        await this.getService().saveSample(
            req.account,
            projectUuid,
            connectionUuid,
            body.sample,
        );
        return { status: 'ok', results: undefined };
    }

    private getService(): ExternalConnectionService {
        return this.services.getExternalConnectionService<ExternalConnectionService>();
    }
}
