import {
    assertRegisteredAccount,
    type ApiDocumentListResponse,
    type ApiDocumentResponse,
    type ApiErrorPayload,
    type UUID,
} from '@lightdash/common';
import {
    Get,
    Middlewares,
    OperationId,
    Path,
    Query,
    Request,
    Response,
    Route,
    Tags,
} from '@tsoa/runtime';
import express from 'express';
import { allowApiKeyAuthentication, isAuthenticated } from './authentication';
import { BaseController } from './baseController';

@Route('/api/v1/projects/{projectUuid}/documents')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Documents')
export class DocumentController extends BaseController {
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

    @Get('{documentUuid}')
    @OperationId('GetDocument')
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    async get(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
        @Path() documentUuid: UUID,
    ): Promise<ApiDocumentResponse> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.services
                .getDocumentService()
                .get(req.account, projectUuid, documentUuid),
        };
    }
}
