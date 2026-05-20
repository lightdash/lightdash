import {
    ApiOrganizationDesign,
    ApiOrganizationDesignFile,
    NotFoundError,
    OrganizationDesignFileKind,
} from '@lightdash/common';
import { Knex } from 'knex';
import {
    DbOrganizationDesignFile,
    OrganizationDesignFilesTableName,
} from '../database/entities/organizationDesignFiles';
import {
    DbOrganizationDesign,
    OrganizationDesignsTableName,
} from '../database/entities/organizationDesigns';

type OrganizationDesignModelArguments = {
    database: Knex;
};

const mapDbFile = (
    row: DbOrganizationDesignFile,
): ApiOrganizationDesignFile => ({
    fileUuid: row.file_uuid,
    kind: row.kind as OrganizationDesignFileKind,
    filename: row.filename,
    contentType: row.content_type,
    sizeBytes: row.size_bytes,
    createdAt: row.created_at,
});

const mapDbDesign = (
    row: DbOrganizationDesign,
    files: DbOrganizationDesignFile[],
): ApiOrganizationDesign => ({
    designUuid: row.design_uuid,
    organizationUuid: row.organization_uuid,
    name: row.name,
    description: row.description,
    isDefault: row.is_default,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdByUserUuid: row.created_by_user_uuid,
    files: files.map(mapDbFile),
});

export class OrganizationDesignModel {
    private readonly database: Knex;

    constructor({ database }: OrganizationDesignModelArguments) {
        this.database = database;
    }

    async create(
        organizationUuid: string,
        createdByUserUuid: string,
        data: { name: string; description: string | null },
    ): Promise<ApiOrganizationDesign> {
        const [row] = await this.database(OrganizationDesignsTableName)
            .insert({
                organization_uuid: organizationUuid,
                name: data.name,
                description: data.description,
                created_by_user_uuid: createdByUserUuid,
            })
            .returning('*');
        return mapDbDesign(row, []);
    }

    async findInOrganization(
        organizationUuid: string,
        designUuid: string,
    ): Promise<ApiOrganizationDesign | undefined> {
        const row = await this.database(OrganizationDesignsTableName)
            .where('organization_uuid', organizationUuid)
            .andWhere('design_uuid', designUuid)
            .first();
        if (!row) return undefined;
        const files = await this.database(OrganizationDesignFilesTableName)
            .where('design_uuid', designUuid)
            .orderBy('created_at', 'asc');
        return mapDbDesign(row, files);
    }

    async listByOrganization(
        organizationUuid: string,
    ): Promise<ApiOrganizationDesign[]> {
        const designs = await this.database(OrganizationDesignsTableName)
            .where('organization_uuid', organizationUuid)
            .orderBy('created_at', 'desc');
        if (designs.length === 0) return [];
        const designUuids = designs.map((d) => d.design_uuid);
        const files = await this.database(OrganizationDesignFilesTableName)
            .whereIn('design_uuid', designUuids)
            .orderBy('created_at', 'asc');
        const filesByDesign = new Map<string, DbOrganizationDesignFile[]>();
        for (const f of files) {
            const arr = filesByDesign.get(f.design_uuid) ?? [];
            arr.push(f);
            filesByDesign.set(f.design_uuid, arr);
        }
        return designs.map((d) =>
            mapDbDesign(d, filesByDesign.get(d.design_uuid) ?? []),
        );
    }

    async getDefault(
        organizationUuid: string,
    ): Promise<ApiOrganizationDesign | null> {
        const row = await this.database(OrganizationDesignsTableName)
            .where('organization_uuid', organizationUuid)
            .andWhere('is_default', true)
            .first();
        if (!row) return null;
        const files = await this.database(OrganizationDesignFilesTableName)
            .where('design_uuid', row.design_uuid)
            .orderBy('created_at', 'asc');
        return mapDbDesign(row, files);
    }

    async update(
        organizationUuid: string,
        designUuid: string,
        data: { name?: string; description?: string | null },
    ): Promise<ApiOrganizationDesign> {
        const updateData: Record<string, unknown> = {
            updated_at: this.database.fn.now() as unknown as Date,
        };
        if (data.name !== undefined) updateData.name = data.name;
        if (data.description !== undefined)
            updateData.description = data.description;

        const [row] = await this.database(OrganizationDesignsTableName)
            .where('organization_uuid', organizationUuid)
            .andWhere('design_uuid', designUuid)
            .update(updateData)
            .returning('*');
        if (!row) {
            throw new NotFoundError(`Design not found: ${designUuid}`);
        }
        const files = await this.database(OrganizationDesignFilesTableName)
            .where('design_uuid', designUuid)
            .orderBy('created_at', 'asc');
        return mapDbDesign(row, files);
    }

