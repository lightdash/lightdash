import {
    assignDocumentChartIds,
    ConflictError,
    ContentReviewContentType,
    ContentType,
    Document,
    DOCUMENT_SCHEMA_VERSION,
    DocumentContent,
    DocumentSummary,
    DocumentVersionList,
    DocumentVersionSummary,
    getDocumentChartTag,
    getDocumentSavedChartLinks,
    getUserAvatarUrl,
    isUserAvatarColorValue,
    matchDocumentChartKeys,
    normalizeAgentIdentityClaim,
    NotFoundError,
    ParameterError,
    parseDocumentContent,
    parseStoredDocumentContent,
    UpdateDocumentContentRequest,
    type AgentIdentityClaim,
    type DocumentLinkingChart,
    type DocumentSavedChartKind,
    type StoredAgentIdentityClaim,
} from '@lightdash/common';
import { Knex } from 'knex';
import { ContentVerificationTableName } from '../database/entities/contentVerification';
import {
    DbDocument,
    DbDocumentVersion,
    DocumentsTableName,
    DocumentVersionSavedChartsTableName,
    DocumentVersionsTableName,
} from '../database/entities/documents';
import { EmailTableName } from '../database/entities/emails';
import { OrganizationTableName } from '../database/entities/organizations';
import { ProjectTableName } from '../database/entities/projects';
import { SpaceTableName } from '../database/entities/spaces';
import { UserAvatarsTableName } from '../database/entities/userAvatars';
import { UserTableName } from '../database/entities/users';
import {
    acquireProjectSlugLock,
    generateUniqueSlugScopedToProject,
} from '../utils/SlugUtils';
import { cancelPendingContentReviewRequests } from './ContentReviewRequestModel';
import { type OnContentVersionCreated } from './OnContentVersionCreated';

/** A saved chart a Document link resolves to; `slugs` lists its current slug last. */
export type SavedChartForLink = {
    kind: DocumentSavedChartKind;
    uuid: string;
    slugs: string[];
    spaceUuid: string | null;
    dashboardUuid: string | null;
    isDeleted: boolean;
};

export type CreateDocument = {
    projectUuid: string;
    /** Null creates a personal Document. */
    spaceUuid: string | null;
    name: string;
    slug?: string;
    /** Treats slug as a base for a new unique slug instead of requiring it exactly. */
    uniqueSlug?: boolean;
    description: string;
    content: DocumentContent;
    createdByUserUuid: string | null;
    ownerUserUuid?: string | null;
};

export type DocumentContentUpdate = UpdateDocumentContentRequest;

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/** Versions saved before the markdown format keep their cells; read them as markdown. */
const cellsToContent = (content: unknown) => {
    const cells =
        isRecord(content) && Array.isArray(content.cells) ? content.cells : [];
    const charts: Record<string, unknown> = {};
    const blocks = cells.flatMap((cell: unknown) => {
        if (!isRecord(cell) || !isRecord(cell.content)) return [];
        if (cell.type === 'chart') {
            const id = `c${Object.keys(charts).length + 1}`;
            charts[id] = cell.content;
            return [getDocumentChartTag(id)];
        }
        const { markdown } = cell.content;
        return typeof markdown === 'string' && markdown.trim()
            ? [markdown.trim()]
            : [];
    });
    return { markdown: blocks.join('\n\n'), charts };
};

/** Unsupported charts are stored beside the others, so a newer release reads them again. */
const toChartData = ({
    charts,
    unsupportedCharts,
}: DocumentContent): Record<string, unknown> => ({
    ...unsupportedCharts,
    ...charts,
});

/**
 * Index a version's links to saved charts. A link to a chart deleted since
 * keeps its tag but gets no row.
 */
