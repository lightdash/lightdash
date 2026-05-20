import {
    AiAgentDocument,
    AiAgentDocumentContent,
    AiAgentDocumentStructuredSummary,
    AiAgentDocumentSummary,
    AlreadyExistsError,
    NotFoundError,
} from '@lightdash/common';
import { Knex } from 'knex';
import { omit } from 'lodash';
import {
    AiAgentDocumentAccessTableName,
    AiAgentDocumentTableName,
    DbAiAgentDocument,
} from '../database/entities/aiAgentDocument';

type DbDocumentWithAccess = DbAiAgentDocument & {
    agent_access: string[] | null;
};

const mapRowToDocument = (row: DbDocumentWithAccess): AiAgentDocument => ({
    uuid: row.ai_agent_document_uuid,
    organizationUuid: row.organization_uuid,
    projectUuid: row.project_uuid,
    name: row.name,
    originalFilename: row.original_filename,
    mimeType: row.mime_type,
    contentSizeBytes: row.content_size_bytes,
    summary: row.summary,
    storageKey: row.storage_key,
    agentAccess: row.agent_access ?? [],
    createdByUserUuid: row.created_by_user_uuid,
    updatedByUserUuid: row.updated_by_user_uuid,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
});

const mapRowToSummary = (row: DbDocumentWithAccess): AiAgentDocumentSummary => {
    const data = omit(mapRowToDocument(row), 'storageKey');
    return data;
};

export class AiAgentDocumentModel {
    private readonly database: Knex;

    constructor({ database }: { database: Knex }) {
        this.database = database;
    }

    private baseSelect(qb: Knex = this.database) {
        return qb(AiAgentDocumentTableName).select<DbDocumentWithAccess[]>(
            `${AiAgentDocumentTableName}.*`,
            qb.raw(
                `COALESCE(
                        (SELECT array_agg(access.ai_agent_uuid)
                         FROM ?? AS access
                         WHERE access.ai_agent_document_uuid = ??.ai_agent_document_uuid),
                        ARRAY[]::uuid[]
                    ) AS agent_access`,
                [AiAgentDocumentAccessTableName, AiAgentDocumentTableName],
            ),
        );
    }

    private async findOnQb(
        uuid: string,
        qb: Knex,
    ): Promise<AiAgentDocument | undefined> {
        const row = await this.baseSelect(qb)
            .where(`${AiAgentDocumentTableName}.ai_agent_document_uuid`, uuid)
            .first();
        return row ? mapRowToDocument(row) : undefined;
    }

    async findAllForOrganization(args: {
        organizationUuid: string;
        projectUuid?: string | null;
    }): Promise<AiAgentDocumentSummary[]> {
        const query = this.baseSelect().where(
            `${AiAgentDocumentTableName}.organization_uuid`,
            args.organizationUuid,
        );
        if (args.projectUuid !== undefined) {
            if (args.projectUuid === null) {
                void query.whereNull(
                    `${AiAgentDocumentTableName}.project_uuid`,
                );
            } else {
                void query.where(
                    `${AiAgentDocumentTableName}.project_uuid`,
                    args.projectUuid,
                );
            }
        }
        const rows = await query.orderBy(
            `${AiAgentDocumentTableName}.created_at`,
            'desc',
        );
        return rows.map(mapRowToSummary);
    }

    async find(uuid: string): Promise<AiAgentDocument | undefined> {
        const row = await this.baseSelect()
            .where(`${AiAgentDocumentTableName}.ai_agent_document_uuid`, uuid)
            .first();
        return row ? mapRowToDocument(row) : undefined;
    }

    async get(uuid: string): Promise<AiAgentDocument> {
        const doc = await this.find(uuid);
        if (!doc) {
            throw new NotFoundError(`AI agent document ${uuid} not found`);
        }
        return doc;
    }

    async getOrganizationContentSize(
        organizationUuid: string,
    ): Promise<number> {
        const result = await this.database(AiAgentDocumentTableName)
            .where('organization_uuid', organizationUuid)
            .sum<{ total: string | null }>({ total: 'content_size_bytes' })
            .first();
        return Number(result?.total ?? 0);
    }