    async delete(organizationUuid: string, designUuid: string): Promise<void> {
        const rowCount = await this.database(OrganizationDesignsTableName)
            .where('organization_uuid', organizationUuid)
            .andWhere('design_uuid', designUuid)
            .delete();
        if (rowCount === 0) {
            throw new NotFoundError(`Design not found: ${designUuid}`);
        }
    }

    /**
     * Idempotent: clear whichever design in this org currently has
     * `is_default = true`. No-op when nothing is currently default.
     */
    async clearDefault(organizationUuid: string): Promise<void> {
        await this.database(OrganizationDesignsTableName)
            .where('organization_uuid', organizationUuid)
            .andWhere('is_default', true)
            .update({
                is_default: false,
                updated_at: this.database.fn.now() as unknown as Date,
            });
    }

    /**
     * Atomically clear the existing default for the org and mark `designUuid`
     * as the new default. The partial unique index would otherwise reject
     * the SET if two rows briefly both had `is_default = true`.
     */
    async setDefault(
        organizationUuid: string,
        designUuid: string,
    ): Promise<ApiOrganizationDesign> {
        return this.database.transaction(async (trx) => {
            const target = await trx(OrganizationDesignsTableName)
                .where('organization_uuid', organizationUuid)
                .andWhere('design_uuid', designUuid)
                .first();
            if (!target) {
                throw new NotFoundError(`Design not found: ${designUuid}`);
            }
            await trx(OrganizationDesignsTableName)
                .where('organization_uuid', organizationUuid)
                .andWhere('is_default', true)
                .update({
                    is_default: false,
                    updated_at: trx.fn.now() as unknown as Date,
                });
            const [row] = await trx(OrganizationDesignsTableName)
                .where('design_uuid', designUuid)
                .update({
                    is_default: true,
                    updated_at: trx.fn.now() as unknown as Date,
                })
                .returning('*');
            const files = await trx(OrganizationDesignFilesTableName)
                .where('design_uuid', designUuid)
                .orderBy('created_at', 'asc');
            return mapDbDesign(row, files);
        });
    }

    async addFile(
        designUuid: string,
        createdByUserUuid: string,
        file: {
            fileUuid: string;
            kind: OrganizationDesignFileKind;
            filename: string;
            contentType: string;
            sizeBytes: number;
        },
    ): Promise<ApiOrganizationDesignFile> {
        return this.database.transaction(async (trx) => {
            const [row] = await trx(OrganizationDesignFilesTableName)
                .insert({
                    file_uuid: file.fileUuid,
                    design_uuid: designUuid,
                    kind: file.kind,
                    filename: file.filename,
                    content_type: file.contentType,
                    size_bytes: file.sizeBytes,
                    created_by_user_uuid: createdByUserUuid,
                })
                .returning('*');
            await trx(OrganizationDesignsTableName)
                .where('design_uuid', designUuid)
                .update({ updated_at: trx.fn.now() as unknown as Date });
            return mapDbFile(row);
        });
    }

    async findFile(
        designUuid: string,
        fileUuid: string,
    ): Promise<ApiOrganizationDesignFile | undefined> {
        const row = await this.database(OrganizationDesignFilesTableName)
            .where('file_uuid', fileUuid)
            .andWhere('design_uuid', designUuid)
            .first();
        return row ? mapDbFile(row) : undefined;
    }

    async removeFile(
        designUuid: string,
        fileUuid: string,
    ): Promise<ApiOrganizationDesignFile> {
        return this.database.transaction(async (trx) => {
            const [row] = await trx(OrganizationDesignFilesTableName)
                .where('file_uuid', fileUuid)
                .andWhere('design_uuid', designUuid)
                .delete()
                .returning('*');
            if (!row) {
                throw new NotFoundError(`Design file not found: ${fileUuid}`);
            }
            await trx(OrganizationDesignsTableName)
                .where('design_uuid', designUuid)
                .update({ updated_at: trx.fn.now() as unknown as Date });
            return mapDbFile(row);
        });
    }
}
