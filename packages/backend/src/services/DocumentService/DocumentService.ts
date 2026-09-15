import { subject } from '@casl/ability';
import {
    applyDocumentCellOperations,
    buildMergeQueryFromSaved,
    ConflictError,
    DOCUMENT_SCHEMA_VERSION,
    FeatureFlags,
    ForbiddenError,
    NotFoundError,
    ParameterError,
    parseDocumentContent,
    type CreateDocumentRequest,
    type Document,
    type DocumentContentV1,
    type DocumentList,
    type MetricQuery,
    type ParametersValuesMap,
    type RegisteredAccount,
    type UpdateDocumentContentRequest,
    type UpdateDocumentMetadataRequest,
} from '@lightdash/common';
import { isEqual } from 'lodash';
import pLimit from 'p-limit';
import type { DocumentModel } from '../../models/DocumentModel';
import type { FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import type { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { BaseService } from '../BaseService';
import { normalizeFilterIds } from '../CoderService/filterIds';
import type { ProjectService } from '../ProjectService/ProjectService';
import type { SpacePermissionService } from '../SpaceService/SpacePermissionService';

type DocumentServiceArguments = {
    documentModel: DocumentModel;
    featureFlagModel: FeatureFlagModel;
    projectModel: ProjectModel;
    spacePermissionService: SpacePermissionService;
    projectService: ProjectService;
};

const MAX_CONCURRENT_CHART_VALIDATIONS = 4;

export class DocumentService extends BaseService {
    constructor(private readonly dependencies: DocumentServiceArguments) {
        super();
    }

    async create(
        account: RegisteredAccount,
        projectUuid: string,
        input: CreateDocumentRequest,
    ): Promise<Document> {
        const project = await this.assertProjectAccess(account, projectUuid);
        const context =
            await this.dependencies.spacePermissionService.resolveAccess(
                account.user.userUuid,
                { type: 'space', spaceUuid: input.spaceUuid },
            );
        if (
            context.projectUuid !== projectUuid ||
            context.organizationUuid !== project.organizationUuid
        ) {
            throw new NotFoundError('Space not found');
        }
        if (
            this.createAuditedAbility(account).cannot(
                'create',
                subject('Document', context),
            )
        ) {
            throw new ForbiddenError(
                'You do not have permission to create Documents in this Space',
            );
        }
        DocumentService.validateMetadata(input);
        const content = parseDocumentContent(
            input.schemaVersion,
            input.content,
        );
        await this.validateCharts(account, projectUuid, content);
        return this.dependencies.documentModel.create({
            ...input,
            content,
            projectUuid,
            createdByUserUuid: account.user.userUuid,
        });
    }

    async updateMetadata(
        account: RegisteredAccount,
        projectUuid: string,
        documentUuid: string,
        input: UpdateDocumentMetadataRequest,
    ): Promise<Document> {
        const document = await this.get(account, projectUuid, documentUuid);
        await this.assertCanUpdate(account, document);
        DocumentService.validateMetadata(input);
        if (Object.values(input).every((value) => value === undefined)) {
            throw new ParameterError(
                'At least one Document metadata field is required',
            );
        }
        return this.dependencies.documentModel.updateMetadata(
            projectUuid,
            documentUuid,
            input,
        );
    }

    async updateContent(
        account: RegisteredAccount,
        projectUuid: string,
        documentUuid: string,
        input: UpdateDocumentContentRequest,
    ): Promise<Document> {
        const document = await this.get(account, projectUuid, documentUuid);
        await this.assertCanUpdate(account, document);
        if (document.version.versionUuid !== input.baseVersionUuid) {
            throw new ConflictError(
                'Document has changed. Reload it and retry with the latest version UUID',
            );
        }
        const content = applyDocumentCellOperations(
            document.version.content,
            input.operations,
        );
        await this.validateCharts(
            account,
            projectUuid,
            content,
            document.version.content,
        );
        return this.dependencies.documentModel.updateContent(
            projectUuid,
            documentUuid,
            input,
            account.user.userUuid,
        );
    }

    private async assertCanUpdate(
        account: RegisteredAccount,
        document: Document,
    ): Promise<void> {
        const context =
            await this.dependencies.spacePermissionService.resolveAccess(
                account.user.userUuid,
                { type: 'space', spaceUuid: document.spaceUuid },
            );
        if (
            this.createAuditedAbility(account).cannot(
                'update',
                subject('Document', {
                    ...context,
                    projectUuid: document.projectUuid,
                    organizationUuid: document.organizationUuid,
                }),
            )
        ) {
            throw new ForbiddenError(
                'You do not have permission to edit this Document',
            );
        }
    }

    private static validateMetadata(
        input: UpdateDocumentMetadataRequest,
    ): void {
        if (
            input.name !== undefined &&
            (input.name.trim().length === 0 || input.name.length > 255)
        ) {
            throw new ParameterError(
                'Document name must contain 1–255 characters',
            );
        }
        if (
            input.slug !== undefined &&
            (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.slug) ||
                input.slug.length > 255)
        ) {
            throw new ParameterError(
                'Document slug must contain lowercase letters, numbers and single hyphens, up to 255 characters',
            );
        }
    }

    private async validateCharts(
        account: RegisteredAccount,
        projectUuid: string,
        content: DocumentContentV1,
        previous?: DocumentContentV1,
    ): Promise<void> {
        parseDocumentContent(DOCUMENT_SCHEMA_VERSION, content);
        const previousById = new Map(
            previous?.cells.map((cell) => [cell.id, cell]),
        );
        const limit = pLimit(MAX_CONCURRENT_CHART_VALIDATIONS);
        // Compile only changed charts: narrative edits must not require chart authoring capabilities.
        await Promise.all(
            content.cells.map((cell) =>
                limit(async () => {
                    if (
                        cell.type !== 'chart' ||
                        isEqual(previousById.get(cell.id), cell)
                    ) {
                        return;
                    }
                    const { chart } = cell.content;
                    if (chart.tableName !== chart.metricQuery.exploreName) {
                        throw new ParameterError(
                            `Chart tableName must match its exploreName in cell ${cell.id}`,
                        );
                    }
                    const metricQuery = {
                        ...chart.metricQuery,
                        filters: normalizeFilterIds(chart.metricQuery.filters),
                    };
                    if (cell.content.source === 'merge') {
                        // Merge compilation returns join refusals but not tolerant leg compilation errors.
                        await Promise.all(
                            [
                                metricQuery,
                                ...cell.content.chart.merge.sources
                                    .filter((source) => source.kind === 'query')
                                    .map((source) => source.metricQuery),
                            ].map((query) =>
                                this.validateQuery({
                                    account,
                                    projectUuid,
                                    cellId: cell.id,
                                    metricQuery: query,
                                    parameters: chart.parameters,
                                }),
                            ),
                        );
                        const compiled =
                            await this.dependencies.projectService.compileMergeQuery(
                                {
                                    account,
                                    projectUuid,
                                    mergeQuery: buildMergeQueryFromSaved(
                                        metricQuery,
                                        cell.content.chart.merge,
                                    ),
                                    parameters: chart.parameters,
                                    userAttributeOverrides: {},
                                },
                            );
                        if (compiled.errors.length > 0) {
                            throw new ParameterError(
                                `Invalid chart in cell ${cell.id}: ${compiled.errors.map((error) => error.message).join('; ')}`,
                            );
                        }
                        return;
                    }
                    await this.validateQuery({
                        account,
                        projectUuid,
                        cellId: cell.id,
                        metricQuery,
                        parameters: chart.parameters,
                    });
                }),
            ),
        );
    }

    private async validateQuery({
        account,
        projectUuid,
        cellId,
        metricQuery,
        parameters,
    }: {
        account: RegisteredAccount;
        projectUuid: string;
        cellId: string;
        metricQuery: MetricQuery;
        parameters: ParametersValuesMap | undefined;
    }): Promise<void> {
        const compiled = await this.dependencies.projectService.compileQuery({
            account,
            projectUuid,
            exploreName: metricQuery.exploreName,
            body: { ...metricQuery, parameters },
            usePreAggregateCache: false,
        });
        if (compiled.compilationErrors.length > 0) {
            throw new ParameterError(
                `Invalid chart in cell ${cellId}: ${compiled.compilationErrors.join('; ')}`,
            );
        }
        if (compiled.missingParameterReferences.size > 0) {
            throw new ParameterError(
                `Missing parameters in cell ${cellId}: ${[...compiled.missingParameterReferences].join(', ')}`,
            );
        }
    }

    async list(
        account: RegisteredAccount,
        projectUuid: string,
        { limit = 50, offset = 0 }: { limit?: number; offset?: number } = {},
    ): Promise<DocumentList> {
        if (
            !Number.isInteger(limit) ||
            limit < 1 ||
            limit > 100 ||
            !Number.isSafeInteger(offset) ||
            offset < 0
        ) {
            throw new ParameterError(
                'Document pagination requires limit 1–100 and a non-negative integer offset',
            );
        }
        const project = await this.assertProjectAccess(account, projectUuid);
        const spaceUuids =
            await this.dependencies.documentModel.listSpaceUuids(projectUuid);
        const access =
            await this.dependencies.spacePermissionService.resolveAccessBatch(
                account.user.userUuid,
                spaceUuids.map((spaceUuid) => ({
                    type: 'space',
                    spaceUuid,
                })),
            );
        const ability = this.createAuditedAbility(account);
        const allowedSpaceUuids = spaceUuids.filter((_spaceUuid, index) => {
            const context = access[index]?.context;
            return (
                context !== undefined &&
                ability.can(
                    'view',
                    subject('Document', {
                        ...context,
                        organizationUuid: project.organizationUuid,
                        projectUuid,
                    }),
                )
            );
        });
        const items = await this.dependencies.documentModel.list(projectUuid, {
            spaceUuids: allowedSpaceUuids,
            limit: limit + 1,
            offset,
        });
        return {
            items: items.slice(0, limit),
            nextOffset: items.length > limit ? offset + limit : null,
        };
    }

    async get(
        account: RegisteredAccount,
        projectUuid: string,
        documentUuid: string,
    ): Promise<Document> {
        await this.assertProjectAccess(account, projectUuid);
        const document = await this.dependencies.documentModel.get(
            projectUuid,
            documentUuid,
        );
        const context =
            await this.dependencies.spacePermissionService.resolveAccess(
                account.user.userUuid,
                { type: 'space', spaceUuid: document.spaceUuid },
            );
        if (
            this.createAuditedAbility(account).cannot(
                'view',
                subject('Document', {
                    ...context,
                    organizationUuid: document.organizationUuid,
                    projectUuid: document.projectUuid,
                }),
            )
        ) {
            throw new NotFoundError('Document not found');
        }
        return document;
    }

    private async assertProjectAccess(
        account: RegisteredAccount,
        projectUuid: string,
    ) {
        const project =
            await this.dependencies.projectModel.getSummary(projectUuid);
        if (
            this.createAuditedAbility(account).cannot(
                'view',
                subject('Project', project),
            )
        ) {
            throw new NotFoundError('Project not found');
        }
        const flag = await this.dependencies.featureFlagModel.get({
            featureFlagId: FeatureFlags.Documents,
            user: {
                userUuid: account.user.userUuid,
                organizationUuid: project.organizationUuid,
            },
        });
        if (!flag.enabled) {
            throw new ForbiddenError('Documents are not enabled');
        }
        return project;
    }
}