    async create(args: {
        organizationUuid: string;
        projectUuid: string | null;
        name: string;
        originalFilename: string;
        mimeType: string;
        content: string;
        summary: AiAgentDocumentStructuredSummary;
        storageKey: string;
        agentUuids: string[];
        createdByUserUuid: string | null;
    }): Promise<AiAgentDocument> {
        const contentSizeBytes = Buffer.byteLength(args.content, 'utf8');

        return this.database.transaction(async (trx) => {
            const inserted = await trx(AiAgentDocumentTableName)
                .insert({
                    organization_uuid: args.organizationUuid,
                    project_uuid: args.projectUuid,
                    name: args.name,
                    original_filename: args.originalFilename,
                    mime_type: args.mimeType,
                    content: args.content,
                    content_size_bytes: contentSizeBytes,
                    summary: args.summary,
                    storage_key: args.storageKey,
                    created_by_user_uuid: args.createdByUserUuid,
                    updated_by_user_uuid: args.createdByUserUuid,
                })
                .returning('ai_agent_document_uuid');

            const documentUuid = inserted[0].ai_agent_document_uuid;

            if (args.agentUuids.length > 0) {
                await trx(AiAgentDocumentAccessTableName).insert(
                    args.agentUuids.map((agentUuid) => ({
                        ai_agent_document_uuid: documentUuid,
                        ai_agent_uuid: agentUuid,
                    })),
                );
            }

            const created = await this.findOnQb(documentUuid, trx);
            if (!created) {
                throw new AlreadyExistsError(
                    'AI agent document creation race detected',
                );
            }
            return created;
        });
    }

    private static agentAccessSubquery(qb: Knex, agentUuid: string) {
        return qb.raw(
            `(
                NOT EXISTS (
                    SELECT 1 FROM ?? AS access
                    WHERE access.ai_agent_document_uuid = ??.ai_agent_document_uuid
                )
                OR EXISTS (
                    SELECT 1 FROM ?? AS access
                    WHERE access.ai_agent_document_uuid = ??.ai_agent_document_uuid
                      AND access.ai_agent_uuid = ?
                )
            )`,
            [
                AiAgentDocumentAccessTableName,
                AiAgentDocumentTableName,
                AiAgentDocumentAccessTableName,
                AiAgentDocumentTableName,
                agentUuid,
            ],
        );
    }

    async findAllForAgent(args: {
        organizationUuid: string;
        agentUuid: string;
        projectUuid: string | null;
    }): Promise<AiAgentDocumentSummary[]> {
        const query = this.baseSelect()
            .where(
                `${AiAgentDocumentTableName}.organization_uuid`,
                args.organizationUuid,
            )
            .andWhere(
                AiAgentDocumentModel.agentAccessSubquery(
                    this.database,
                    args.agentUuid,
                ),
            );

        if (args.projectUuid) {
            void query.andWhere((builder) => {
                void builder
                    .whereNull(`${AiAgentDocumentTableName}.project_uuid`)
                    .orWhere(
                        `${AiAgentDocumentTableName}.project_uuid`,
                        args.projectUuid!,
                    );
            });
        } else {
            void query.whereNull(`${AiAgentDocumentTableName}.project_uuid`);
        }

        const rows = await query.orderBy(
            `${AiAgentDocumentTableName}.created_at`,
            'desc',
        );
        return rows.map(mapRowToSummary);
    }

    async getContentForAgent(args: {
        organizationUuid: string;
        agentUuid: string;
        documentUuid: string;
    }): Promise<AiAgentDocumentContent | undefined> {
        const row = await this.database(AiAgentDocumentTableName)
            .select<
                Pick<
                    DbAiAgentDocument,
                    'ai_agent_document_uuid' | 'name' | 'mime_type' | 'content'
                >
            >('ai_agent_document_uuid', 'name', 'mime_type', 'content')
            .where(
                `${AiAgentDocumentTableName}.ai_agent_document_uuid`,
                args.documentUuid,
            )
            .andWhere(
                `${AiAgentDocumentTableName}.organization_uuid`,
                args.organizationUuid,
            )
            .andWhere(
                AiAgentDocumentModel.agentAccessSubquery(
                    this.database,
                    args.agentUuid,
                ),
            )
            .first();

        if (!row || row.content === null) {
            return undefined;
        }

        return {
            uuid: row.ai_agent_document_uuid,
            name: row.name,
            mimeType: row.mime_type,
            content: row.content,
        };
    }

    async delete(uuid: string): Promise<void> {
        const deleted = await this.database(AiAgentDocumentTableName)
            .where('ai_agent_document_uuid', uuid)
            .delete();
        if (deleted === 0) {
            throw new NotFoundError(`AI agent document ${uuid} not found`);
        }
    }
}
