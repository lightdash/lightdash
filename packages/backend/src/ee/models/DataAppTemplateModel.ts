import {
    type DataAppTemplateSummary,
    type TemplateQuestion,
} from '@lightdash/common';
import { type Knex } from 'knex';
import {
    DataAppTemplateFilesTableName,
    DataAppTemplatesTableName,
    type DbDataAppTemplate,
    type DbDataAppTemplateFile,
} from '../../database/entities/dataAppTemplates';

export type DataAppTemplateWrite = {
    organizationUuid: string;
    slug: string;
    name: string;
    description: string;
    category: string;
    questions: TemplateQuestion[];
    files: { filename: string; sizeBytes: number }[];
    createdByUserUuid: string | null;
};

const toSummary = (
    row: DbDataAppTemplate,
    fileCount: number,
): DataAppTemplateSummary => ({
    templateUuid: row.template_uuid,
    organizationUuid: row.organization_uuid,
    slug: row.slug,
    name: row.name,
    description: row.description,
    category: row.category,
    questions: row.questions ?? [],
    fileCount,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
});

export class DataAppTemplateModel {
    private readonly database: Knex;

    constructor({ database }: { database: Knex }) {
        this.database = database;
    }

    async listByOrganization(
        organizationUuid: string,
    ): Promise<DataAppTemplateSummary[]> {
        const rows = await this.database(DataAppTemplatesTableName)
            .where('organization_uuid', organizationUuid)
            .orderBy('name', 'asc');
        if (rows.length === 0) return [];
        const counts = await this.database(DataAppTemplateFilesTableName)
            .whereIn(
                'template_uuid',
                rows.map((r) => r.template_uuid),
            )
            .groupBy('template_uuid')
            .select('template_uuid')
            .count<{ template_uuid: string; count: string }[]>('* as count');
        const countByUuid = new Map(
            counts.map((c) => [c.template_uuid, Number(c.count)]),
        );
        return rows.map((row) =>
            toSummary(row, countByUuid.get(row.template_uuid) ?? 0),
        );
    }

    async findBySlug(
        organizationUuid: string,
        slug: string,
    ): Promise<DataAppTemplateSummary | undefined> {
        const row = await this.database(DataAppTemplatesTableName)
            .where({ organization_uuid: organizationUuid, slug })
            .first();
        if (!row) return undefined;
        const files = await this.listFiles(row.template_uuid);
        return toSummary(row, files.length);
    }

    async listFiles(templateUuid: string): Promise<DbDataAppTemplateFile[]> {
        return this.database(DataAppTemplateFilesTableName)
            .where('template_uuid', templateUuid)
            .orderBy('filename', 'asc');
    }

    /**
     * Create the template, or replace it in place when the org already has
     * the slug: metadata and the file list are swapped atomically so the
     * template uuid (and its storage prefix) stay stable across uploads.
     */
    async upsert(
        write: DataAppTemplateWrite,
        templateUuid: string,
    ): Promise<{ summary: DataAppTemplateSummary; created: boolean }> {
        return this.database.transaction(async (trx) => {
            const existing = await trx(DataAppTemplatesTableName)
                .where({
                    organization_uuid: write.organizationUuid,
                    slug: write.slug,
                })
                .first();
            const questions = JSON.stringify(write.questions);
            let row: DbDataAppTemplate;
            if (existing) {
                [row] = await trx(DataAppTemplatesTableName)
                    .where('template_uuid', existing.template_uuid)
                    .update({
                        name: write.name,
                        description: write.description,
                        category: write.category,
                        questions,
                        updated_at: new Date(),
                    })
                    .returning('*');
                await trx(DataAppTemplateFilesTableName)
                    .where('template_uuid', existing.template_uuid)
                    .delete();
            } else {
                [row] = await trx(DataAppTemplatesTableName)
                    .insert({
                        template_uuid: templateUuid,
                        organization_uuid: write.organizationUuid,
                        slug: write.slug,
                        name: write.name,
                        description: write.description,
                        category: write.category,
                        questions,
                        created_by_user_uuid: write.createdByUserUuid,
                    })
                    .returning('*');
            }
            if (write.files.length > 0) {
                await trx(DataAppTemplateFilesTableName).insert(
                    write.files.map((file) => ({
                        template_uuid: row.template_uuid,
                        filename: file.filename,
                        size_bytes: file.sizeBytes,
                    })),
                );
            }
            return {
                summary: toSummary(row, write.files.length),
                created: !existing,
            };
        });
    }

    async delete(organizationUuid: string, slug: string): Promise<boolean> {
        const deleted = await this.database(DataAppTemplatesTableName)
            .where({ organization_uuid: organizationUuid, slug })
            .delete();
        return deleted > 0;
    }
}