const insertSavedChartLinks = async (
    transaction: Knex,
    documentVersionUuid: string,
    content: DocumentContent,
): Promise<void> => {
    const links = getDocumentSavedChartLinks(content);
    const uuidsOf = (kind: DocumentSavedChartKind) => [
        ...new Set(
            links.flatMap((link) =>
                link.kind === kind && link.attributes.uuid
                    ? [link.attributes.uuid]
                    : [],
            ),
        ),
    ];
    const chartUuids = uuidsOf('chart');
    const sqlChartUuids = uuidsOf('sqlChart');
    if (chartUuids.length > 0) {
        await transaction.raw(
            `INSERT INTO ${DocumentVersionSavedChartsTableName} (document_version_uuid, saved_query_uuid)
             SELECT ?, saved_query_uuid FROM saved_queries WHERE saved_query_uuid = ANY(?::uuid[])`,
            [documentVersionUuid, chartUuids],
        );
    }
    if (sqlChartUuids.length > 0) {
        await transaction.raw(
            `INSERT INTO ${DocumentVersionSavedChartsTableName} (document_version_uuid, saved_sql_uuid)
             SELECT ?, saved_sql_uuid FROM saved_sql WHERE saved_sql_uuid = ANY(?::uuid[])`,
            [documentVersionUuid, sqlChartUuids],
        );
    }
};

const getStoredContent = (version: DbDocumentVersion): unknown => {
    if (![1, DOCUMENT_SCHEMA_VERSION].includes(version.schema_version)) {
        throw new ParameterError(
            `This Document was saved by a newer version (schema version ${version.schema_version}) and can't be opened here`,
        );
    }
    return version.markdown === null
        ? cellsToContent(version.content)
        : { markdown: version.markdown, charts: version.chart_data };
};

type DocumentRow = DbDocument & {
    organization_uuid: string;
    space_uuid: string | null;
};

export type DocumentLifecycleState = DocumentSummary & {
    deletedAt: Date | null;
    deletedByUserUuid: string | null;
    spaceDeletedAt: Date | null;
};

const toSummary = (row: DocumentRow): DocumentSummary => ({
    documentUuid: row.document_uuid,
    projectUuid: row.project_uuid,
    organizationUuid: row.organization_uuid,
    spaceUuid: row.space_uuid,
    name: row.name,
    slug: row.slug,
    description: row.description,
    createdByUserUuid: row.created_by_user_uuid,
    ownerUserUuid: row.document_owner_user_uuid,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
});

type UserDisplayRow = {
    user_uuid: string | null;
    first_name: string | null;
    last_name: string | null;
    avatar_gradient: string | null;
    avatar_content_hash: string | null;
};

const toUserDisplay = (row: UserDisplayRow): Document['createdBy'] =>
    row.user_uuid
        ? {
              userUuid: row.user_uuid,
              firstName: row.first_name ?? '',
              lastName: row.last_name ?? '',
              avatarUrl: row.avatar_content_hash
                  ? getUserAvatarUrl(row.user_uuid, row.avatar_content_hash)
                  : null,
              avatarGradient:
                  row.avatar_gradient &&
                  isUserAvatarColorValue(row.avatar_gradient)
                      ? row.avatar_gradient
                      : null,
          }
        : null;

export class DocumentModel {
    private readonly database: Knex;

    constructor({ database }: { database: Knex }) {
        this.database = database;
    }

    private documents(database: Knex, projectUuid: string) {
        return database(DocumentsTableName)
            .join(
                ProjectTableName,
                'projects.project_uuid',
                'documents.project_uuid',
            )
            .join(
                OrganizationTableName,
                'organizations.organization_id',
                'projects.organization_id',
            )
            .leftJoin(SpaceTableName, 'spaces.space_id', 'documents.space_id')
            .where('documents.project_uuid', projectUuid)
            .select(
                'documents.*',
                'organizations.organization_uuid',
                'spaces.space_uuid',
            );
    }

    private activeDocuments(database: Knex, projectUuid: string) {
        return this.documents(database, projectUuid)
            .whereNull('documents.deleted_at')
            .whereNull('spaces.deleted_at');
    }

    async getLifecycleState(
        projectUuid: string,
        documentUuid: string,
    ): Promise<DocumentLifecycleState> {
        const row = await this.documents(this.database, projectUuid)
            .select('spaces.deleted_at as space_deleted_at')
            .where('documents.document_uuid', documentUuid)
            .first();
        if (!row) {
            throw new NotFoundError('Document not found');
        }
        return {
            ...toSummary(row),
            deletedAt: row.deleted_at,
            deletedByUserUuid: row.deleted_by_user_uuid,
            spaceDeletedAt: row.space_deleted_at,
        };
    }

