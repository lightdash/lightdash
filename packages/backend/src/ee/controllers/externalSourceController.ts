import {
    ApiErrorPayload,
    assertRegisteredAccount,
    ParameterError,
    type ApiExternalSourceResponse,
    type ApiExternalSourcesResponse,
    type ApiStagedExternalSourceUploadResponse,
    type ApiSuccessEmpty,
    type CreateExternalSourceTablePayload,
    type UUID,
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
    Query,
    Request,
    Response,
    Route,
    SuccessResponse,
} from '@tsoa/runtime';
import express from 'express';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
} from '../../controllers/authentication';
import { BaseController } from '../../controllers/baseController';
import { ExternalSourceService } from '../services/ExternalSourceService/ExternalSourceService';

@Route('/api/v1/ee/projects/{projectUuid}/external-sources')
@Hidden()
@Response<ApiErrorPayload>('default', 'Error')
export class ExternalSourceController extends BaseController {
    /**
     * Upload a CSV or TSV file and stage it as an external source. Send raw
     * bytes as the body with Content-Type and Content-Length headers; pass
     * the original filename as a query parameter. Returns the inferred
     * schema and sample rows for confirmation.
     * @summary Upload a CSV file
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('201', 'Created')
    @Post('/upload')
    @OperationId('UploadExternalSourceCsv')
    async uploadCsv(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
        @Query() filename: string,
    ): Promise<ApiStagedExternalSourceUploadResponse> {
        assertRegisteredAccount(req.account);
        const contentType = req.headers['content-type'];
        if (!contentType) {
            throw new ParameterError('Content-Type header is required');
        }
        if (!req.headers['content-length']) {
            throw new ParameterError('Content-Length header is required');
        }
        const contentLength = parseInt(req.headers['content-length'], 10);
        if (Number.isNaN(contentLength) || contentLength <= 0) {
            throw new ParameterError(
                'Content-Length must be a positive integer',
            );
        }
        this.setStatus(201);
        return {
            status: 'ok',
            results: await this.getExternalSourceService().stageCsvUpload(
                req.account,
                projectUuid,
                {
                    filename,
                    contentType,
                    contentLength,
                    body: req,
                },
            ),
        };
    }

    /**
     * Confirm a staged CSV upload: name the table and start the ingest.
     * The source appears with a syncing status until the ingest finishes.
     * @summary Create a table from a staged upload
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('201', 'Created')
    @Post('/{sourceUuid}/commit')
    @OperationId('CommitExternalSourceUpload')
    async commitUpload(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
        @Path() sourceUuid: UUID,
        @Body() body: CreateExternalSourceTablePayload,
    ): Promise<ApiExternalSourceResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(201);
        return {
            status: 'ok',
            results: await this.getExternalSourceService().createCsvTable(
                req.account,
                projectUuid,
                sourceUuid,
                body,
            ),
        };
    }

    /**
     * @summary List external sources
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/')
    @OperationId('ListExternalSources')
    async listSources(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
    ): Promise<ApiExternalSourcesResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getExternalSourceService().list(
                req.account,
                projectUuid,
            ),
        };
    }

    /**
     * @summary Get an external source
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/{sourceUuid}')
    @OperationId('GetExternalSource')
    async getSource(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
        @Path() sourceUuid: UUID,
    ): Promise<ApiExternalSourceResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getExternalSourceService().get(
                req.account,
                projectUuid,
                sourceUuid,
            ),
        };
    }

    /**
     * Delete an external source, its tables, and their explores. Charts
     * built on the tables will fail validation.
     * @summary Delete an external source
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Delete('/{sourceUuid}')
    @OperationId('DeleteExternalSource')
    async deleteSource(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
        @Path() sourceUuid: UUID,
    ): Promise<ApiSuccessEmpty> {
        assertRegisteredAccount(req.account);
        await this.getExternalSourceService().delete(
            req.account,
            projectUuid,
            sourceUuid,
        );
        this.setStatus(200);
        return {
            status: 'ok',
            results: undefined,
        };
    }

    protected getExternalSourceService() {
        return this.services.getExternalSourceService<ExternalSourceService>();
    }
}
