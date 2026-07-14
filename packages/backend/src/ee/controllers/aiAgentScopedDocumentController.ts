import {
    ApiAiAgentDocumentContentResponse,
    ApiAiAgentDocumentResponse,
    ApiAiAgentDocumentSummaryListResponse,
    ApiCreateAgentDocument,
    ApiErrorPayload,
    ApiSuccessEmpty,
    ApiUpdateAgentDocument,
    ApiUpdateAgentDocumentContent,
    assertRegisteredAccount,
    type UUID,
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

@Route('/api/v1/projects/{projectUuid}/aiAgents/{agentUuid}/documents')
@Response<ApiErrorPayload>('default', 'Error')
export class AiAgentScopedDocumentController extends BaseController {
    private getService(): AiAgentDocumentService {
        return this.services.getAiAgentDocumentService<AiAgentDocumentService>();
    }

    /**
     * List the knowledge documents this agent can use: the organization level
     * documents plus the ones granted to this agent in this project.
     * @summary List agent documents
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/')
    @OperationId('listAgentDocuments')
    async listDocuments(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
        @Path() agentUuid: UUID,
    ): Promise<ApiAiAgentDocumentSummaryListResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getService().listDocuments(
                toSessionUser(req.account),
                { projectUuid, agentUuid },
            ),
        };
    }

    /**
     * Create a knowledge document scoped to this project and agent.
     * @summary Create agent document
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('201', 'Created')
    @Post('/')
    @OperationId('createAgentDocument')
    async createDocument(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
        @Path() agentUuid: UUID,
        @Body() body: ApiCreateAgentDocument,
    ): Promise<ApiAiAgentDocumentResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(201);
        return {
            status: 'ok',
            results: await this.getService().createDocument(
                toSessionUser(req.account),
                { projectUuid, agentUuid },
                body,
            ),
        };
    }

    /**
     * Read the full content of a knowledge document this agent can use.
     * @summary Get agent document content
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/{documentUuid}/content')
    @OperationId('getAgentDocumentContent')
    async getDocumentContent(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
        @Path() agentUuid: UUID,
        @Path() documentUuid: UUID,
    ): Promise<ApiAiAgentDocumentContentResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getService().getDocumentContent(
                toSessionUser(req.account),
                { projectUuid, agentUuid },
                documentUuid,
            ),
        };
    }

    /**
     * Replace the name and content of a knowledge document this agent can use.
     * @summary Update agent document content
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Patch('/{documentUuid}/content')
    @OperationId('updateAgentDocumentContent')
    async updateDocumentContent(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
        @Path() agentUuid: UUID,
        @Path() documentUuid: UUID,
        @Body() body: ApiUpdateAgentDocumentContent,
    ): Promise<ApiAiAgentDocumentResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getService().updateDocumentContent(
                toSessionUser(req.account),
                { projectUuid, agentUuid },
                documentUuid,
                body,
            ),
        };
    }

    /**
     * Choose whether the full knowledge document is included in every prompt.
     * @summary Update agent document
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Patch('/{documentUuid}')
    @OperationId('updateAgentDocument')
    async updateDocument(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
        @Path() agentUuid: UUID,
        @Path() documentUuid: UUID,
        @Body() body: ApiUpdateAgentDocument,
    ): Promise<ApiSuccessEmpty> {
        assertRegisteredAccount(req.account);
        await this.getService().updateDocument(
            toSessionUser(req.account),
            { projectUuid, agentUuid },
            documentUuid,
            body,
        );
        this.setStatus(200);
        return {
            status: 'ok',
            results: undefined,
        };
    }

    /**
     * Delete a knowledge document this agent can use.
     * @summary Delete agent document
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Delete('/{documentUuid}')
    @OperationId('deleteAgentDocument')
    async deleteDocument(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
        @Path() agentUuid: UUID,
        @Path() documentUuid: UUID,
    ): Promise<ApiSuccessEmpty> {
        assertRegisteredAccount(req.account);
        await this.getService().deleteDocument(
            toSessionUser(req.account),
            { projectUuid, agentUuid },
            documentUuid,
        );
        this.setStatus(200);
        return {
            status: 'ok',
            results: undefined,
        };
    }
}