    async softDelete(
        projectUuid: string,
        documentUuid: string,
        userUuid: string,
        expectedSpaceUuid: string | null,
    ): Promise<void> {
        await this.database.transaction(async (trx) => {
            const document = await this.documents(trx, projectUuid)
                .select('spaces.deleted_at as space_deleted_at')
                .where('documents.document_uuid', documentUuid)
                .forUpdate('documents')
                .first();
            if (!document || document.space_deleted_at) {
                throw new NotFoundError('Document not found');
            }
            if (document.space_uuid !== expectedSpaceUuid) {
                throw new ConflictError(
                    'Document has moved. Reload it and retry',
                );
            }
            if (document.deleted_at) {
                return;
            }
            const now = new Date();
            await trx(DocumentsTableName)
                .where('document_id', document.document_id)
                .whereNull('deleted_at')
                .update({
                    deleted_at: now,
                    deleted_by_user_uuid: userUuid,
                    deleted_with_space: false,
                    updated_at: now,
                });
            await cancelPendingContentReviewRequests(
                trx,
                ContentReviewContentType.DOCUMENT,
                [documentUuid],
            );
        });
    }

    async restore(projectUuid: string, documentUuid: string): Promise<void> {
        await this.database.transaction(async (trx) => {
            const owner = await this.documents(trx, projectUuid)
                .where('documents.document_uuid', documentUuid)
                .first();
            if (!owner) {
                throw new NotFoundError('Deleted Document not found');
            }
            const space =
                owner.space_id === null
                    ? null
                    : await trx(SpaceTableName)
                          .where('space_id', owner.space_id)
                          .whereNull('deleted_at')
                          .forShare()
                          .first();
            if (owner.space_id !== null && !space) {
                throw new ConflictError(
                    'Restore the owning Space before restoring this Document',
                );
            }
            const document = await trx(DocumentsTableName)
                .where({
                    document_uuid: documentUuid,
                    project_uuid: projectUuid,
                })
                .forUpdate()
                .first();
            if (!document || !document.deleted_at) {
                throw new NotFoundError('Deleted Document not found');
            }
            if (document.space_id !== owner.space_id) {
                throw new ConflictError(
                    'Document has moved. Reload it and retry',
                );
            }
            await trx(DocumentsTableName)
                .where('document_id', document.document_id)
                .update({
                    deleted_at: null,
                    deleted_by_user_uuid: null,
                    deleted_with_space: false,
                    updated_at: new Date(),
                });
        });
    }

    async permanentDelete(
        projectUuid: string,
        documentUuid: string,
        {
            expectedSpaceUuid,
            requireDeleted = true,
        }: {
            expectedSpaceUuid?: string | null;
            requireDeleted?: boolean;
        } = {},
    ): Promise<void> {
        await this.database.transaction(async (trx) => {
            const document = await this.documents(trx, projectUuid)
                .where('documents.document_uuid', documentUuid)
                .forUpdate('documents')
                .first();
            if (!document || (requireDeleted && !document.deleted_at)) {
                throw new NotFoundError('Deleted Document not found');
            }
            if (
                expectedSpaceUuid !== undefined &&
                document.space_uuid !== expectedSpaceUuid
            ) {
                throw new ConflictError(
                    'Document has moved. Reload it and retry',
                );
            }
            await trx(DocumentsTableName)
                .where('document_id', document.document_id)
                .delete();
            await cancelPendingContentReviewRequests(
                trx,
                ContentReviewContentType.DOCUMENT,
                [documentUuid],
            );
        });
    }

    async listSpaceUuids(projectUuid: string): Promise<string[]> {
        const rows = await this.activeDocuments(this.database, projectUuid)
            .whereNotNull('documents.space_id')
            .clearSelect()
            .distinct('spaces.space_uuid');
        return rows.map((row) => row.space_uuid);
    }

    async listSummariesByUuid(
        projectUuid: string,
        documentUuids: string[],
    ): Promise<DocumentSummary[]> {
        if (documentUuids.length === 0) {
            return [];
        }
        const rows = await this.activeDocuments(
            this.database,
            projectUuid,
        ).whereIn('documents.document_uuid', documentUuids);
        return rows.map(toSummary);
    }

