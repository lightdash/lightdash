import {
    ConflictError,
    Document,
    DOCUMENT_SCHEMA_VERSION,
    DocumentContent,
    DocumentSummary,
    NotFoundError,
    parseDocumentContent,
    UpdateDocumentContentRequest,
} from '@lightdash/common';
import { Knex } from 'knex';
import {
    DbDocument,
    DocumentsTableName,
    DocumentVersionsTableName,
} from '../database/entities/documents';
import { OrganizationTableName } from '../database/entities/organizations';
import { ProjectTableName } from '../database/entities/projects';
import { SpaceTableName } from '../database/entities/spaces';
import {
    acquireProjectSlugLock,
    generateUniqueSlugScopedToProject,
} from '../utils/SlugUtils';

export type CreateDocument = {
    projectUuid: string;
    spaceUuid: string;
    name: string;
    slug?: string;
    description: string;
    content: DocumentContent;
    createdByUserUuid: string | null;
};

export type DocumentContentUpdate = UpdateDocumentContentRequest;

type DocumentRow = DbDocument & {
    organization_uuid: string;
    space_uuid: string;
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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
});

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
            .join(SpaceTableName, 'spaces.space_id', 'documents.space_id')
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
        expectedSpaceUuid: string,
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
            const space = await trx(SpaceTableName)
                .where('space_id', owner.space_id)
                .whereNull('deleted_at')
                .forShare()
                .first();
            if (!space) {
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
        }: { expectedSpaceUuid?: string; requireDeleted?: boolean } = {},
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
        });
    }

    async listSpaceUuids(projectUuid: string): Promise<string[]> {
        const rows = await this.activeDocuments(this.database, projectUuid)
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
            sourceSpaceUuid: string;
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
                .whereIn('spaces.space_uuid', [
                    sourceSpaceUuid,
                    targetSpaceUuid,
                ])
                .whereNull('spaces.deleted_at')
                .orderBy('spaces.space_uuid')
                .select('spaces.space_id', 'spaces.space_uuid')
                .forShare('spaces');
            const target = spaces.find(
                (space) => space.space_uuid === targetSpaceUuid,
            );
            if (
                !target ||
                !spaces.some((space) => space.space_uuid === sourceSpaceUuid)
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
    ): Promise<Document> {
        const row = await this.activeDocuments(database, projectUuid)
            .where('documents.document_uuid', documentUuid)
            .first();
        if (!row) {
            throw new NotFoundError('Document not found');
        }
        const version = await database(DocumentVersionsTableName)
            .where('document_id', row.document_id)
            .orderBy('version_number', 'desc')
            .first();
        if (!version) {
            throw new NotFoundError('Document version not found');
        }
        return {
            ...toSummary(row),
            version: {
                versionUuid: version.document_version_uuid,
                versionNumber: version.version_number,
                schemaVersion: DOCUMENT_SCHEMA_VERSION,
                content: parseDocumentContent(
                    version.schema_version,
                    version.content,
                ),
                createdByUserUuid: version.created_by_user_uuid,
                createdAt: version.created_at,
            },
        };
    }

    async create(input: CreateDocument): Promise<Document> {
        const content = parseDocumentContent(
            DOCUMENT_SCHEMA_VERSION,
            input.content,
        );
        return this.database.transaction(async (transaction) => {
            const space = await transaction(SpaceTableName)
                .join(
                    ProjectTableName,
                    'projects.project_id',
                    'spaces.project_id',
                )
                .where('projects.project_uuid', input.projectUuid)
                .where('spaces.space_uuid', input.spaceUuid)
                .whereNull('spaces.deleted_at')
                .select('spaces.space_id')
                .forShare('spaces')
                .first();
            if (!space) {
                throw new NotFoundError('Space not found');
            }
            const slug =
                input.slug ??
                (await generateUniqueSlugScopedToProject(
                    transaction,
                    input.projectUuid,
                    DocumentsTableName,
                    input.name,
                ));
            if (input.slug !== undefined) {
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
                    space_id: space.space_id,
                    name: input.name,
                    slug,
                    description: input.description,
                    created_by_user_uuid: input.createdByUserUuid,
                })
                .returning(['document_id', 'document_uuid']);
            await transaction(DocumentVersionsTableName).insert({
                document_id: document.document_id,
                version_number: 1,
                schema_version: DOCUMENT_SCHEMA_VERSION,
                content,
                created_by_user_uuid: input.createdByUserUuid,
            });
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
            expectedSpaceUuid: string;
        },
        createdByUserUuid: string,
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
            const content = parseDocumentContent(
                DOCUMENT_SCHEMA_VERSION,
                input.content,
            );
            await transaction(DocumentVersionsTableName).insert({
                document_id: row.document_id,
                version_number: document.version.versionNumber + 1,
                schema_version: DOCUMENT_SCHEMA_VERSION,
                content,
                created_by_user_uuid: createdByUserUuid,
            });
            await transaction(DocumentsTableName)
                .where('document_id', row.document_id)
                .update({ updated_at: new Date() });
            return this.getWithDatabase(transaction, projectUuid, documentUuid);
        });
    }

    async updateMetadata(
        projectUuid: string,
        documentUuid: string,
        input: {
            expectedSpaceUuid: string;
            name?: string;
            slug?: string;
            description?: string;
        },
    ): Promise<Document> {
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
                    updated_at: new Date(),
                });
            return this.getWithDatabase(transaction, projectUuid, documentUuid);
        });
    }
}
