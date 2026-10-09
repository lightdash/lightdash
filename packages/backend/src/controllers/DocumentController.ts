import {
    assertRegisteredAccount,
    getRequestMethod,
    LightdashRequestMethodHeader,
    ParameterError,
    RequestMethod,
    type ApiContentVerificationDeleteResponse,
    type ApiContentVerificationResponse,
    type ApiDocumentAsCodeResponse,
    type ApiDocumentChartQueryResponse,
    type ApiDocumentListResponse,
    type ApiDocumentResponse,
    type ApiDocumentsLinkingChartResponse,
    type ApiDocumentVersionListResponse,
    type ApiErrorPayload,
    type ApiJobScheduledResponse,
    type ApiPromoteDocumentResponse,
    type ApiPromotionChangesResponse,
    type ApiTogglePinnedItem,
    type CreateDocumentRequest,
    type DuplicateDocumentRequest,
    type ExecuteDocumentChartQueryRequest,
    type UpdateDocumentContentRequest,
    type UpdateDocumentMetadataRequest,
    type UUID,
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
    Query,
    Request,
    Response,
    Route,
    Tags,
} from '@tsoa/runtime';
import express from 'express';
import type { DocumentChangeContext } from '../services/DocumentService/DocumentService';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
} from './authentication';
import { BaseController } from './baseController';

/** The web app marks its requests; anything else is an API client. */
const getDocumentChange = (req: express.Request): DocumentChangeContext => ({
    source:
        getRequestMethod(req.header(LightdashRequestMethodHeader)) ===
        RequestMethod.WEB_APP
            ? 'editor'
            : 'api',
});

@Route('/api/v1/projects/{projectUuid}/documents')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Documents')
export class DocumentController extends BaseController {
    @Post('{documentUuid}/charts/{chartId}/query')
    @OperationId('ExecuteDocumentChartQuery')
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    async executeChartQuery(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
        @Path() documentUuid: UUID,
        @Path() chartId: string,
        @Body() body: ExecuteDocumentChartQueryRequest,
    ): Promise<ApiDocumentChartQueryResponse> {
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
                .executeAsyncDocumentChartQuery({
                    account: req.account,
                    projectUuid,
                    reference: {
                        documentUuid,
                        chartId,
                        versionUuid: body.versionUuid,
                    },
                }),
        };
    }

    @Patch('{documentUuidOrSlug}/pinning')
    @OperationId('ToggleDocumentPin')
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    async togglePin(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
        @Path() documentUuidOrSlug: UuidOrSlug,
    ): Promise<ApiTogglePinnedItem> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.services
                .getPinningService()
                .toggleDocumentPin(
                    req.account,
                    projectUuid,
                    documentUuidOrSlug,
                ),
        };
    }

    /**
     * Verify a Document
     * @summary Verify Document
     */
    @Post('{documentUuid}/verification')
    @OperationId('VerifyDocument')
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    async verify(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
        @Path() documentUuid: UUID,
    ): Promise<ApiContentVerificationResponse> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.services
                .getDocumentService()
                .verify(req.account, projectUuid, documentUuid),
        };
    }

    /**
     * Remove verification from a Document
     * @summary Unverify Document
     */
    @Delete('{documentUuid}/verification')
    @OperationId('UnverifyDocument')
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    async unverify(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
        @Path() documentUuid: UUID,
    ): Promise<ApiContentVerificationDeleteResponse> {
        assertRegisteredAccount(req.account);
        await this.services
            .getDocumentService()
            .unverify(req.account, projectUuid, documentUuid);
        return { status: 'ok', results: undefined };
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
                .create(req.account, projectUuid, body, getDocumentChange(req)),
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

    /**
     * Export the Document as a paginated PDF, rendered with your access.
     * Poll `GET /api/v1/schedulers/job/{jobId}/status`; the completed job's
     * details hold the file `url` and `numFailures` (charts that failed to load).
     * @summary Export document as PDF
     */
    @Post('{documentUuidOrSlug}/exports/pdf')
    @OperationId('ExportDocumentPdf')
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    async exportPdf(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
        @Path() documentUuidOrSlug: UuidOrSlug,
    ): Promise<ApiJobScheduledResponse> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.services
                .getDocumentService()
                .scheduleExportPdf(
                    req.account,
                    projectUuid,
                    documentUuidOrSlug,
                ),
        };
    }

    /**
     * Preview promoting a Document to its upstream project: the spaces, custom
     * chart types and Document it would create or update.
     * @summary Get Document promotion diff
     */
    @Get('{documentUuid}/promoteDiff')
    @OperationId('GetDocumentPromotionDiff')
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    async getPromotionDiff(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
        @Path() documentUuid: UUID,
    ): Promise<ApiPromotionChangesResponse> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.services
                .getPromoteService()
                .getPromoteDocumentDiff(req.account, projectUuid, documentUuid),
        };
    }

    /**
     * Promote a Document to its upstream project.
     * @summary Promote Document
     */
    @Post('{documentUuid}/promote')
    @OperationId('PromoteDocument')
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    async promote(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
        @Path() documentUuid: UUID,
    ): Promise<ApiPromoteDocumentResponse> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.services
                .getPromoteService()
                .promoteDocument(req.account, projectUuid, documentUuid),
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
                .updateMetadata(req.account, projectUuid, documentUuid, body, {
                    change: getDocumentChange(req),
                }),
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
                .updateContent(req.account, projectUuid, documentUuid, body, {
                    change: getDocumentChange(req),
                }),
        };
    }

    // Same path template as UpdateDocumentContent, so OpenAPI sees one path.
    @Get('{documentUuid}/versions')
    @OperationId('ListDocumentVersions')
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    async listVersions(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
        @Path() documentUuid: UUID,
        @Query() limit?: number,
        @Query() offset?: number,
    ): Promise<ApiDocumentVersionListResponse> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.services
                .getDocumentService()
                .listVersions(req.account, projectUuid, documentUuid, {
                    limit,
                    offset,
                }),
        };
    }

    @Get('{documentUuid}/versions/{versionUuid}')
    @OperationId('GetDocumentVersion')
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    async getVersion(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
        @Path() documentUuid: UUID,
        @Path() versionUuid: UUID,
    ): Promise<ApiDocumentResponse> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.services
                .getDocumentService()
                .getVersion(
                    req.account,
                    projectUuid,
                    documentUuid,
                    versionUuid,
                ),
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

    /**
     * The Documents you can view whose current version links a saved chart or saved SQL chart
     * @summary Documents linking a chart
     * @param savedChartUuid The saved chart; pass this or savedSqlUuid
     * @param savedSqlUuid The saved SQL chart; pass this or savedChartUuid
     */
    @Get('linking-chart')
    @OperationId('ListDocumentsLinkingChart')
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    async listDocumentsLinkingChart(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
        @Query() savedChartUuid?: UUID,
        @Query() savedSqlUuid?: UUID,
    ): Promise<ApiDocumentsLinkingChartResponse> {
        assertRegisteredAccount(req.account);
        const chartUuid = savedChartUuid ?? savedSqlUuid;
        if (!chartUuid || (savedChartUuid && savedSqlUuid)) {
            throw new ParameterError(
                'Pass exactly one of savedChartUuid or savedSqlUuid',
            );
        }
        return {
            status: 'ok',
            results: await this.services
                .getDocumentService()
                .listDocumentsLinkingChart(
                    req.account,
                    projectUuid,
                    savedChartUuid ? 'chart' : 'sqlChart',
                    chartUuid,
                ),
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
                .view(req.account, projectUuid, documentUuidOrSlug),
        };
    }
}