    async list(
        projectUuid: string,
        options: {
            spaceUuids: string[];
            documentUuids?: string[];
            limit: number;
            offset: number;
        },
    ): Promise<DocumentSummary[]> {
        if (options.spaceUuids.length === 0 && !options.documentUuids?.length) {
            return [];
        }
        const rows = await this.activeDocuments(this.database, projectUuid)
            .where((builder) =>
                builder
                    .whereIn('spaces.space_uuid', options.spaceUuids)
                    .orWhereIn(
                        'documents.document_uuid',
                        options.documentUuids ?? [],
                    ),
            )
            .orderBy('documents.updated_at', 'desc')
            .orderBy('documents.document_uuid')
            .limit(options.limit)
            .offset(options.offset);
        return rows.map(toSummary);
    }

    async get(projectUuid: string, documentUuid: string): Promise<Document> {
        return this.getWithDatabase(this.database, projectUuid, documentUuid);
    }

    /** A Document with one of its historical versions in place of the latest. */
    async getVersion(
        projectUuid: string,
        documentUuid: string,
        versionUuid: string,
    ): Promise<Document> {
        return this.getWithDatabase(
            this.database,
            projectUuid,
            documentUuid,
            versionUuid,
        );
    }

    /** Version history, newest first, with each version's author. */
    async listVersions(
        projectUuid: string,
        documentUuid: string,
        { limit, offset }: { limit: number; offset: number },
    ): Promise<DocumentVersionList> {
        const document = await this.activeDocuments(this.database, projectUuid)
            .where('documents.document_uuid', documentUuid)
            .first();
        if (!document) {
            throw new NotFoundError('Document not found');
        }
        const rows = await this.database(DocumentVersionsTableName)
            .leftJoin(
                UserTableName,
                'users.user_uuid',
                'document_versions.created_by_user_uuid',
            )
            .leftJoin(
                UserAvatarsTableName,
                'user_avatars.user_uuid',
                'users.user_uuid',
            )
            .where('document_versions.document_id', document.document_id)
            .orderBy('document_versions.version_number', 'desc')
            .limit(limit + 1)
            .offset(offset)
            .select<
                Array<
                    UserDisplayRow & {
                        agent_identity: StoredAgentIdentityClaim | null;
                        document_version_uuid: string;
                        version_number: number;
                        created_at: Date;
                    }
                >
            >(
                'document_versions.agent_identity',
                'document_versions.document_version_uuid',
                'document_versions.version_number',
                'document_versions.created_at',
                'users.user_uuid',
                'users.first_name',
                'users.last_name',
                'users.avatar_gradient',
                'user_avatars.content_hash as avatar_content_hash',
            );
        const items: DocumentVersionSummary[] = rows
            .slice(0, limit)
            .map((row) => ({
                agentIdentity: normalizeAgentIdentityClaim(row.agent_identity),
                versionUuid: row.document_version_uuid,
                versionNumber: row.version_number,
                createdAt: row.created_at,
                createdBy: toUserDisplay(row),
            }));
        return {
            items,
            nextOffset: rows.length > limit ? offset + limit : null,
        };
    }

    async getBySlug(projectUuid: string, slug: string): Promise<Document> {
        const row = await this.activeDocuments(this.database, projectUuid)
            .where('documents.slug', slug)
            .first();
        if (!row) {
            throw new NotFoundError('Document not found');
        }
        return this.get(projectUuid, row.document_uuid);
    }

