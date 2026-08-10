import {
    ApiErrorPayload,
    ApiOrganizationDesignFileResponse,
    ApiOrganizationDesignResponse,
    ApiOrganizationDesignsResponse,
    ApiSuccessEmpty,
    assertRegisteredAccount,
    CreateOrganizationDesignRequest,
    MAX_THEME_PACKAGE_BYTES,
    ORGANIZATION_DESIGN_PACKAGE_CONTENT_TYPE,
    ParameterError,
    UpdateOrganizationDesignRequest,
    type UuidOrSlug,
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
    Query,
    Request,
    Response,
    Route,
    SuccessResponse,
    Tags,
} from '@tsoa/runtime';
import express from 'express';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createContentDispositionHeader } from '../utils/FileDownloadUtils/FileDownloadUtils';
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
     * Download a complete organization theme as the canonical theme-as-code
     * tar package.
     * @summary Download theme package
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/{designUuidOrSlug}/package')
    @OperationId('DownloadOrganizationDesignPackage')
    async downloadPackage(
        @Request() req: express.Request,
        @Path() designUuidOrSlug: UuidOrSlug,
    ): Promise<void> {
        assertRegisteredAccount(req.account);
        const { body, filename } = await this.services
            .getOrganizationDesignService()
            .exportPackage(req.account, designUuidOrSlug);
        const res = req.res!;
        res.status(200);
        res.setHeader('Content-Type', ORGANIZATION_DESIGN_PACKAGE_CONTENT_TYPE);
        res.setHeader('Content-Length', String(body.length));
        res.setHeader(
            'Content-Disposition',
            createContentDispositionHeader(filename),
        );
        await pipeline(Readable.from(body), res);
    }

    /**
     * Get a single organization design with its files.
     * @summary Get organization design
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/{designUuidOrSlug}')
    @OperationId('GetOrganizationDesign')
    async getDesign(
        @Request() req: express.Request,
        @Path() designUuidOrSlug: UuidOrSlug,
    ): Promise<ApiOrganizationDesignResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getOrganizationDesignService()
                .getDesign(req.account, designUuidOrSlug),
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
     * Create or atomically replace an organization theme from a canonical
     * theme-as-code tar package. Send the uncompressed tar as the raw
     * `application/x-tar` request body; the manifest slug selects the remote
     * theme.
     * @summary Import theme package
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Put('/package')
    @OperationId('ImportOrganizationDesignPackage')
    async importPackage(
        @Request() req: express.Request,
    ): Promise<ApiOrganizationDesignResponse> {
        assertRegisteredAccount(req.account);
        const contentType = req.headers['content-type']
            ?.split(';')[0]
            .trim()
            .toLowerCase();
        if (contentType !== ORGANIZATION_DESIGN_PACKAGE_CONTENT_TYPE) {
            throw new ParameterError(
                `Content-Type must be ${ORGANIZATION_DESIGN_PACKAGE_CONTENT_TYPE}`,
            );
        }
        const contentLengthHeader = req.headers['content-length'];
        if (!contentLengthHeader) {
            throw new ParameterError('Content-Length header is required');
        }
        const contentLength = Number(contentLengthHeader);
        if (
            !Number.isSafeInteger(contentLength) ||
            contentLength <= 0 ||
            contentLength > MAX_THEME_PACKAGE_BYTES
        ) {
            throw new ParameterError(
                `Content-Length must be between 1 and ${MAX_THEME_PACKAGE_BYTES}`,
            );
        }

        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getOrganizationDesignService()
                .importPackage(req.account, {
                    body: req,
                    contentLength,
                }),
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
    @Patch('/{designUuidOrSlug}')
    @OperationId('UpdateOrganizationDesign')
    async updateDesign(
        @Request() req: express.Request,
        @Path() designUuidOrSlug: UuidOrSlug,
        @Body() body: UpdateOrganizationDesignRequest,
    ): Promise<ApiOrganizationDesignResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getOrganizationDesignService()
                .updateDesign(req.account, designUuidOrSlug, body),
        };
    }

    /**
     * Clear whichever design is currently the organization default. Idempotent
     * — succeeds when no default is set.
     *
     * NOTE: This literal `/default` route MUST stay registered before
     * `Delete('/{designUuidOrSlug}')` below so Express routes a request to
     * `DELETE /api/v1/org/designs/default` here rather than treating
     * "default" as a `designUuidOrSlug` path param.
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
    @Delete('/{designUuidOrSlug}')
    @OperationId('DeleteOrganizationDesign')
    async deleteDesign(
        @Request() req: express.Request,
        @Path() designUuidOrSlug: UuidOrSlug,
    ): Promise<ApiSuccessEmpty> {
        assertRegisteredAccount(req.account);
        await this.services
            .getOrganizationDesignService()
            .deleteDesign(req.account, designUuidOrSlug);
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
    @Post('/{designUuidOrSlug}/default')
    @OperationId('SetDefaultOrganizationDesign')
    async setAsDefault(
        @Request() req: express.Request,
        @Path() designUuidOrSlug: UuidOrSlug,
    ): Promise<ApiOrganizationDesignResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getOrganizationDesignService()
                .setAsDefault(req.account, designUuidOrSlug),
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
    @Post('/{designUuidOrSlug}/files')
    @OperationId('UploadOrganizationDesignFile')
    async uploadFile(
        @Request() req: express.Request,
        @Path() designUuidOrSlug: UuidOrSlug,
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
                .uploadFile(req.account, designUuidOrSlug, {
                    kind,
                    filename,
                    contentType,
                    body: req,
                    contentLength,
                }),
        };
    }

    /**
     * Delete every file in an organization design, keeping the design itself.
     * Idempotent — succeeds when the design already has no files.
     * @summary Delete all files from organization design
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Delete('/{designUuidOrSlug}/files')
    @OperationId('DeleteAllOrganizationDesignFiles')
    async deleteAllFiles(
        @Request() req: express.Request,
        @Path() designUuidOrSlug: UuidOrSlug,
    ): Promise<ApiSuccessEmpty> {
        assertRegisteredAccount(req.account);
        await this.services
            .getOrganizationDesignService()
            .clearFiles(req.account, designUuidOrSlug);
        this.setStatus(200);
        return { status: 'ok', results: undefined };
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
    @Delete('/{designUuidOrSlug}/files/{fileUuid}')
    @OperationId('DeleteOrganizationDesignFile')
    async deleteFile(
        @Request() req: express.Request,
        @Path() designUuidOrSlug: UuidOrSlug,
        @Path() fileUuid: string,
    ): Promise<ApiSuccessEmpty> {
        assertRegisteredAccount(req.account);
        await this.services
            .getOrganizationDesignService()
            .deleteFile(req.account, designUuidOrSlug, fileUuid);
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
    @Get('/{designUuidOrSlug}/files/{fileUuid}')
    @OperationId('DownloadOrganizationDesignFile')
    async downloadFile(
        @Request() req: express.Request,
        @Path() designUuidOrSlug: UuidOrSlug,
        @Path() fileUuid: string,
    ): Promise<void> {
        assertRegisteredAccount(req.account);
        const { body, contentType, filename, sizeBytes } = await this.services
            .getOrganizationDesignService()
            .getFileStream(req.account, designUuidOrSlug, fileUuid);
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
