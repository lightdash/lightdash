import {
    ApiErrorPayload,
    ApiOrganizationDesignFileResponse,
    ApiOrganizationDesignResponse,
    ApiOrganizationDesignsResponse,
    ApiSuccessEmpty,
    assertRegisteredAccount,
    CreateOrganizationDesignRequest,
    ParameterError,
    UpdateOrganizationDesignRequest,
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

@Route('/api/v1/org/designs')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Organizations')
export class OrganizationDesignController extends BaseController {
    /**
     * List all organization design assets.
     * @summary List organization designs
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/')
    @OperationId('ListOrganizationDesigns')
    async listDesigns(
        @Request() req: express.Request,
    ): Promise<ApiOrganizationDesignsResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getOrganizationDesignService()
                .listDesigns(req.account),
        };
    }

    /**
     * Get a single organization design with its files.
     * @summary Get organization design
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/{designUuid}')
    @OperationId('GetOrganizationDesign')
    async getDesign(
        @Request() req: express.Request,
        @Path() designUuid: string,
    ): Promise<ApiOrganizationDesignResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getOrganizationDesignService()
                .getDesign(req.account, designUuid),
        };
    }

    /**
     * Create a new organization design. Starts empty — upload files separately.
     * @summary Create organization design
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('201', 'Created')
    @Post('/')
    @OperationId('CreateOrganizationDesign')
    async createDesign(
        @Request() req: express.Request,
        @Body() body: CreateOrganizationDesignRequest,
    ): Promise<ApiOrganizationDesignResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(201);
        return {
            status: 'ok',
            results: await this.services
                .getOrganizationDesignService()
                .createDesign(req.account, body),
        };
    }

    /**
     * Update an organization design's name or description.
     * @summary Update organization design
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Patch('/{designUuid}')
    @OperationId('UpdateOrganizationDesign')
    async updateDesign(
        @Request() req: express.Request,
        @Path() designUuid: string,
        @Body() body: UpdateOrganizationDesignRequest,
    ): Promise<ApiOrganizationDesignResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getOrganizationDesignService()
                .updateDesign(req.account, designUuid, body),
        };
    }

    /**
     * Clear whichever design is currently the organization default. Idempotent
     * — succeeds when no default is set.
     *
     * NOTE: This literal `/default` route MUST stay registered before
     * `Delete('/{designUuid}')` below so Express routes a request to
     * `DELETE /api/v1/org/designs/default` here rather than treating
     * "default" as a `designUuid` path param.
     * @summary Clear default organization design
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Delete('/default')
    @OperationId('ClearDefaultOrganizationDesign')
    async clearDefaultDesign(
        @Request() req: express.Request,
    ): Promise<ApiSuccessEmpty> {
        assertRegisteredAccount(req.account);
        await this.services
            .getOrganizationDesignService()
            .clearOrgDefault(req.account);
        this.setStatus(200);
        return { status: 'ok', results: undefined };
    }

    /**
     * Delete an organization design and all its files (cascades S3).
     * @summary Delete organization design
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Delete('/{designUuid}')
    @OperationId('DeleteOrganizationDesign')
    async deleteDesign(
        @Request() req: express.Request,
        @Path() designUuid: string,
    ): Promise<ApiSuccessEmpty> {
        assertRegisteredAccount(req.account);
        await this.services
            .getOrganizationDesignService()
            .deleteDesign(req.account, designUuid);
        this.setStatus(200);
        return { status: 'ok', results: undefined };
    }

    /**
     * Mark this design as the organization's default. Clears any previous default.
     * @summary Set default organization design
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Post('/{designUuid}/default')
    @OperationId('SetDefaultOrganizationDesign')
    async setAsDefault(
        @Request() req: express.Request,
        @Path() designUuid: string,
    ): Promise<ApiOrganizationDesignResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getOrganizationDesignService()
                .setAsDefault(req.account, designUuid),
        };
    }

    /**
     * Upload a file into a design. Send raw bytes as the body with the
     * appropriate Content-Type and Content-Length headers. Pass `kind`
     * and `filename` as query parameters. Mirrors the data-app image
     * upload pattern — no multipart wrapping required.
     * @summary Upload file to organization design
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('201', 'Created')
    @Post('/{designUuid}/files')
    @OperationId('UploadOrganizationDesignFile')
    async uploadFile(
        @Request() req: express.Request,
        @Path() designUuid: string,
        @Query() kind: string,
        @Query() filename: string,
    ): Promise<ApiOrganizationDesignFileResponse> {
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
            results: await this.services
                .getOrganizationDesignService()
                .uploadFile(req.account, designUuid, {
                    kind,
                    filename,
                    contentType,
                    body: req,
                    contentLength,
                }),
        };
    }

    /**
     * Delete a single file from an organization design.
     * @summary Delete file from organization design
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Delete('/{designUuid}/files/{fileUuid}')
    @OperationId('DeleteOrganizationDesignFile')
    async deleteFile(
        @Request() req: express.Request,
        @Path() designUuid: string,
        @Path() fileUuid: string,
    ): Promise<ApiSuccessEmpty> {
        assertRegisteredAccount(req.account);
        await this.services
            .getOrganizationDesignService()
            .deleteFile(req.account, designUuid, fileUuid);
        this.setStatus(200);
        return { status: 'ok', results: undefined };
    }

    /**
     * Download a single file from an organization design. Streams the
     * S3 object body back with the stored Content-Type and a sensible
     * Content-Disposition.
     * @summary Download file from organization design
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/{designUuid}/files/{fileUuid}')
    @OperationId('DownloadOrganizationDesignFile')
    async downloadFile(
        @Request() req: express.Request,
        @Path() designUuid: string,
        @Path() fileUuid: string,
    ): Promise<void> {
        assertRegisteredAccount(req.account);
        const { body, contentType, filename, sizeBytes } = await this.services
            .getOrganizationDesignService()
            .getFileStream(req.account, designUuid, fileUuid);
        const { res } = req as express.Request & { res: express.Response };
        res.status(200);
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Length', String(sizeBytes));
        res.setHeader(
            'Content-Disposition',
            `inline; filename="${encodeURIComponent(filename)}"`,
        );
        body.pipe(res);
        await new Promise<void>((resolve, reject) => {
            res.on('finish', () => resolve());
            res.on('error', (err) => reject(err));
        });
    }
}
