import {
    ApiErrorPayload,
    ApiOrganizationBrandLogoUploadResponse,
    ApiOrganizationBrandResponse,
    assertRegisteredAccount,
    ParameterError,
    SaveOrganizationBrandRequest,
    UpdateOrganizationBrandRequest,
    UUID,
} from '@lightdash/common';
import {
    Body,
    Get,
    Middlewares,
    OperationId,
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

@Route('/api/v1/org')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Organizations')
export class OrganizationBrandController extends BaseController {
    /**
     * Get the organization's brand profile, previously fetched from Brandfetch.
     * Returns null if no brand profile has been fetched yet.
     * @summary Get organization brand
     * @param req express request
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @Get('/brand')
    @OperationId('GetOrganizationBrand')
    async getOrganizationBrand(
        @Request() req: express.Request,
    ): Promise<ApiOrganizationBrandResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getOrganizationBrandService()
                .getBrand(req.account),
        };
    }

    /**
     * Fetch the brand profile for a domain from Brandfetch without storing it.
     * Used to preview a brand in the appearance settings before saving.
     * Requires the Brandfetch API key to be configured on the instance.
     * @summary Fetch organization brand
     * @param req express request
     * @param body the domain to fetch the brand for
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @Post('/brand/fetch')
    @OperationId('FetchOrganizationBrand')
    async fetchOrganizationBrand(
        @Request() req: express.Request,
        @Body() body: UpdateOrganizationBrandRequest,
    ): Promise<ApiOrganizationBrandResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getOrganizationBrandService()
                .fetchBrandFromDomain(req.account, body.domain),
        };
    }

    /**
     * Save the organization's brand appearance as edited by the user. Stores the
     * provided colors, logos, fonts and domain as-is without calling Brandfetch.
     * @summary Save organization brand
     * @param req express request
     * @param body the brand appearance to persist
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @Put('/brand')
    @OperationId('SaveOrganizationBrand')
    async saveOrganizationBrand(
        @Request() req: express.Request,
        @Body() body: SaveOrganizationBrandRequest,
    ): Promise<ApiOrganizationBrandResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getOrganizationBrandService()
                .saveBrand(req.account, body),
        };
    }

    /**
     * Upload a logo image for the organization brand. Send the raw image bytes
     * as the body (PNG, JPEG, WebP, GIF or SVG). Returns the URL to store in
     * the brand's logos when saving the brand.
     * @summary Upload organization brand logo
     * @param req express request
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('201', 'Created')
    @Post('/brand/logos')
    @OperationId('UploadOrganizationBrandLogo')
    async uploadOrganizationBrandLogo(
        @Request() req: express.Request,
    ): Promise<ApiOrganizationBrandLogoUploadResponse> {
        assertRegisteredAccount(req.account);
        const contentLength = parseInt(req.headers['content-length'] ?? '', 10);
        if (Number.isNaN(contentLength) || contentLength <= 0) {
            throw new ParameterError(
                'Content-Length must be a positive integer',
            );
        }
        this.setStatus(201);
        return {
            status: 'ok',
            results: await this.services
                .getOrganizationBrandService()
                .uploadBrandLogo(req.account, { body: req, contentLength }),
        };
    }

    /**
     * Get an uploaded organization brand logo image.
     * @summary Get organization brand logo
     * @param req express request
     * @param logoUuid the uuid of the uploaded logo
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/brand/logos/{logoUuid}')
    @OperationId('GetOrganizationBrandLogo')
    async getOrganizationBrandLogo(
        @Request() req: express.Request,
        @Path() logoUuid: UUID,
    ): Promise<void> {
        assertRegisteredAccount(req.account);
        const { contentType, data } = await this.services
            .getOrganizationBrandService()
            .getBrandLogo(req.account, logoUuid);
        const { res } = req as express.Request & { res: express.Response };
        res.status(200);
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Length', String(data.length));
        res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader(
            'Content-Security-Policy',
            "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        );
        res.end(data);
    }
}
