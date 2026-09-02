import {
    ApiDataAppTemplateImportResponse,
    ApiDataAppTemplateResponse,
    ApiDataAppTemplatesResponse,
    ApiErrorPayload,
    ApiSuccessEmpty,
    assertRegisteredAccount,
    DATA_APP_TEMPLATE_PACKAGE_CONTENT_TYPE,
    MAX_DATA_APP_TEMPLATE_PACKAGE_BYTES,
    ParameterError,
    SaveAppAsTemplateRequest,
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
    Put,
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
import { AppGenerateService } from '../services/AppGenerateService/AppGenerateService';
import { DataAppTemplateService } from '../services/DataAppTemplateService/DataAppTemplateService';

/**
 * Org-level data app templates: packages uploaded with the CLI, stored per
 * organization, and offered in the app builder's template gallery.
 */
@Route('/api/v1/org/data-app-templates')
@Hidden()
@Response<ApiErrorPayload>('default', 'Error')
export class DataAppTemplateController extends BaseController {
    /**
     * List the organization's data app templates.
     * @summary List data app templates
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/')
    @OperationId('ListDataAppTemplates')
    async listTemplates(
        @Request() req: express.Request,
    ): Promise<ApiDataAppTemplatesResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getDataAppTemplateService().list(req.account),
        };
    }

    /**
     * Upload a template package (uncompressed tar of `src/**` plus
     * `AGENTS.md`) as the raw request body. Replaces the template with the
     * same slug when the organization already has one.
     * @summary Import data app template package
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Put('/package')
    @OperationId('ImportDataAppTemplatePackage')
    async importPackage(
        @Request() req: express.Request,
    ): Promise<ApiDataAppTemplateImportResponse> {
        assertRegisteredAccount(req.account);
        const contentType = req.headers['content-type']
            ?.split(';')[0]
            .trim()
            .toLowerCase();
        if (contentType !== DATA_APP_TEMPLATE_PACKAGE_CONTENT_TYPE) {
            throw new ParameterError(
                `Content-Type must be ${DATA_APP_TEMPLATE_PACKAGE_CONTENT_TYPE}`,
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
            contentLength > MAX_DATA_APP_TEMPLATE_PACKAGE_BYTES
        ) {
            throw new ParameterError(
                `Content-Length must be between 1 and ${MAX_DATA_APP_TEMPLATE_PACKAGE_BYTES}`,
            );
        }

        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getDataAppTemplateService().importPackage(
                req.account,
                { body: req, contentLength },
            ),
        };
    }

    /**
     * Save a built data app as an organization template: its current source
     * becomes the package, with the manifest identity and questions from the
     * request. Needs view access to the app and create:DataAppTemplate.
     * @summary Save app as data app template
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Post('/from-app')
    @OperationId('SaveAppAsDataAppTemplate')
    async saveAppAsTemplate(
        @Request() req: express.Request,
        @Body() body: SaveAppAsTemplateRequest,
    ): Promise<ApiDataAppTemplateImportResponse> {
        assertRegisteredAccount(req.account);
        const code = await this.services
            .getAppGenerateService<AppGenerateService>()
            .getAppCode(
                toSessionUser(req.account),
                body.projectUuid,
                body.appUuid,
            );
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getDataAppTemplateService().importFromApp(
                req.account,
                body,
                code.files,
            ),
        };
    }

    /**
     * Get one of the organization's data app templates by slug.
     * @summary Get data app template
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/{slug}')
    @OperationId('GetDataAppTemplate')
    async getTemplate(
        @Request() req: express.Request,
        @Path() slug: string,
    ): Promise<ApiDataAppTemplateResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getDataAppTemplateService().get(
                req.account,
                slug,
            ),
        };
    }

    /**
     * Delete a data app template and its stored files.
     * @summary Delete data app template
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Delete('/{slug}')
    @OperationId('DeleteDataAppTemplate')
    async deleteTemplate(
        @Request() req: express.Request,
        @Path() slug: string,
    ): Promise<ApiSuccessEmpty> {
        assertRegisteredAccount(req.account);
        await this.getDataAppTemplateService().delete(req.account, slug);
        this.setStatus(200);
        return { status: 'ok', results: undefined };
    }

    protected getDataAppTemplateService() {
        return this.services.getDataAppTemplateService<DataAppTemplateService>();
    }
}
