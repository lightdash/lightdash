import { subject } from '@casl/ability';
import {
    buildMergeQueryFromSaved,
    ChartType,
    ConflictError,
    ContentType,
    DirectAccessResourceType,
    DOCUMENT_SCHEMA_VERSION,
    FeatureFlags,
    ForbiddenError,
    formatDocumentTag,
    getContentAsCodePathFromLtreePath,
    getDataAppVizChartConfigErrors,
    getDocumentSavedChartLinks,
    getLtreePathFromContentAsCodePath,
    getSavedChartTagName,
    mapDocumentCharts,
    mapDocumentSavedChartLinks,
    matchDocumentChartKeys,
    NotFoundError,
    ParameterError,
    parseDocumentAsCode,
    parseDocumentContent,
    PromotionAction,
    SCHEDULER_TASKS,
    type ContentAsCodeUpsertAction,
    type ContentVerificationInfo,
    type CreateDocumentRequest,
    type Document,
    type DocumentAsCode,
    type DocumentAsCodeList,
    type DocumentChartContent,
    type DocumentContent,
    type DocumentLinkingChart,
    type DocumentList,
    type DocumentQueryReference,
    type DocumentSavedChartKind,
    type DocumentSummary,
    type DocumentVersionList,
    type DuplicateDocumentRequest,
    type MetricQuery,
    type ParametersValuesMap,
    type RegisteredAccount,
    type UpdateDocumentMetadataRequest,
    type UUID,
    type UuidOrSlug,
} from '@lightdash/common';
import type { Knex } from 'knex';
import { isEqual } from 'lodash';
import pLimit from 'p-limit';
import { validate as isUuid } from 'uuid';
import type {
    DocumentChangeSource,
    DocumentChartCounts,
    LightdashAnalytics,
} from '../../analytics/LightdashAnalytics';
import type { LightdashConfig } from '../../config/parseConfig';
import { type AgentActionLogModel } from '../../models/AgentActionLogModel';
import type { AnalyticsModel } from '../../models/AnalyticsModel';
import type { AppModel } from '../../models/AppModel';
import type { ContentVerificationModel } from '../../models/ContentVerificationModel';
import type {
    DocumentContentUpdate,
    DocumentModel,
    SavedChartForLink,
} from '../../models/DocumentModel';
import type { FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import type { OrganizationMemberProfileModel } from '../../models/OrganizationMemberProfileModel';
import type { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import type { SpaceModel } from '../../models/SpaceModel';
import type { SchedulerClient } from '../../scheduler/SchedulerClient';
import { getContentWriteAgentIdentity } from '../AiAccessService/agentExecutionContext';
import { logAgentContentWrite } from '../AiAccessService/logAgentContentWrite';
import { BaseService } from '../BaseService';
import { resolveDataAppVizBinding } from '../CoderService/dataAppVizBinding';
import { normalizeFilterIds } from '../CoderService/filterIds';
import {
    getContentConnectionName,
    listContentConnections,
    resolveContentConnection,
    type ContentConnectionModels,
} from '../CoderService/handlers/contentConnections';
import type { DirectAccessService } from '../DirectAccess/DirectAccessService';
import type { ProjectService } from '../ProjectService/ProjectService';
import type {
    AccessTarget,
    SpacePermissionService,
} from '../SpaceService/SpacePermissionService';
import {
    assertCanMutateVerifiedContent,
    getVerificationAfterUpdate,
} from '../verifiedContentGuards';

/** Who made a Document change, for analytics. */
export type DocumentChangeContext = {
    source: DocumentChangeSource;
    aiPromptUuid?: string;
    aiThreadUuid?: string;
};

const API_CHANGE: DocumentChangeContext = { source: 'api' };

const getAccessTarget = (
    document: DocumentSummary,
): Extract<AccessTarget, { type: 'document' | 'personalDocument' }> =>
    document.spaceUuid === null
        ? {
              type: 'personalDocument',
              organizationUuid: document.organizationUuid,
              projectUuid: document.projectUuid,
              createdByUserUuid: document.createdByUserUuid,
              spaceUuid: null,
          }
        : {
              type: 'document',
              documentUuid: document.documentUuid,
              spaceUuid: document.spaceUuid,
          };

type DocumentServiceArguments = {
    agentActionLogModel: Pick<AgentActionLogModel, 'insert'>;
    lightdashConfig: LightdashConfig;
    analytics: LightdashAnalytics;
    analyticsModel: Pick<AnalyticsModel, 'addDocumentViewEvent'>;
    appModel: Pick<
        AppModel,
        | 'findAppsBySlugs'
        | 'findAppsByUuids'
        | 'getVersion'
        | 'getLatestRenderableDataAppVizVersion'
    >;
    contentVerificationModel: Pick<
        ContentVerificationModel,
        'getByContent' | 'verify' | 'unverify'
    >;
    documentModel: DocumentModel;
    directAccessService: DirectAccessService;
    featureFlagModel: FeatureFlagModel;
    organizationMemberProfileModel: Pick<
        OrganizationMemberProfileModel,
        'getOrganizationMemberByUuid'
    >;
    projectModel: ProjectModel;
    schedulerClient: Pick<SchedulerClient, 'scheduleTask'>;
    spaceModel: SpaceModel;
    spacePermissionService: SpacePermissionService;
    projectService: ProjectService;
    warehouseConnectionModel: ContentConnectionModels['warehouseConnectionModel'];
};

const MAX_CONCURRENT_CHART_VALIDATIONS = 4;
const MAX_CONCURRENT_PROJECT_ACCESS_CHECKS = 4;
const MAX_CONCURRENT_AS_CODE_READS = 4;
const DOCUMENT_AS_CODE_PAGE_SIZE = 50;

export class DocumentService extends BaseService {
    constructor(private readonly dependencies: DocumentServiceArguments) {
        super();
    }

    private async authorizeDelete(
        account: RegisteredAccount,
        projectUuid: string,
        documentUuid: string,
    ) {
        await this.assertProjectAccess(account, projectUuid);
        const document =
            await this.dependencies.documentModel.getLifecycleState(
                projectUuid,
                documentUuid,
            );
        if (document.deletedAt || document.spaceDeletedAt) {
            throw new NotFoundError('Document not found');
        }
        const context =
            await this.dependencies.spacePermissionService.getDocumentDeleteAccessContext(
                account.user.userUuid,
                getAccessTarget(document),
            );
        if (
            this.createAuditedAbility(account).cannot(
                'delete',
                subject('Document', {
                    ...context,
                    organizationUuid: document.organizationUuid,
                    projectUuid: document.projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError(
                'You do not have permission to delete this Document',
            );
        }
        await this.assertCanMutateVerifiedDocument(account, document);
        return document;
    }

    async delete(
        account: RegisteredAccount,
        projectUuid: string,
        documentUuid: string,
    ): Promise<void> {
        const document = await this.authorizeDelete(
            account,
            projectUuid,
            documentUuid,
        );
        const { softDelete } = this.dependencies.lightdashConfig;
        if (softDelete.enabled) {
            await this.dependencies.documentModel.softDelete(
                projectUuid,
                documentUuid,
                account.user.userUuid,
                document.spaceUuid,
            );
        } else {
            await this.dependencies.documentModel.permanentDelete(
                projectUuid,
                documentUuid,
                {
                    expectedSpaceUuid: document.spaceUuid,
                    requireDeleted: false,
                },
            );
        }
        this.dependencies.analytics.track({
            event: 'document.deleted',
            userId: account.user.userUuid,
            properties: {
                organizationId: document.organizationUuid,
                projectId: document.projectUuid,
                documentId: documentUuid,
                softDelete: softDelete.enabled,
            },
        });
    }

    async softDelete(
        account: RegisteredAccount,
        projectUuid: string,
        documentUuid: string,
    ): Promise<void> {
        const document = await this.authorizeDelete(
            account,
            projectUuid,
            documentUuid,
        );
        await this.dependencies.documentModel.softDelete(
            projectUuid,
            documentUuid,
            account.user.userUuid,
            document.spaceUuid,
        );
    }

    async restore(
        account: RegisteredAccount,
        projectUuid: string,
        documentUuid: string,
    ): Promise<void> {
        await this.assertProjectAccess(account, projectUuid);
        const document =
            await this.dependencies.documentModel.getLifecycleState(
                projectUuid,
                documentUuid,
            );
        if (!document.deletedAt) {
            throw new NotFoundError('Deleted Document not found');
        }
        if (
            this.createAuditedAbility(account).cannot(
                'manage',
                subject('DeletedContent', {
                    organizationUuid: document.organizationUuid,
                    projectUuid: document.projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError(
                'You do not have permission to restore Documents',
            );
        }
        await this.dependencies.documentModel.restore(
            projectUuid,
            documentUuid,
        );
        this.dependencies.analytics.track({
            event: 'document.restored',
            userId: account.user.userUuid,
            properties: {
                organizationId: document.organizationUuid,
                projectId: document.projectUuid,
                documentId: documentUuid,
            },
        });
    }

    async permanentDelete(
        account: RegisteredAccount,
        projectUuid: string,
        documentUuid: string,
    ): Promise<void> {
        await this.assertProjectAccess(account, projectUuid);
        const document =
            await this.dependencies.documentModel.getLifecycleState(
                projectUuid,
                documentUuid,
            );
        if (!document.deletedAt) {
            throw new NotFoundError('Deleted Document not found');
        }
        const ability = this.createAuditedAbility(account);
        const context = {
            organizationUuid: document.organizationUuid,
            projectUuid: document.projectUuid,
        };
        if (
            ability.cannot('manage', subject('DeletedContent', context)) ||
            ability.cannot('manage', subject('Document', { ...context }))
        ) {
            throw new ForbiddenError(
                'You do not have permission to permanently delete Documents',
            );
        }
        await this.dependencies.documentModel.permanentDelete(
            projectUuid,
            documentUuid,
        );
    }

    async create(
        account: RegisteredAccount,
        projectUuid: string,
        input: CreateDocumentRequest,
        change: DocumentChangeContext = API_CHANGE,
        {
            uniqueSlug,
            copiedFrom,
        }: {
            uniqueSlug?: boolean;
            /** The Document being duplicated: its SQL charts count as unchanged. */
            copiedFrom?: DocumentContent;
        } = {},
    ): Promise<Document> {
        const project = await this.assertProjectAccess(account, projectUuid);
        const context =
            await this.dependencies.spacePermissionService.resolveAccess(
                account.user.userUuid,
                input.spaceUuid === undefined
                    ? {
                          type: 'personalDocument',
                          organizationUuid: project.organizationUuid,
                          projectUuid,
                          createdByUserUuid: account.user.userUuid,
                          spaceUuid: null,
                      }
                    : { type: 'space', spaceUuid: input.spaceUuid },
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
                input.spaceUuid === undefined
                    ? 'You do not have permission to create Documents'
                    : 'You do not have permission to create Documents in this Space',
            );
        }
        DocumentService.validateMetadata(input);
        await this.assertOwnerIsMember(
            project.organizationUuid,
            input.ownerUserUuid,
        );
        if (input.schemaVersion !== DOCUMENT_SCHEMA_VERSION) {
            throw new ParameterError(
                `Document writes require schema version ${DOCUMENT_SCHEMA_VERSION}`,
            );
        }
        const content = await this.resolveSavedChartLinks(
            account,
            projectUuid,
            await this.resolveSqlConnections(
                projectUuid,
                await this.resolveCustomCharts(
                    projectUuid,
                    parseDocumentContent(input.schemaVersion, input.content),
                ),
            ),
            copiedFrom,
        );
        await this.validateCharts(account, projectUuid, content, undefined, {
            copiedSqlCharts:
                copiedFrom &&
                mapDocumentCharts(copiedFrom, DocumentService.toStoredChart),
        });
        const agentIdentity = getContentWriteAgentIdentity({
            userUuid: account.user.userUuid,
            organizationUuid: account.organization.organizationUuid,
        });
        const created = await this.dependencies.documentModel.create(
            {
                ...input,
                uniqueSlug,
                spaceUuid: input.spaceUuid ?? null,
                content,
                projectUuid,
                createdByUserUuid: account.user.userUuid,
            },
            agentIdentity,
        );
        await logAgentContentWrite({
            model: this.dependencies.agentActionLogModel,
            projectUuid,
            agentIdentity,
            objectType: 'document',
            objectUuid: created.documentUuid,
            versionUuid: created.version.versionUuid,
            action: 'create',
        });
        this.dependencies.analytics.track({
            event: 'document.created',
            userId: account.user.userUuid,
            properties: {
                organizationId: created.organizationUuid,
                projectId: created.projectUuid,
                documentId: created.documentUuid,
                source: change.source,
                schemaVersion: created.version.schemaVersion,
                ...DocumentService.getChartCounts(created.version.content),
                ...DocumentService.getAiProperties(change),
            },
        });
        return this.authorizeDocument(account, created);
    }

    async duplicate(
        account: RegisteredAccount,
        projectUuid: UUID,
        documentUuidOrSlug: UuidOrSlug,
        input: DuplicateDocumentRequest,
    ): Promise<Document> {
        const source = await this.getByIdOrSlug(
            account,
            projectUuid,
            documentUuidOrSlug,
        );
        return this.create(
            account,
            projectUuid,
            {
                name: input.name,
                description: input.description ?? source.description,
                spaceUuid: input.spaceUuid,
                schemaVersion: source.version.schemaVersion,
                content: source.version.content,
            },
            { source: 'duplicate' },
            { copiedFrom: source.version.content },
        );
    }

    async updateMetadata(
        account: RegisteredAccount,
        projectUuid: string,
        documentUuid: string,
        input: UpdateDocumentMetadataRequest,
        {
            allowedSpaceUuids,
            change = API_CHANGE,
        }: {
            allowedSpaceUuids?: string[];
            change?: DocumentChangeContext;
        } = {},
    ): Promise<Document> {
        const document = await this.get(account, projectUuid, documentUuid);
        DocumentService.assertSpaceScope(document, allowedSpaceUuids);
        await this.assertCanUpdate(account, document);
        await this.assertCanMutateVerifiedDocument(account, document);
        DocumentService.validateMetadata(input);
        if (Object.values(input).every((value) => value === undefined)) {
            throw new ParameterError(
                'At least one Document metadata field is required',
            );
        }
        await this.assertOwnerIsMember(
            document.organizationUuid,
            input.ownerUserUuid,
        );
        const updated = {
            ...(await this.dependencies.documentModel.updateMetadata(
                projectUuid,
                documentUuid,
                { ...input, expectedSpaceUuid: document.spaceUuid },
            )),
            verification: await this.keepVerificationAfterUpdate(
                account,
                document,
            ),
        };
        if (
            input.ownerUserUuid !== undefined &&
            input.ownerUserUuid !== document.ownerUserUuid
        ) {
            this.dependencies.analytics.track({
                event: 'document.owner_assigned',
                userId: account.user.userUuid,
                properties: {
                    organizationId: updated.organizationUuid,
                    projectId: updated.projectUuid,
                    documentId: updated.documentUuid,
                    ownerUserUuid: input.ownerUserUuid,
                    previousOwnerUserUuid: document.ownerUserUuid,
                },
            });
        }
        this.dependencies.analytics.track({
            event: 'document.updated',
            userId: account.user.userUuid,
            properties: {
                organizationId: updated.organizationUuid,
                projectId: updated.projectUuid,
                documentId: updated.documentUuid,
                source: change.source,
                change: 'metadata',
                ...DocumentService.getAiProperties(change),
            },
        });
        return this.authorizeDocument(account, updated);
    }

    async updateContent(
        account: RegisteredAccount,
        projectUuid: string,
        documentUuid: string,
        input: DocumentContentUpdate,
        {
            allowedSpaceUuids,
            change = API_CHANGE,
        }: {
            allowedSpaceUuids?: string[];
            change?: DocumentChangeContext;
        } = {},
    ): Promise<Document> {
        const document = await this.get(account, projectUuid, documentUuid);
        DocumentService.assertSpaceScope(document, allowedSpaceUuids);
        await this.assertCanUpdate(account, document);
        await this.assertCanMutateVerifiedDocument(account, document);
        if (document.version.versionUuid !== input.baseVersionUuid) {
            throw new ConflictError(
                'Document has changed. Reload it and retry with the latest version UUID',
            );
        }
        // Reads add portable slugs; compare against the stored form.
        const previous = mapDocumentCharts(
            document.version.content,
            DocumentService.toStoredChart,
        );
        const content = await this.resolveSavedChartLinks(
            account,
            projectUuid,
            await this.resolveSqlConnections(
                projectUuid,
                await this.resolveCustomCharts(
                    projectUuid,
                    parseDocumentContent(
                        DOCUMENT_SCHEMA_VERSION,
                        input.content,
                        { previous },
                    ),
                    previous,
                ),
            ),
            previous,
        );
        await this.validateCharts(account, projectUuid, content, previous);
        const agentIdentity = getContentWriteAgentIdentity({
            userUuid: account.user.userUuid,
            organizationUuid: account.organization.organizationUuid,
        });
        const saved = await this.dependencies.documentModel.updateContent(
            projectUuid,
            documentUuid,
            { ...input, content, expectedSpaceUuid: document.spaceUuid },
            account.user.userUuid,
            agentIdentity,
        );
        await logAgentContentWrite({
            model: this.dependencies.agentActionLogModel,
            projectUuid,
            agentIdentity,
            objectType: 'document',
            objectUuid: saved.documentUuid,
            versionUuid: saved.version.versionUuid,
            action: 'update',
        });
        const updated = {
            ...saved,
            verification: await this.keepVerificationAfterUpdate(
                account,
                document,
            ),
        };
        this.dependencies.analytics.track({
            event: 'document.updated',
            userId: account.user.userUuid,
            properties: {
                organizationId: updated.organizationUuid,
                projectId: updated.projectUuid,
                documentId: updated.documentUuid,
                source: change.source,
                change: 'content',
                versionNumber: updated.version.versionNumber,
                ...DocumentService.getChartCounts(updated.version.content),
                ...DocumentService.getAiProperties(change),
            },
        });
        return this.authorizeDocument(account, updated);
    }

    private static getChartCounts(
        content: DocumentContent,
    ): DocumentChartCounts {
        const charts = Object.values(content.charts);
        return {
            chartCount: charts.length,
            customChartCount: charts.filter(
                (chartContent) =>
                    chartContent.source !== 'sql' &&
                    chartContent.chart.chartConfig.type ===
                        ChartType.DATA_APP_VIZ,
            ).length,
            mergeChartCount: charts.filter(({ source }) => source === 'merge')
                .length,
            sqlChartCount: charts.filter(({ source }) => source === 'sql')
                .length,
            savedChartLinkCount: getDocumentSavedChartLinks(content).length,
            markdownLength: content.markdown.length,
        };
    }

    private static getAiProperties({
        aiPromptUuid,
        aiThreadUuid,
    }: DocumentChangeContext) {
        return {
            ...(aiPromptUuid ? { aiPromptId: aiPromptUuid } : {}),
            ...(aiThreadUuid ? { aiThreadId: aiThreadUuid } : {}),
        };
    }

    private static assertSpaceScope(
        document: Document,
        allowedSpaceUuids: string[] | undefined,
    ): void {
        if (
            allowedSpaceUuids &&
            allowedSpaceUuids.length > 0 &&
            (document.spaceUuid === null ||
                !allowedSpaceUuids.includes(document.spaceUuid))
        ) {
            throw new NotFoundError('Document not found');
        }
    }

    /** Owners must belong to the organization; ownership grants no access. */
    private async assertOwnerIsMember(
        organizationUuid: string,
        ownerUserUuid: string | null | undefined,
    ): Promise<void> {
        if (ownerUserUuid) {
            // Throws NotFoundError when the user is not an org member
            await this.dependencies.organizationMemberProfileModel.getOrganizationMemberByUuid(
                organizationUuid,
                ownerUserUuid,
            );
        }
    }

    private verificationGuardDeps(account: RegisteredAccount) {
        return {
            contentVerificationModel:
                this.dependencies.contentVerificationModel,
            ability: this.createAuditedAbility(account),
            user: account.user,
        };
    }

    private async assertCanMutateVerifiedDocument(
        account: RegisteredAccount,
        document: Pick<
            Document,
            'documentUuid' | 'projectUuid' | 'organizationUuid'
        >,
    ): Promise<void> {
        await assertCanMutateVerifiedContent(
            this.verificationGuardDeps(account),
            {
                contentType: ContentType.DOCUMENT,
                contentUuid: document.documentUuid,
                projectUuid: document.projectUuid,
                organizationUuid: document.organizationUuid,
            },
        );
    }

    /** Verification survives an edit by its verifier or a verification manager. */
    private async keepVerificationAfterUpdate(
        account: RegisteredAccount,
        document: Document,
    ): Promise<ContentVerificationInfo | null> {
        const verification = await getVerificationAfterUpdate(
            this.verificationGuardDeps(account),
            {
                contentType: ContentType.DOCUMENT,
                contentUuid: document.documentUuid,
                projectUuid: document.projectUuid,
                organizationUuid: document.organizationUuid,
            },
        );
        if (verification === null && document.verification !== null) {
            await this.dependencies.contentVerificationModel.unverify(
                ContentType.DOCUMENT,
                document.documentUuid,
            );
        }
        return verification;
    }

    private assertCanManageVerification(
        account: RegisteredAccount,
        document: Document,
        message: string,
    ): void {
        if (
            this.createAuditedAbility(account).cannot(
                'manage',
                subject('ContentVerification', {
                    organizationUuid: document.organizationUuid,
                    projectUuid: document.projectUuid,
                    metadata: { projectUuid: document.projectUuid },
                }),
            )
        ) {
            throw new ForbiddenError(message);
        }
    }

    async verify(
        account: RegisteredAccount,
        projectUuid: string,
        documentUuid: string,
    ): Promise<ContentVerificationInfo> {
        const document = await this.get(account, projectUuid, documentUuid);
        this.assertCanManageVerification(
            account,
            document,
            'Only admins can verify Documents',
        );
        if (document.spaceUuid === null) {
            throw new ParameterError(
                'Save this Document to a Space before verifying it',
            );
        }
        await this.dependencies.contentVerificationModel.verify(
            ContentType.DOCUMENT,
            document.documentUuid,
            projectUuid,
            account.user.userUuid,
        );
        const verification =
            await this.dependencies.contentVerificationModel.getByContent(
                ContentType.DOCUMENT,
                document.documentUuid,
            );
        if (!verification) {
            throw new Error('Failed to verify Document');
        }
        this.dependencies.analytics.track({
            event: 'content_verification.created',
            userId: account.user.userUuid,
            properties: {
                organizationId: document.organizationUuid,
                projectId: projectUuid,
                contentType: ContentType.DOCUMENT,
                contentId: document.documentUuid,
            },
        });
        return verification;
    }

    async unverify(
        account: RegisteredAccount,
        projectUuid: string,
        documentUuid: string,
    ): Promise<void> {
        const document = await this.get(account, projectUuid, documentUuid);
        this.assertCanManageVerification(
            account,
            document,
            'Only admins can remove Document verification',
        );
        await this.dependencies.contentVerificationModel.unverify(
            ContentType.DOCUMENT,
            document.documentUuid,
        );
        this.dependencies.analytics.track({
            event: 'content_verification.deleted',
            userId: account.user.userUuid,
            properties: {
                organizationId: document.organizationUuid,
                projectId: projectUuid,
                contentType: ContentType.DOCUMENT,
                contentId: document.documentUuid,
            },
        });
    }

    private async assertCanUpdate(
        account: RegisteredAccount,
        document: Document,
    ): Promise<void> {
        const context =
            await this.dependencies.spacePermissionService.resolveAccess(
                account.user.userUuid,
                getAccessTarget(document),
            );
        if (
            this.createAuditedAbility(account).cannot(
                'update',
                subject('Document', context),
            )
        ) {
            throw new ForbiddenError(
                'You do not have permission to edit this Document',
            );
        }
    }

    async moveToSpace(
        account: RegisteredAccount,
        {
            projectUuid,
            itemUuid: documentUuid,
            targetSpaceUuid,
        }: {
            projectUuid: string;
            itemUuid: string;
            targetSpaceUuid: string | null;
        },
        {
            tx,
            trackEvent = true,
            change = API_CHANGE,
        }: {
            tx?: Knex;
            checkForAccess?: boolean;
            trackEvent?: boolean;
            change?: DocumentChangeContext;
        } = {},
    ): Promise<void> {
        if (!targetSpaceUuid) {
            throw new ParameterError('Documents must belong to a Space');
        }
        const document = await this.get(account, projectUuid, documentUuid);
        await this.assertCanMutateVerifiedDocument(account, document);
        // Moving content out of a Space needs Space access, not a direct grant
        const source: AccessTarget =
            document.spaceUuid === null
                ? getAccessTarget(document)
                : { type: 'space', spaceUuid: document.spaceUuid };
        const contexts =
            await this.dependencies.spacePermissionService.resolveAccessBatch(
                account.user.userUuid,
                [source, { type: 'space', spaceUuid: targetSpaceUuid }],
                tx ? { trx: tx } : {},
            );
        const ability = this.createAuditedAbility(account);
        for (const [index, { context }] of contexts.entries()) {
            if (
                !context ||
                context.projectUuid !== projectUuid ||
                context.organizationUuid !== document.organizationUuid
            ) {
                throw new NotFoundError('Space not found');
            }
            if (
                ability.cannot(
                    index === 0 ? 'update' : 'create',
                    subject('Document', context),
                )
            ) {
                throw new ForbiddenError(
                    'You must have edit access to the source Space and create access to the destination Space to move a Document',
                );
            }
        }
        await this.dependencies.documentModel.moveToSpace(
            {
                projectUuid,
                documentUuid,
                sourceSpaceUuid: document.spaceUuid,
                targetSpaceUuid,
            },
            { tx },
        );
        if (trackEvent) {
            this.trackMoved(account, document, targetSpaceUuid, change);
        }
    }

    /**
     * Moves a Document whose move a reviewer approved. The reviewer needs
     * create access in the destination; the requester's source Space is not
     * theirs to edit, so it is not checked.
     */
    async moveApprovedToSpace(
        account: RegisteredAccount,
        {
            projectUuid,
            documentUuid,
            targetSpaceUuid,
        }: {
            projectUuid: string;
            documentUuid: string;
            targetSpaceUuid: string;
        },
        { tx }: { tx?: Knex } = {},
    ): Promise<void> {
        const document = await this.get(account, projectUuid, documentUuid);
        await this.assertCanMutateVerifiedDocument(account, document);
        const [{ context }] =
            await this.dependencies.spacePermissionService.resolveAccessBatch(
                account.user.userUuid,
                [{ type: 'space' as const, spaceUuid: targetSpaceUuid }],
                tx ? { trx: tx } : {},
            );
        if (
            !context ||
            context.projectUuid !== projectUuid ||
            context.organizationUuid !== document.organizationUuid
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
                'You must have create access to the destination Space to approve moving this Document',
            );
        }
        await this.dependencies.documentModel.moveToSpace(
            {
                projectUuid,
                documentUuid,
                sourceSpaceUuid: document.spaceUuid,
                targetSpaceUuid,
            },
            { tx },
        );
        this.trackMoved(account, document, targetSpaceUuid, API_CHANGE);
    }

    private trackMoved(
        account: RegisteredAccount,
        document: Document,
        targetSpaceUuid: string,
        change: DocumentChangeContext,
    ): void {
        this.dependencies.analytics.track({
            event: 'document.moved',
            userId: account.user.userUuid,
            properties: {
                organizationId: document.organizationUuid,
                projectId: document.projectUuid,
                documentId: document.documentUuid,
                sourceSpaceId: document.spaceUuid,
                targetSpaceId: targetSpaceUuid,
                source: change.source,
                ...DocumentService.getAiProperties(change),
            },
        });
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

    /**
     * Pin every custom chart to a chart type in this project: the portable
     * dataAppVizSlug (or a same-project uuid) becomes the viz uuid plus a
     * renderable version, and the binding is checked against that version's
     * declared slots and options. Charts unchanged from the previous version
     * keep their stored binding, so narrative edits never fail because a
     * chart type changed since.
     */
    private async resolveCustomCharts(
        projectUuid: string,
        content: DocumentContent,
        previous?: DocumentContent,
    ): Promise<DocumentContent> {
        const previousCharts = Object.values(previous?.charts ?? {});
        const charts = await Promise.all(
            Object.entries(content.charts).map(
                async ([id, chartContent]): Promise<
                    [string, DocumentChartContent]
                > => {
                    if (
                        chartContent.source === 'sql' ||
                        chartContent.chart.chartConfig.type !==
                            ChartType.DATA_APP_VIZ
                    ) {
                        return [id, chartContent];
                    }
                    const stored =
                        DocumentService.withoutDataAppVizSlug(chartContent);
                    const unchanged = previousCharts.find((previousChart) =>
                        isEqual(previousChart, stored),
                    );
                    if (unchanged) {
                        return [id, unchanged];
                    }
                    const { chart } = chartContent;
                    const { chartConfig, vizSchema } =
                        await resolveDataAppVizBinding({
                            appModel: this.dependencies.appModel,
                            logger: this.logger,
                            projectUuid,
                            chartConfig: chart.chartConfig,
                            source: 'document',
                        });
                    if (
                        chartConfig.type !== ChartType.DATA_APP_VIZ ||
                        chartConfig.config === undefined ||
                        vizSchema === undefined
                    ) {
                        throw new ParameterError(
                            `Custom chart "${id}" must reference a chart type`,
                        );
                    }
                    const errors = getDataAppVizChartConfigErrors(
                        chartConfig.config,
                        vizSchema,
                        {
                            dimensions: chart.metricQuery.dimensions,
                            metrics: chart.metricQuery.metrics,
                            tableCalculations:
                                chart.metricQuery.tableCalculations.map(
                                    ({ name }) => name,
                                ),
                        },
                    );
                    if (errors.length > 0) {
                        throw new ParameterError(
                            `Invalid custom chart "${id}": ${errors.join(' ')}`,
                        );
                    }
                    return [
                        id,
                        {
                            ...chartContent,
                            chart: { ...chart, chartConfig },
                        } as DocumentChartContent,
                    ];
                },
            ),
        );
        return { ...content, charts: Object.fromEntries(charts) };
    }

    /**
     * Resolve each link to a saved chart to its uuid. Links new in this write
     * must point at a chart of this project, outside a dashboard, that the
     * author can view; links already in `previous` are kept as they are, even
     * when their chart has been deleted since.
     */
    private async resolveSavedChartLinks(
        account: RegisteredAccount,
        projectUuid: string,
        content: DocumentContent,
        previous?: DocumentContent,
    ): Promise<DocumentContent> {
        const links = getDocumentSavedChartLinks(content);
        if (links.length === 0) {
            return content;
        }
        const previousLinks = new Set(
            previous
                ? getDocumentSavedChartLinks(previous).map(
                      (link) => `${link.kind}:${link.attributes.uuid}`,
                  )
                : [],
        );
        const findCharts = (kind: DocumentSavedChartKind) => {
            const ofKind = links.filter((link) => link.kind === kind);
            return this.dependencies.documentModel.findSavedChartsForLinks(
                projectUuid,
                kind,
                {
                    uuids: ofKind.flatMap(({ attributes }) =>
                        attributes.uuid ? [attributes.uuid] : [],
                    ),
                    slugs: ofKind.flatMap(({ attributes }) =>
                        attributes.slug ? [attributes.slug] : [],
                    ),
                },
            );
        };
        const charts = (
            await Promise.all([findCharts('chart'), findCharts('sqlChart')])
        ).flat();
        const findChart = ({
            kind,
            attributes,
        }: (typeof links)[number]): SavedChartForLink | undefined =>
            charts.find(
                (chart) =>
                    chart.kind === kind &&
                    (attributes.uuid
                        ? chart.uuid === attributes.uuid
                        : chart.slugs.includes(attributes.slug)),
            );
        const wasLinked = (link: (typeof links)[number], uuid?: string) =>
            uuid !== undefined && previousLinks.has(`${link.kind}:${uuid}`);
        const newCharts = links.flatMap((link) => {
            const chart = findChart(link);
            // A chart deleted since it was linked keeps its tag, so the Document stays editable
            if (wasLinked(link, link.attributes.uuid ?? chart?.uuid)) {
                return [];
            }
            const tag = formatDocumentTag({
                name: getSavedChartTagName(link.kind),
                attributes: link.attributes,
            });
            if (!chart || chart.isDeleted) {
                throw new ParameterError(
                    `${tag} doesn't match a chart in this project`,
                );
            }
            if (chart.dashboardUuid !== null || chart.spaceUuid === null) {
                throw new ParameterError(
                    `${tag} is a chart saved in a dashboard, which can't be linked`,
                );
            }
            return [{ ...chart, spaceUuid: chart.spaceUuid, tag }];
        });
        await this.assertCanViewLinkedCharts(account, newCharts);
        return mapDocumentSavedChartLinks(content, (link) => {
            const { slug, uuid, ...attributes } = link.attributes;
            return { uuid: findChart(link)?.uuid ?? uuid, ...attributes };
        });
    }

    private async assertCanViewLinkedCharts(
        account: RegisteredAccount,
        charts: Array<SavedChartForLink & { spaceUuid: string; tag: string }>,
    ): Promise<void> {
        if (charts.length === 0) {
            return;
        }
        const results =
            await this.dependencies.spacePermissionService.resolveAccessBatch(
                account.user.userUuid,
                charts.map(
                    (chart): AccessTarget =>
                        chart.kind === 'chart'
                            ? {
                                  type: 'chart',
                                  chartUuid: chart.uuid,
                                  dashboardUuid: null,
                                  spaceUuid: chart.spaceUuid,
                              }
                            : {
                                  type: 'sqlChart',
                                  savedSqlUuid: chart.uuid,
                                  spaceUuid: chart.spaceUuid,
                              },
                ),
            );
        const ability = this.createAuditedAbility(account);
        const denied = charts.find(
            (chart, index) =>
                !results[index]?.context ||
                ability.cannot(
                    'view',
                    subject('SavedChart', {
                        ...results[index].context,
                        metadata:
                            chart.kind === 'chart'
                                ? { savedChartUuid: chart.uuid }
                                : { savedSqlUuid: chart.uuid },
                    }),
                ),
        );
        if (denied) {
            throw new ForbiddenError(
                `You don't have access to the chart in ${denied.tag}`,
            );
        }
    }

    /** As code, links name their chart by slug; a chart deleted since keeps its uuid. */
    private async withSavedChartSlugs(
        projectUuid: string,
        content: DocumentContent,
    ): Promise<DocumentContent> {
        const links = getDocumentSavedChartLinks(content);
        if (links.length === 0) {
            return content;
        }
        const uuidsOf = (kind: DocumentSavedChartKind) =>
            links.flatMap((link) =>
                link.kind === kind && link.attributes.uuid
                    ? [link.attributes.uuid]
                    : [],
            );
        const charts = (
            await Promise.all(
                (['chart', 'sqlChart'] as const).map((kind) =>
                    this.dependencies.documentModel.findSavedChartsForLinks(
                        projectUuid,
                        kind,
                        { uuids: uuidsOf(kind), slugs: [] },
                    ),
                ),
            )
        ).flat();
        return mapDocumentSavedChartLinks(content, (link) => {
            const chart = charts.find(
                (candidate) =>
                    candidate.kind === link.kind &&
                    candidate.uuid === link.attributes.uuid,
            );
            const slug = chart?.slugs[chart.slugs.length - 1];
            if (slug === undefined) {
                return link.attributes;
            }
            const { uuid, ...attributes } = link.attributes;
            return { slug, ...attributes };
        });
    }

    /**
     * SQL charts are stored with their connection's uuid. A connection name,
     * as in content as code, wins over a uuid.
     */
    private async resolveSqlConnections(
        projectUuid: string,
        content: DocumentContent,
    ): Promise<DocumentContent> {
        const hasConnection = Object.values(content.charts).some(
            (chartContent) =>
                chartContent.source === 'sql' &&
                (chartContent.chart.connection !== undefined ||
                    chartContent.chart.warehouseConnectionUuid !== undefined),
        );
        if (!hasConnection) {
            return content;
        }
        const connections = await listContentConnections(
            this.dependencies,
            projectUuid,
        );
        return mapDocumentCharts(content, (chartContent) => {
            if (chartContent.source !== 'sql') {
                return chartContent;
            }
            const { connection, warehouseConnectionUuid, ...chart } =
                chartContent.chart;
            const uuid =
                connection === undefined
                    ? (warehouseConnectionUuid ?? null)
                    : resolveContentConnection(connections, connection);
            if (uuid !== null && connection === undefined) {
                // Throws when the uuid is not a connection of this project
                getContentConnectionName(connections, uuid);
            }
            return {
                source: 'sql',
                chart:
                    uuid === null
                        ? chart
                        : { ...chart, warehouseConnectionUuid: uuid },
            };
        });
    }

    /** Add each SQL chart's connection name; as code, the uuid is dropped. */
    private async withSqlConnectionNames(
        projectUuid: string,
        content: DocumentContent,
        { portable = false }: { portable?: boolean } = {},
    ): Promise<DocumentContent> {
        const hasConnection = Object.values(content.charts).some(
            (chartContent) =>
                chartContent.source === 'sql' &&
                chartContent.chart.warehouseConnectionUuid !== undefined,
        );
        if (!hasConnection) {
            return content;
        }
        const connections = await listContentConnections(
            this.dependencies,
            projectUuid,
        );
        return mapDocumentCharts(content, (chartContent) => {
            if (
                chartContent.source !== 'sql' ||
                chartContent.chart.warehouseConnectionUuid === undefined
            ) {
                return chartContent;
            }
            const { warehouseConnectionUuid, ...chart } = chartContent.chart;
            const connection = connections.find(
                (candidate) =>
                    candidate.warehouseConnectionUuid ===
                    warehouseConnectionUuid,
            );
            // A deleted connection keeps its uuid so the content still round-trips
            if (!connection) {
                return chartContent;
            }
            return {
                source: 'sql',
                chart: portable
                    ? { ...chart, connection: connection.name }
                    : {
                          ...chart,
                          connection: connection.name,
                          warehouseConnectionUuid,
                      },
            };
        });
    }

    /** Content as stored: references by uuid, without the names reads add. */
    private static toStoredChart(
        content: DocumentChartContent,
    ): DocumentChartContent {
        if (
            content.source === 'sql' &&
            content.chart.warehouseConnectionUuid !== undefined
        ) {
            const { connection, ...chart } = content.chart;
            return { source: 'sql', chart };
        }
        return DocumentService.withoutDataAppVizSlug(content);
    }

    /** Content as read: references carry their portable names. */
    private async withReadableNames(
        projectUuid: string,
        content: DocumentContent,
        { portable = false }: { portable?: boolean } = {},
    ): Promise<DocumentContent> {
        return this.withSqlConnectionNames(
            projectUuid,
            await this.withDataAppVizSlugs(projectUuid, content, { portable }),
            { portable },
        );
    }

    /** The stored form of a chart: bindings are kept by uuid only. */
    private static withoutDataAppVizSlug(
        content: DocumentChartContent,
    ): DocumentChartContent {
        if (
            content.source === 'sql' ||
            content.chart.chartConfig.type !== ChartType.DATA_APP_VIZ ||
            content.chart.chartConfig.config?.dataAppVizUuid === undefined ||
            content.chart.chartConfig.config.dataAppVizSlug === undefined
        ) {
            return content;
        }
        const { dataAppVizSlug, ...config } = content.chart.chartConfig.config;
        return {
            ...content,
            chart: {
                ...content.chart,
                chartConfig: { ...content.chart.chartConfig, config },
            },
        } as DocumentChartContent;
    }

    /**
     * Add each custom chart's portable slug next to its stored uuid. As code,
     * the uuid is dropped so the content is portable across projects. A chart
     * type deleted since keeps its uuid so the content still round-trips.
     */
    private async withDataAppVizSlugs(
        projectUuid: string,
        content: DocumentContent,
        { portable = false }: { portable?: boolean } = {},
    ): Promise<DocumentContent> {
        const uuids = Object.values(content.charts).flatMap((chartContent) =>
            chartContent.source !== 'sql' &&
            chartContent.chart.chartConfig.type === ChartType.DATA_APP_VIZ &&
            chartContent.chart.chartConfig.config?.dataAppVizUuid
                ? [chartContent.chart.chartConfig.config.dataAppVizUuid]
                : [],
        );
        if (uuids.length === 0) {
            return content;
        }
        const rows = await this.dependencies.appModel.findAppsByUuids(
            projectUuid,
            [...new Set(uuids)],
            { dataAppVizsFilter: 'only' },
        );
        const slugByUuid = new Map(rows.map((row) => [row.app_id, row.slug]));
        return mapDocumentCharts(content, (chartContent) => {
            if (chartContent.source === 'sql') {
                return chartContent;
            }
            const { chart } = chartContent;
            if (
                chart.chartConfig.type !== ChartType.DATA_APP_VIZ ||
                chart.chartConfig.config?.dataAppVizUuid === undefined
            ) {
                return chartContent;
            }
            const { dataAppVizUuid, ...rest } = chart.chartConfig.config;
            const dataAppVizSlug = slugByUuid.get(dataAppVizUuid);
            if (dataAppVizSlug === undefined) {
                return chartContent;
            }
            const config = portable
                ? { ...rest, dataAppVizSlug }
                : { ...rest, dataAppVizUuid, dataAppVizSlug };
            return {
                ...chartContent,
                chart: {
                    ...chart,
                    chartConfig: { ...chart.chartConfig, config },
                },
            } as DocumentChartContent;
        });
    }

    private async validateCharts(
        account: RegisteredAccount,
        projectUuid: string,
        content: DocumentContent,
        previous?: DocumentContent,
        { copiedSqlCharts }: { copiedSqlCharts?: DocumentContent } = {},
    ): Promise<void> {
        parseDocumentContent(DOCUMENT_SCHEMA_VERSION, content, { previous });
        const copiedCharts = Object.values(copiedSqlCharts?.charts ?? {});
        const limit = pLimit(MAX_CONCURRENT_CHART_VALIDATIONS);
        const previousCharts = Object.values(previous?.charts ?? {});
        // Compile only changed charts: narrative edits must not require chart authoring capabilities.
        await Promise.all(
            Object.entries(content.charts).map(([chartId, chartContent]) =>
                limit(async () => {
                    if (
                        previousCharts.some((previousChart) =>
                            isEqual(previousChart, chartContent),
                        )
                    ) {
                        return;
                    }
                    if (chartContent.source === 'sql') {
                        if (
                            !copiedCharts.some((copied) =>
                                isEqual(copied, chartContent),
                            )
                        ) {
                            await this.assertCanAuthorSql(account, projectUuid);
                        }
                        return;
                    }
                    const { chart } = chartContent;
                    if (chart.tableName !== chart.metricQuery.exploreName) {
                        throw new ParameterError(
                            `Chart tableName must match its exploreName in chart "${chartId}"`,
                        );
                    }
                    const metricQuery = {
                        ...chart.metricQuery,
                        filters: normalizeFilterIds(chart.metricQuery.filters),
                    };
                    if (chartContent.source === 'merge') {
                        // Merge compilation returns join refusals but not tolerant leg compilation errors.
                        await Promise.all(
                            [
                                metricQuery,
                                ...chartContent.chart.merge.sources
                                    .filter((source) => source.kind === 'query')
                                    .map((source) => source.metricQuery),
                            ].map((query) =>
                                this.validateQuery({
                                    account,
                                    projectUuid,
                                    chartId,
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
                                        chartContent.chart.merge,
                                    ),
                                    parameters: chart.parameters,
                                    userAttributeOverrides: {},
                                },
                            );
                        if (compiled.errors.length > 0) {
                            throw new ParameterError(
                                `Invalid chart "${chartId}": ${compiled.errors.map((error) => error.message).join('; ')}`,
                            );
                        }
                        return;
                    }
                    await this.validateQuery({
                        account,
                        projectUuid,
                        chartId,
                        metricQuery,
                        parameters: chart.parameters,
                    });
                }),
            ),
        );
    }

    private async assertCanAuthorSql(
        account: RegisteredAccount,
        projectUuid: string,
    ): Promise<void> {
        const { organizationUuid } =
            await this.dependencies.projectModel.getSummary(projectUuid);
        if (
            this.createAuditedAbility(account).cannot(
                'manage',
                subject('SqlRunner', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError(
                'You need SQL Runner access to add or change SQL charts',
            );
        }
    }

    private async validateQuery({
        account,
        projectUuid,
        chartId,
        metricQuery,
        parameters,
    }: {
        account: RegisteredAccount;
        projectUuid: string;
        chartId: string;
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
                `Invalid chart "${chartId}": ${compiled.compilationErrors.join('; ')}`,
            );
        }
        if (compiled.missingParameterReferences.size > 0) {
            throw new ParameterError(
                `Missing parameters in chart "${chartId}": ${[...compiled.missingParameterReferences].join(', ')}`,
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
        const shared =
            await this.dependencies.directAccessService.findSharedWithMeUuids(
                {
                    userUuid: account.user.userUuid,
                    organizationUuid: project.organizationUuid,
                },
                [projectUuid],
            );
        const allowedDocumentUuids = await this.filterViewableUuids(
            account,
            [projectUuid],
            shared[DirectAccessResourceType.DOCUMENT],
        );
        const items = await this.dependencies.documentModel.list(projectUuid, {
            spaceUuids: allowedSpaceUuids,
            documentUuids: allowedDocumentUuids,
            limit: limit + 1,
            offset,
        });
        return {
            items: items.slice(0, limit),
            nextOffset: items.length > limit ? offset + limit : null,
        };
    }

    /** The Documents you can view whose current version links this saved chart. */
    async listDocumentsLinkingChart(
        account: RegisteredAccount,
        projectUuid: string,
        kind: DocumentSavedChartKind,
        chartUuid: string,
    ): Promise<DocumentLinkingChart[]> {
        await this.assertProjectAccess(account, projectUuid);
        const documents =
            await this.dependencies.documentModel.findDocumentsLinkingChart(
                projectUuid,
                kind,
                chartUuid,
            );
        const viewable = new Set(
            await this.filterViewableUuids(
                account,
                [projectUuid],
                documents.map(({ documentUuid }) => documentUuid),
            ),
        );
        return documents.filter(({ documentUuid }) =>
            viewable.has(documentUuid),
        );
    }

    async filterViewableUuids(
        account: RegisteredAccount,
        projectUuids: string[],
        documentUuids: string[],
    ): Promise<string[]> {
        if (documentUuids.length === 0) {
            return [];
        }
        const ability = this.createAuditedAbility(account);
        const limit = pLimit(MAX_CONCURRENT_PROJECT_ACCESS_CHECKS);
        const allowed = await Promise.all(
            [...new Set(projectUuids)].map((projectUuid) =>
                limit(async () => {
                    try {
                        await this.assertProjectAccess(account, projectUuid);
                    } catch (error) {
                        if (
                            error instanceof NotFoundError ||
                            error instanceof ForbiddenError
                        ) {
                            return [];
                        }
                        throw error;
                    }
                    const candidates =
                        await this.dependencies.documentModel.listSummariesByUuid(
                            projectUuid,
                            documentUuids,
                        );
                    const contexts =
                        await this.dependencies.spacePermissionService.resolveAccessBatch(
                            account.user.userUuid,
                            candidates.map(getAccessTarget),
                        );
                    return candidates
                        .filter((document, index) => {
                            const context = contexts[index]?.context;
                            return (
                                context &&
                                context.projectUuid === document.projectUuid &&
                                context.organizationUuid ===
                                    document.organizationUuid &&
                                ability.can(
                                    'view',
                                    subject('Document', context),
                                )
                            );
                        })
                        .map(({ documentUuid }) => documentUuid);
                }),
            ),
        );
        return allowed.flat();
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
        return this.authorizeDocument(account, document);
    }

    async getByIdOrSlug(
        account: RegisteredAccount,
        projectUuid: UUID,
        documentUuidOrSlug: UuidOrSlug,
    ): Promise<Document> {
        return isUuid(documentUuidOrSlug)
            ? this.get(account, projectUuid, documentUuidOrSlug)
            : this.getBySlug(account, projectUuid, documentUuidOrSlug);
    }

    /**
     * A person opening the Document: counts the view and tracks it. Other
     * reads (AI agents, MCP, permission checks, queries) use getByIdOrSlug.
     */
    async view(
        account: RegisteredAccount,
        projectUuid: UUID,
        documentUuidOrSlug: UuidOrSlug,
    ): Promise<Document> {
        const document = await this.getByIdOrSlug(
            account,
            projectUuid,
            documentUuidOrSlug,
        );
        void this.dependencies.analyticsModel
            .addDocumentViewEvent(document.documentUuid)
            .catch((error) => {
                this.logger.warn('Document view count failed', {
                    documentUuid: document.documentUuid,
                    error:
                        error instanceof Error ? error.message : String(error),
                });
            });
        this.dependencies.analytics.track({
            event: 'document.view',
            userId: account.user.userUuid,
            properties: {
                organizationId: document.organizationUuid,
                projectId: document.projectUuid,
                documentId: document.documentUuid,
            },
        });
        return document;
    }

    /** Queues a PDF of the Document's current version, rendered as this user. */
    async scheduleExportPdf(
        account: RegisteredAccount,
        projectUuid: UUID,
        documentUuidOrSlug: UuidOrSlug,
    ): Promise<{ jobId: string }> {
        const document = await this.getByIdOrSlug(
            account,
            projectUuid,
            documentUuidOrSlug,
        );
        return this.dependencies.schedulerClient.scheduleTask(
            SCHEDULER_TASKS.EXPORT_DOCUMENT_PDF,
            {
                organizationUuid: document.organizationUuid,
                projectUuid: document.projectUuid,
                userUuid: account.user.userUuid,
                documentUuid: document.documentUuid,
                versionUuid: document.version.versionUuid,
                documentName: document.name,
            },
        );
    }

    /** Version history, newest first; readable by anyone who can view the Document. */
    async listVersions(
        account: RegisteredAccount,
        projectUuid: UUID,
        documentUuidOrSlug: UuidOrSlug,
        { limit = 50, offset = 0 }: { limit?: number; offset?: number } = {},
    ): Promise<DocumentVersionList> {
        if (
            !Number.isInteger(limit) ||
            limit < 1 ||
            limit > 100 ||
            !Number.isSafeInteger(offset) ||
            offset < 0
        ) {
            throw new ParameterError(
                'Document version pagination requires limit 1–100 and a non-negative integer offset',
            );
        }
        const document = await this.getByIdOrSlug(
            account,
            projectUuid,
            documentUuidOrSlug,
        );
        return this.dependencies.documentModel.listVersions(
            projectUuid,
            document.documentUuid,
            { limit, offset },
        );
    }

    /**
     * The Document as it currently is, with a historical version's content in
     * place of the latest. Read-only: nothing about the Document changes.
     */
    async getVersion(
        account: RegisteredAccount,
        projectUuid: UUID,
        documentUuidOrSlug: UuidOrSlug,
        versionUuid: string,
    ): Promise<Document> {
        const document = await this.getByIdOrSlug(
            account,
            projectUuid,
            documentUuidOrSlug,
        );
        const historical = await this.dependencies.documentModel.getVersion(
            projectUuid,
            document.documentUuid,
            versionUuid,
        );
        return {
            ...document,
            version: {
                ...historical.version,
                content: await this.withReadableNames(
                    projectUuid,
                    historical.version.content,
                ),
            },
        };
    }

    /**
     * A chart of a saved Document version. Any version can be read by anyone
     * who can view the Document: the version pins the exact chart.
     */
    async getChart(
        account: RegisteredAccount,
        projectUuid: UUID,
        reference: DocumentQueryReference,
    ): Promise<DocumentChartContent> {
        const document = await this.getVersion(
            account,
            projectUuid,
            reference.documentUuid,
            reference.versionUuid,
        );
        const chart = Object.hasOwn(
            document.version.content.charts,
            reference.chartId,
        )
            ? document.version.content.charts[reference.chartId]
            : undefined;
        if (!chart) {
            throw new NotFoundError('Document chart not found');
        }
        return chart;
    }

    async getAsCode(
        account: RegisteredAccount,
        projectUuid: UUID,
        documentUuidOrSlug: UuidOrSlug,
    ): Promise<DocumentAsCode> {
        return this.toAsCode(
            await this.getByIdOrSlug(account, projectUuid, documentUuidOrSlug),
        );
    }

    /**
     * Viewable Documents as code, a page at a time; requested slugs are
     * returned in one page, with the ones not found or not viewable listed.
     */
    async listAsCode(
        account: RegisteredAccount,
        projectUuid: UUID,
        {
            slugs,
            offset = 0,
            schemaVersion = DOCUMENT_SCHEMA_VERSION,
        }: {
            slugs?: string[];
            offset?: number;
            /** The newest Document schema version the client reads. */
            schemaVersion?: number;
        } = {},
    ): Promise<DocumentAsCodeList> {
        if (schemaVersion < DOCUMENT_SCHEMA_VERSION) {
            throw new ParameterError(
                `Documents use schema version ${DOCUMENT_SCHEMA_VERSION}, which this client doesn't support. Upgrade the CLI to download them.`,
            );
        }
        await this.assertContentAsCodeAccess(account, projectUuid, 'view');
        const limit = pLimit(MAX_CONCURRENT_AS_CODE_READS);
        if (slugs !== undefined && slugs.length > 0) {
            const found = await Promise.all(
                [...new Set(slugs)].map((slug) =>
                    limit(async () => {
                        try {
                            return await this.getAsCode(
                                account,
                                projectUuid,
                                slug,
                            );
                        } catch (error) {
                            if (error instanceof NotFoundError) {
                                return slug;
                            }
                            throw error;
                        }
                    }),
                ),
            );
            return {
                documents: found.filter(
                    (item): item is DocumentAsCode => typeof item !== 'string',
                ),
                missingSlugs: found.filter(
                    (item): item is string => typeof item === 'string',
                ),
                nextOffset: null,
            };
        }
        const page = await this.list(account, projectUuid, {
            limit: DOCUMENT_AS_CODE_PAGE_SIZE,
            offset,
        });
        return {
            documents: await Promise.all(
                page.items.map(({ documentUuid }) =>
                    limit(async () =>
                        this.toAsCode(
                            await this.dependencies.documentModel.get(
                                projectUuid,
                                documentUuid,
                            ),
                        ),
                    ),
                ),
            ),
            missingSlugs: [],
            nextOffset: page.nextOffset,
        };
    }

    /**
     * Create or update a Document from code, matched by slug. Unchanged
     * Documents are left alone; a changed one gets a new version based on the
     * version just read, so a concurrent edit fails with a conflict instead
     * of being overwritten.
     */
    async upsertAsCode(
        account: RegisteredAccount,
        projectUuid: UUID,
        slug: string,
        input: unknown,
    ): Promise<ContentAsCodeUpsertAction> {
        await this.assertContentAsCodeAccess(account, projectUuid, 'create');
        const existing = await this.findBySlug(account, projectUuid, slug);
        const desired = parseDocumentAsCode(input, {
            previous: existing?.version.content,
        });
        if (desired.slug !== slug) {
            throw new ParameterError('Document path and body slugs must match');
        }
        DocumentService.validateMetadata(desired);
        const space = await this.findSpaceByAsCodeSlug(
            projectUuid,
            desired.spaceSlug,
        );
        if (existing === undefined) {
            await this.create(account, projectUuid, {
                name: desired.name,
                slug,
                description: desired.description,
                spaceUuid: space.uuid,
                schemaVersion: desired.schemaVersion,
                content: { markdown: desired.markdown, charts: desired.charts },
            });
            return PromotionAction.CREATE;
        }

        const current = await this.toAsCode(existing);
        // Charts re-sent under a temporary key match their stored id
        const matched = matchDocumentChartKeys(desired, current);
        if (isEqual(current, { ...desired, ...matched })) {
            return PromotionAction.NO_CHANGES;
        }
        await this.assertCanUpdate(account, existing);
        const isMove = space.uuid !== existing.spaceUuid;
        // Checked before any write so a denied move can't leave a partial update.
        if (isMove) {
            await this.assertCanMoveInto(account, existing, space.uuid);
        }
        if (
            current.markdown !== matched.markdown ||
            !isEqual(current.charts, matched.charts) ||
            !isEqual(current.unsupportedCharts, matched.unsupportedCharts)
        ) {
            await this.updateContent(
                account,
                projectUuid,
                existing.documentUuid,
                {
                    baseVersionUuid: existing.version.versionUuid,
                    content: {
                        markdown: desired.markdown,
                        charts: desired.charts,
                        unsupportedCharts: desired.unsupportedCharts,
                    },
                },
            );
        }
        if (
            current.name !== desired.name ||
            current.description !== desired.description
        ) {
            await this.updateMetadata(
                account,
                projectUuid,
                existing.documentUuid,
                {
                    name: desired.name,
                    description: desired.description,
                },
            );
        }
        if (isMove) {
            await this.moveToSpace(account, {
                projectUuid,
                itemUuid: existing.documentUuid,
                targetSpaceUuid: space.uuid,
            });
        }
        return PromotionAction.UPDATE;
    }

    private async assertContentAsCodeAccess(
        account: RegisteredAccount,
        projectUuid: UUID,
        action: 'view' | 'create',
    ): Promise<void> {
        const project = await this.assertProjectAccess(account, projectUuid);
        if (
            this.createAuditedAbility(account).cannot(
                action,
                subject('ContentAsCode', {
                    projectUuid: project.projectUuid,
                    organizationUuid: project.organizationUuid,
                    upstreamProjectUuid: project.upstreamProjectUuid,
                    type: project.type,
                    createdByUserUuid: project.createdByUserUuid,
                }),
            )
        ) {
            throw new ForbiddenError(
                action === 'view'
                    ? 'You are not allowed to download Documents as code'
                    : 'You are not allowed to upload Documents as code',
            );
        }
    }

    private async assertCanMoveInto(
        account: RegisteredAccount,
        document: Document,
        targetSpaceUuid: UUID,
    ): Promise<void> {
        const context =
            await this.dependencies.spacePermissionService.resolveAccess(
                account.user.userUuid,
                { type: 'space', spaceUuid: targetSpaceUuid },
            );
        if (
            context.projectUuid !== document.projectUuid ||
            this.createAuditedAbility(account).cannot(
                'create',
                subject('Document', context),
            )
        ) {
            throw new ForbiddenError(
                'You do not have permission to move this Document into that Space',
            );
        }
    }

    private async findSpaceByAsCodeSlug(projectUuid: UUID, spaceSlug: string) {
        const spaces = await this.dependencies.spaceModel.find({
            projectUuid,
            path: getLtreePathFromContentAsCodePath(spaceSlug),
        });
        if (spaces.length > 1) {
            throw new ParameterError(
                `Space "${spaceSlug}" matches more than one space`,
            );
        }
        const [space] = spaces;
        if (space === undefined) {
            throw new NotFoundError(
                `Space "${spaceSlug}" not found. Upload the space before its Documents`,
            );
        }
        return space;
    }

    private async findBySlug(
        account: RegisteredAccount,
        projectUuid: UUID,
        slug: string,
    ): Promise<Document | undefined> {
        try {
            return await this.getBySlug(account, projectUuid, slug);
        } catch (error) {
            if (error instanceof NotFoundError) {
                return undefined;
            }
            throw error;
        }
    }

    private async toAsCode(document: Document): Promise<DocumentAsCode> {
        if (document.spaceUuid === null) {
            throw new ParameterError(
                'Move this personal Document to a Space before using it as code',
            );
        }
        const [space] = await this.dependencies.spaceModel.find({
            projectUuid: document.projectUuid,
            spaceUuids: [document.spaceUuid],
        });
        if (!space) {
            throw new NotFoundError('Document not found');
        }
        return {
            name: document.name,
            slug: document.slug,
            description: document.description,
            spaceSlug: getContentAsCodePathFromLtreePath(space.path),
            schemaVersion: document.version.schemaVersion,
            ...(await this.withSavedChartSlugs(
                document.projectUuid,
                await this.withReadableNames(
                    document.projectUuid,
                    document.version.content,
                    { portable: true },
                ),
            )),
        };
    }

    async getBySlug(
        account: RegisteredAccount,
        projectUuid: string,
        slug: string,
    ): Promise<Document> {
        await this.assertProjectAccess(account, projectUuid);
        const document = await this.dependencies.documentModel.getBySlug(
            projectUuid,
            slug,
        );
        return this.authorizeDocument(account, document);
    }

    private async authorizeDocument(
        account: RegisteredAccount,
        document: Document,
    ): Promise<Document> {
        const context =
            await this.dependencies.spacePermissionService.resolveAccess(
                account.user.userUuid,
                getAccessTarget(document),
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
        return {
            ...document,
            version: {
                ...document.version,
                content: await this.withReadableNames(
                    document.projectUuid,
                    document.version.content,
                ),
            },
            access: context.access.filter(
                ({ userUuid }) => userUuid === account.user.userUuid,
            ),
            directAccessRoles: context.access
                .filter(
                    ({ userUuid, grantedVia }) =>
                        userUuid === account.user.userUuid &&
                        grantedVia === 'document',
                )
                .map(({ role }) => role),
        };
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
