import {
    ConflictError,
    Document,
    DOCUMENT_SCHEMA_VERSION,
    DocumentContentV3,
    DocumentSummary,
    NotFoundError,
    parseDocumentContent,
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
    content: DocumentContentV3;
    createdByUserUuid: string | null;
};

type DocumentRow = DbDocument & {
    organization_uuid: string;
    space_uuid: string;
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

    private activeDocuments(database: Knex, projectUuid: string) {
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
            .whereNull('documents.deleted_at')
            .whereNull('spaces.deleted_at')
            .select(
                'documents.*',
                'organizations.organization_uuid',
                'spaces.space_uuid',
            );
    }

    async listSpaceUuids(projectUuid: string): Promise<string[]> {
        const rows = await this.activeDocuments(this.database, projectUuid)
            .clearSelect()
            .distinct('spaces.space_uuid');
        return rows.map((row) => row.space_uuid);
    }

    async list(
        projectUuid: string,
        options: { spaceUuids: string[]; limit: number; offset: number },
    ): Promise<DocumentSummary[]> {
        if (options.spaceUuids.length === 0) {
            return [];
        }
        const rows = await this.activeDocuments(this.database, projectUuid)
            .whereIn('spaces.space_uuid', options.spaceUuids)
            .orderBy('documents.updated_at', 'desc')
            .orderBy('documents.document_uuid')
            .limit(options.limit)
            .offset(options.offset);
        return rows.map(toSummary);
    }

    async get(projectUuid: string, documentUuid: string): Promise<Document> {
        return this.getWithDatabase(this.database, projectUuid, documentUuid);
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
}
