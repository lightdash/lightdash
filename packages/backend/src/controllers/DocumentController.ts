import {
    assertRegisteredAccount,
    ParameterError,
    type ApiDocumentAsCodeResponse,
    type ApiDocumentCellQueryResponse,
    type ApiDocumentListResponse,
    type ApiDocumentResponse,
    type ApiErrorPayload,
    type CreateDocumentRequest,
    type DuplicateDocumentRequest,
    type ExecuteDocumentCellQueryRequest,
    type UpdateDocumentContentRequest,
    type UpdateDocumentMetadataRequest,
    type UUID,
    type UuidOrSlug,
} from '@lightdash/common';
import {
    Body,
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
} from './authentication';
import { BaseController } from './baseController';

@Route('/api/v1/projects/{projectUuid}/documents')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Documents')
export class DocumentController extends BaseController {
    @Post('{documentUuid}/cells/{cellIndex}/query')
    @OperationId('ExecuteDocumentCellQuery')
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    async executeCellQuery(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
        @Path() documentUuid: UUID,
        @Path() cellIndex: number,
        @Body() body: ExecuteDocumentCellQueryRequest,
    ): Promise<ApiDocumentCellQueryResponse> {
        assertRegisteredAccount(req.account);
        if (Object.keys(req.body).some((key) => key !== 'versionUuid')) {
            throw new ParameterError(
                'Document chart queries accept only a versionUuid',
            );
        }
        return {
            status: 'ok',
            results: await this.services
                .getAsyncQueryService()
                .executeAsyncDocumentCellQuery({
                    account: req.account,
                    projectUuid,
                    reference: {
                        documentUuid,
                        cellIndex,
                        versionUuid: body.versionUuid,
                    },
                }),
        };
    }

    @Post()
    @OperationId('CreateDocument')
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    async create(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
        @Body() body: CreateDocumentRequest,
    ): Promise<ApiDocumentResponse> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.services
                .getDocumentService()
                .create(req.account, projectUuid, body),
        };
    }

    @Post('{documentUuidOrSlug}/duplicate')
    @OperationId('DuplicateDocument')
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    async duplicate(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
        @Path() documentUuidOrSlug: UuidOrSlug,
        @Body() body: DuplicateDocumentRequest,
    ): Promise<ApiDocumentResponse> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.services
                .getDocumentService()
                .duplicate(req.account, projectUuid, documentUuidOrSlug, body),
        };
    }

    // Share GET's path template so OpenAPI groups both operations together.
    @Patch('{documentUuidOrSlug}')
    @OperationId('UpdateDocumentMetadata')
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    async updateMetadata(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
        @Path('documentUuidOrSlug') documentUuid: UUID,
        @Body() body: UpdateDocumentMetadataRequest,
    ): Promise<ApiDocumentResponse> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.services
                .getDocumentService()
                .updateMetadata(req.account, projectUuid, documentUuid, body),
        };
    }

    @Post('{documentUuid}/versions')
    @OperationId('UpdateDocumentContent')
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    async updateContent(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
        @Path() documentUuid: UUID,
        @Body() body: UpdateDocumentContentRequest,
    ): Promise<ApiDocumentResponse> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.services
                .getDocumentService()
                .updateContent(req.account, projectUuid, documentUuid, body),
        };
    }

    @Get()
    @OperationId('ListDocuments')
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    async list(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
        @Query() limit?: number,
        @Query() offset?: number,
    ): Promise<ApiDocumentListResponse> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.services
                .getDocumentService()
                .list(req.account, projectUuid, { limit, offset }),
        };
    }

    @Get('{documentUuidOrSlug}/as-code')
    @OperationId('GetDocumentAsCode')
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    async getAsCode(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
        @Path() documentUuidOrSlug: UuidOrSlug,
    ): Promise<ApiDocumentAsCodeResponse> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.services
                .getDocumentService()
                .getAsCode(req.account, projectUuid, documentUuidOrSlug),
        };
    }

    @Get('{documentUuidOrSlug}')
    @OperationId('GetDocument')
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    async get(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
        @Path() documentUuidOrSlug: UuidOrSlug,
    ): Promise<ApiDocumentResponse> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.services
                .getDocumentService()
                .getByIdOrSlug(req.account, projectUuid, documentUuidOrSlug),
        };
    }
}