    async moveToSpace(
        {
            projectUuid,
            documentUuid,
            sourceSpaceUuid,
            targetSpaceUuid,
        }: {
            projectUuid: string;
            documentUuid: string;
            /** Null moves a personal Document into its first Space. */
            sourceSpaceUuid: string | null;
            targetSpaceUuid: string;
        },
        { tx = this.database }: { tx?: Knex } = {},
    ): Promise<Document> {
        return tx.transaction(async (trx) => {
            const spaces = await trx(SpaceTableName)
                .join(
                    ProjectTableName,
                    'projects.project_id',
                    'spaces.project_id',
                )
                .where('projects.project_uuid', projectUuid)
                .whereIn(
                    'spaces.space_uuid',
                    sourceSpaceUuid === null
                        ? [targetSpaceUuid]
                        : [sourceSpaceUuid, targetSpaceUuid],
                )
                .whereNull('spaces.deleted_at')
                .orderBy('spaces.space_uuid')
                .select('spaces.space_id', 'spaces.space_uuid')
                .forShare('spaces');
            const target = spaces.find(
                (space) => space.space_uuid === targetSpaceUuid,
            );
            if (
                !target ||
                (sourceSpaceUuid !== null &&
                    !spaces.some(
                        (space) => space.space_uuid === sourceSpaceUuid,
                    ))
            ) {
                throw new NotFoundError('Space not found');
            }
            const document = await this.activeDocuments(trx, projectUuid)
                .where('documents.document_uuid', documentUuid)
                .forUpdate('documents')
                .first();
            if (!document) {
                throw new NotFoundError('Document not found');
            }
            if (document.space_uuid !== sourceSpaceUuid) {
                throw new ConflictError(
                    'Document has moved. Reload it and retry',
                );
            }
            await trx(DocumentsTableName)
                .where('document_id', document.document_id)
                .update({ space_id: target.space_id, updated_at: new Date() });
            return this.getWithDatabase(trx, projectUuid, documentUuid);
        });
    }

    private async getWithDatabase(
        database: Knex,
        projectUuid: string,
        documentUuid: string,
        /** A specific historical version; null loads the latest. */
        versionUuid: string | null = null,
    ): Promise<Document> {
        const row = await this.activeDocuments(database, projectUuid)
            .leftJoin(
                'pinned_document',
                'pinned_document.document_uuid',
                'documents.document_uuid',
            )
            .select('pinned_document.pinned_list_uuid')
            .leftJoin(
                UserTableName,
                'users.user_uuid',
                'documents.created_by_user_uuid',
            )
            .leftJoin(
                UserAvatarsTableName,
                'user_avatars.user_uuid',
                'users.user_uuid',
            )
            .select(
                'users.user_uuid as creator_uuid',
                'users.first_name as creator_first_name',
                'users.last_name as creator_last_name',
                'users.avatar_gradient as creator_avatar_gradient',
                'user_avatars.content_hash as creator_avatar_content_hash',
            )
            .leftJoin(
                `${UserTableName} as owner_user`,
                'owner_user.user_uuid',
                'documents.document_owner_user_uuid',
            )
            .leftJoin(
                `${EmailTableName} as owner_email`,
                function ownerEmail() {
                    this.on(
                        'owner_email.user_id',
                        '=',
                        'owner_user.user_id',
                    ).andOnVal('owner_email.is_primary', true);
                },
            )
            .select(
                'owner_user.first_name as owner_first_name',
                'owner_user.last_name as owner_last_name',
                'owner_email.email as owner_email',
            )
            .leftJoin(ContentVerificationTableName, function verification() {
                this.on(
                    `${ContentVerificationTableName}.content_uuid`,
                    '=',
                    'documents.document_uuid',
                ).andOnVal(
                    `${ContentVerificationTableName}.content_type`,
                    ContentType.DOCUMENT,
                );
            })
            .leftJoin(
                `${UserTableName} as verifier`,
                'verifier.user_uuid',
                `${ContentVerificationTableName}.verified_by_user_uuid`,
            )
            .select(
                `${ContentVerificationTableName}.verified_at`,
                'verifier.user_uuid as verifier_uuid',
                'verifier.first_name as verifier_first_name',
                'verifier.last_name as verifier_last_name',
            )
            .where('documents.document_uuid', documentUuid)
            .first();
        if (!row) {
            throw new NotFoundError('Document not found');
        }
        const versions = database(DocumentVersionsTableName).where(
            'document_id',
            row.document_id,
        );
        const version = await (
            versionUuid === null
                ? versions.orderBy('version_number', 'desc')
                : versions.where('document_version_uuid', versionUuid)
        ).first();
        if (!version) {
            throw new NotFoundError('Document version not found');
        }
        return {
            ...toSummary(row),
            pinnedListUuid: row.pinned_list_uuid ?? null,
            createdBy: toUserDisplay({
                user_uuid: row.creator_uuid,
                first_name: row.creator_first_name,
                last_name: row.creator_last_name,
                avatar_gradient: row.creator_avatar_gradient,
                avatar_content_hash: row.creator_avatar_content_hash,
            }),
            owner: row.document_owner_user_uuid
                ? {
                      userUuid: row.document_owner_user_uuid,
                      firstName: row.owner_first_name ?? '',
                      lastName: row.owner_last_name ?? '',
                      email: row.owner_email ?? null,
                  }
                : null,
            version: {
                agentIdentity: normalizeAgentIdentityClaim(
                    version.agent_identity,
                ),
                versionUuid: version.document_version_uuid,
                versionNumber: version.version_number,
                schemaVersion: DOCUMENT_SCHEMA_VERSION,
                content: parseStoredDocumentContent(getStoredContent(version)),
                createdByUserUuid: version.created_by_user_uuid,
                createdAt: version.created_at,
            },
            verification:
                row.verified_at && row.verifier_uuid
                    ? {
                          verifiedBy: {
                              userUuid: row.verifier_uuid,
                              firstName: row.verifier_first_name ?? '',
                              lastName: row.verifier_last_name ?? '',
                          },
                          verifiedAt: row.verified_at,
                      }
                    : null,
        };
    }

