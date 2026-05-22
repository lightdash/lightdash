import {
    ApiAiAgentDocumentResponse,
    ApiAiAgentDocumentSummaryListResponse,
    ApiCreateAiAgentDocument,
    ApiErrorPayload,
    ApiSuccessEmpty,
    assertRegisteredAccount,
    ParameterError,
} from '@lightdash/common';
import {
    Body,
    Delete,
    Get,
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
import { toSessionUser } from '../../auth/account';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
} from '../../controllers/authentication';
import { BaseController } from '../../controllers/baseController';
import { type AiAgentDocumentService } from '../services/AiAgentDocumentService';

@Route('/api/v1/aiAgents/documents')
@Response<ApiErrorPayload>('default', 'Error')
export class AiAgentDocumentController extends BaseController {
    private getService(): AiAgentDocumentService {
        return this.services.getAiAgentDocumentService<AiAgentDocumentService>();
    }

    private static parseContentLength(req: express.Request): number {
        if (!req.headers['content-length']) {
            throw new ParameterError('Content-Length header is required');
        }
        const contentLength = parseInt(req.headers['content-length'], 10);
        if (Number.isNaN(contentLength) || contentLength <= 0) {
            throw new ParameterError(
                'Content-Length must be a positive integer',
            );
        }
        return contentLength;
    }

    private static parseAgentAccess(agentAccess?: string): string[] {
        return (
            agentAccess
                ?.split(',')
                .map((value) => value.trim())
                .filter(Boolean) ?? []
        );
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/')
    @OperationId('listAiAgentDocuments')
    async listDocuments(
        @Request() req: express.Request,
        @Query() projectUuid?: string,
    ): Promise<ApiAiAgentDocumentSummaryListResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getService().listDocuments(
                toSessionUser(req.account),
                { projectUuid: projectUuid ?? undefined },
            ),
        };
    }

    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('201', 'Created')
    @Post('/')
    @OperationId('createAiAgentDocument')
    async createDocument(
        @Request() req: express.Request,
        @Body() body: ApiCreateAiAgentDocument,
    ): Promise<ApiAiAgentDocumentResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(201);
        return {
            status: 'ok',
            results: await this.getService().createDocument(
                toSessionUser(req.account),
                body,
            ),
        };
    }

    /**
     * Upload a knowledge document. Send raw file bytes as the body with
     * Content-Type and Content-Length headers. Pass filename, optional name,
     * projectUuid, and comma-separated agentAccess as query parameters.
     * @summary Upload AI agent knowledge document
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('201', 'Created')
    @Post('/upload')
    @OperationId('uploadAiAgentDocument')
    async uploadDocument(
        @Request() req: express.Request,
        @Query() filename: string,
        @Query() name?: string,
        @Query() projectUuid?: string,
        @Query() agentAccess?: string,
    ): Promise<ApiAiAgentDocumentResponse> {
        assertRegisteredAccount(req.account);
        const contentType = req.headers['content-type'];
        if (!contentType) {
            throw new ParameterError('Content-Type header is required');
        }

        this.setStatus(201);
        return {
            status: 'ok',
            results: await this.getService().uploadDocument(
                toSessionUser(req.account),
                {
                    originalFilename: filename,
                    name,
                    mimeType: contentType,
                    body: req,
                    contentLength:
                        AiAgentDocumentController.parseContentLength(req),
                    projectUuid: projectUuid ?? undefined,
                    agentAccess:
                        AiAgentDocumentController.parseAgentAccess(agentAccess),
                },
            ),
        };
    }

    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Delete('/{documentUuid}')
    @OperationId('deleteAiAgentDocument')
    async deleteDocument(
        @Request() req: express.Request,
        @Path() documentUuid: string,
    ): Promise<ApiSuccessEmpty> {
        assertRegisteredAccount(req.account);
        await this.getService().deleteDocument(
            toSessionUser(req.account),
            documentUuid,
        );
        this.setStatus(200);
        return {
            status: 'ok',
            results: undefined,
        };
    }
}