    /**
     * Saved charts or saved SQL charts of a project by uuid or slug (chart
     * slugs include their old aliases), for Document links.
     */
    async findSavedChartsForLinks(
        projectUuid: string,
        kind: DocumentSavedChartKind,
        { uuids, slugs }: { uuids: string[]; slugs: string[] },
    ): Promise<SavedChartForLink[]> {
        if (uuids.length === 0 && slugs.length === 0) {
            return [];
        }
        if (kind === 'sqlChart') {
            const rows: Array<{
                uuid: string;
                slug: string;
                space_uuid: string | null;
                dashboard_uuid: string | null;
                is_deleted: boolean;
            }> = await this.database('saved_sql')
                .where('project_uuid', projectUuid)
                .where((query) =>
                    query
                        .whereIn('saved_sql_uuid', uuids)
                        .orWhereIn('slug', slugs),
                )
                .select(
                    'saved_sql_uuid as uuid',
                    'slug',
                    'space_uuid',
                    'dashboard_uuid',
                    this.database.raw('deleted_at IS NOT NULL as is_deleted'),
                );
            return rows.map((row) => ({
                kind,
                uuid: row.uuid,
                slugs: [row.slug],
                spaceUuid: row.space_uuid,
                dashboardUuid: row.dashboard_uuid,
                isDeleted: row.is_deleted,
            }));
        }
        const { rows } = await this.database.raw<{
            rows: Array<{
                uuid: string;
                slugs: string[];
                space_uuid: string | null;
                dashboard_uuid: string | null;
                is_deleted: boolean;
            }>;
        }>(
            `SELECT sq.saved_query_uuid AS uuid,
                    array_remove(array_append(array_agg(m.slug), sq.slug), NULL) AS slugs,
                    s.space_uuid,
                    sq.dashboard_uuid,
                    sq.deleted_at IS NOT NULL AS is_deleted
             FROM saved_queries sq
             LEFT JOIN spaces s ON s.space_id = sq.space_id
             LEFT JOIN saved_query_slug_mappings m ON m.saved_query_uuid = sq.saved_query_uuid
             WHERE sq.project_uuid = ?
               AND (sq.saved_query_uuid = ANY(?::uuid[])
                    OR sq.slug = ANY(?::text[])
                    OR sq.saved_query_uuid IN (
                        SELECT saved_query_uuid FROM saved_query_slug_mappings
                        WHERE project_uuid = ? AND slug = ANY(?::text[])))
             GROUP BY sq.saved_query_uuid, sq.slug, s.space_uuid, sq.dashboard_uuid, sq.deleted_at`,
            [projectUuid, uuids, slugs, projectUuid, slugs],
        );
        return rows.map((row) => ({
            kind,
            uuid: row.uuid,
            slugs: row.slugs,
            spaceUuid: row.space_uuid,
            dashboardUuid: row.dashboard_uuid,
            isDeleted: row.is_deleted,
        }));
    }

    /** Live Documents whose current version links this saved chart. */
    async findDocumentsLinkingChart(
        projectUuid: string,
        kind: DocumentSavedChartKind,
        chartUuid: string,
    ): Promise<DocumentLinkingChart[]> {
        const { rows } = await this.database.raw<{
            rows: Array<{
                document_uuid: string;
                name: string;
                slug: string;
                space_uuid: string | null;
            }>;
        }>(
            `SELECT d.document_uuid, d.name, d.slug, s.space_uuid
             FROM documents d
             LEFT JOIN spaces s ON s.space_id = d.space_id
             JOIN LATERAL (
                 SELECT v.document_version_uuid FROM document_versions v
                 WHERE v.document_id = d.document_id
                 ORDER BY v.version_number DESC LIMIT 1
             ) latest ON TRUE
             JOIN ${DocumentVersionSavedChartsTableName} l
               ON l.document_version_uuid = latest.document_version_uuid
             WHERE d.project_uuid = ? AND d.deleted_at IS NULL
               AND ${kind === 'chart' ? 'l.saved_query_uuid' : 'l.saved_sql_uuid'} = ?
             GROUP BY d.document_uuid, d.name, d.slug, s.space_uuid
             ORDER BY d.name`,
            [projectUuid, chartUuid],
        );
        return rows.map((row) => ({
            documentUuid: row.document_uuid,
            name: row.name,
            slug: row.slug,
            spaceUuid: row.space_uuid,
        }));
    }

    async create(
        input: CreateDocument,
        agentIdentity: AgentIdentityClaim | null = null,
        onVersionCreated?: OnContentVersionCreated,
    ): Promise<Document> {
        const { content, nextChartNumber } = assignDocumentChartIds(
            parseDocumentContent(DOCUMENT_SCHEMA_VERSION, input.content),
            1,
        );
        return this.database.transaction(async (transaction) => {
            const findSpaceId = async (spaceUuid: string) => {
                const space = await transaction(SpaceTableName)
                    .join(
                        ProjectTableName,
                        'projects.project_id',
                        'spaces.project_id',
                    )
                    .where('projects.project_uuid', input.projectUuid)
                    .where('spaces.space_uuid', spaceUuid)
                    .whereNull('spaces.deleted_at')
                    .select('spaces.space_id')
                    .forShare('spaces')
                    .first();
                if (!space) {
                    throw new NotFoundError('Space not found');
                }
                return space.space_id;
            };
            const spaceId =
                input.spaceUuid === null
                    ? null
                    : await findSpaceId(input.spaceUuid);
            const exactSlug = input.uniqueSlug ? undefined : input.slug;
            const slug =
                exactSlug ??
                (await generateUniqueSlugScopedToProject(
                    transaction,
                    input.projectUuid,
                    DocumentsTableName,
                    input.slug ?? input.name,
                ));
            if (exactSlug !== undefined) {
                await acquireProjectSlugLock(
                    transaction,
                    input.projectUuid,
                    slug,
                );
                const existing = await transaction(DocumentsTableName)
                    .where({ project_uuid: input.projectUuid, slug })
                    .first('document_id');
                if (existing) {
                    throw new ConflictError(
                        'A document with this slug already exists in this project',
                    );
                }
            }
            const [document] = await transaction(DocumentsTableName)
                .insert({
                    project_uuid: input.projectUuid,
                    space_id: spaceId,
                    name: input.name,
                    slug,
                    description: input.description,
                    created_by_user_uuid: input.createdByUserUuid,
                    document_owner_user_uuid: input.ownerUserUuid ?? null,
                })
                .returning(['document_id', 'document_uuid']);
            await transaction(DocumentsTableName)
                .where('document_id', document.document_id)
                .update({ next_chart_number: nextChartNumber });
            const [version] = await transaction(DocumentVersionsTableName)
                .insert({
                    document_id: document.document_id,
                    agent_identity: agentIdentity,
                    version_number: 1,
                    schema_version: DOCUMENT_SCHEMA_VERSION,
                    markdown: content.markdown,
                    chart_data: JSON.stringify(toChartData(content)),
                    created_by_user_uuid: input.createdByUserUuid,
                })
                .returning('document_version_uuid');
            await insertSavedChartLinks(
                transaction,
                version.document_version_uuid,
                content,
            );
            await onVersionCreated?.(
                transaction,
                version.document_version_uuid,
                document.document_uuid,
            );
            return this.getWithDatabase(
                transaction,
                input.projectUuid,
                document.document_uuid,
            );
        });
    }

    async updateContent(
        projectUuid: string,
        documentUuid: string,
        input: DocumentContentUpdate & {
            expectedSpaceUuid: string | null;
        },
        createdByUserUuid: string,
        agentIdentity: AgentIdentityClaim | null = null,
        onVersionCreated?: OnContentVersionCreated,
    ): Promise<Document> {
        return this.database.transaction(async (transaction) => {
            const row = await this.activeDocuments(transaction, projectUuid)
                .where('documents.document_uuid', documentUuid)
                .forUpdate('documents')
                .first();
            if (!row) {
                throw new NotFoundError('Document not found');
            }
            if (row.space_uuid !== input.expectedSpaceUuid) {
                throw new ConflictError(
                    'Document has moved. Reload it and retry',
                );
            }
            const document = await this.getWithDatabase(
                transaction,
                projectUuid,
                documentUuid,
            );
            if (document.version.versionUuid !== input.baseVersionUuid) {
                throw new ConflictError(
                    'Document has changed. Reload the latest version before editing.',
                );
            }
            const { content, nextChartNumber } = assignDocumentChartIds(
                matchDocumentChartKeys(
                    parseDocumentContent(
                        DOCUMENT_SCHEMA_VERSION,
                        input.content,
                        { previous: document.version.content },
                    ),
                    document.version.content,
                ),
                row.next_chart_number,
            );
            const [version] = await transaction(DocumentVersionsTableName)
                .insert({
                    document_id: row.document_id,
                    agent_identity: agentIdentity,
                    version_number: document.version.versionNumber + 1,
                    schema_version: DOCUMENT_SCHEMA_VERSION,
                    markdown: content.markdown,
                    chart_data: JSON.stringify(toChartData(content)),
                    created_by_user_uuid: createdByUserUuid,
                })
                .returning('document_version_uuid');
            await insertSavedChartLinks(
                transaction,
                version.document_version_uuid,
                content,
            );
            await transaction(DocumentsTableName)
                .where('document_id', row.document_id)
                .update({
                    updated_at: new Date(),
                    next_chart_number: nextChartNumber,
                });
            await onVersionCreated?.(
                transaction,
                version.document_version_uuid,
                documentUuid,
            );
            return this.getWithDatabase(transaction, projectUuid, documentUuid);
        });
    }

    async updateMetadata(
        projectUuid: string,
        documentUuid: string,
        input: {
            expectedSpaceUuid: string | null;
            name?: string;
            slug?: string;
            description?: string;
            ownerUserUuid?: string | null;
        },
    ): Promise<Document> {
        const isEdit =
            input.name !== undefined ||
            input.slug !== undefined ||
            input.description !== undefined;
        return this.database.transaction(async (transaction) => {
            if (input.slug !== undefined) {
                await acquireProjectSlugLock(
                    transaction,
                    projectUuid,
                    input.slug,
                );
            }
            const row = await this.activeDocuments(transaction, projectUuid)
                .where('documents.document_uuid', documentUuid)
                .forUpdate('documents')
                .first();
            if (!row) {
                throw new NotFoundError('Document not found');
            }
            if (row.space_uuid !== input.expectedSpaceUuid) {
                throw new ConflictError(
                    'Document has moved. Reload it and retry',
                );
            }
            if (input.slug !== undefined) {
                const existing = await transaction(DocumentsTableName)
                    .where({ project_uuid: projectUuid, slug: input.slug })
                    .whereNot('document_uuid', documentUuid)
                    .first('document_id');
                if (existing) {
                    throw new ConflictError(
                        'A document with this slug already exists in this project',
                    );
                }
            }
            await transaction(DocumentsTableName)
                .where('document_id', row.document_id)
                .update({
                    name: input.name,
                    slug: input.slug,
                    description: input.description,
                    document_owner_user_uuid: input.ownerUserUuid,
                    // Reassigning the owner is not an edit to the Document itself
                    ...(isEdit ? { updated_at: new Date() } : {}),
                });
            return this.getWithDatabase(transaction, projectUuid, documentUuid);
        });
    }
}
