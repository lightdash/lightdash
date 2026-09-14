import {
    AlreadyExistsError,
    ApiOrganizationDesign,
    ApiOrganizationDesignFile,
    generateSlug,
    NotFoundError,
    OrganizationDesignFileKind,
    type UuidOrSlug,
} from '@lightdash/common';
import { Knex } from 'knex';
import { validate as isValidUuid, v4 as uuidv4 } from 'uuid';
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

export type OrganizationDesignFileWrite = {
    fileUuid: string;
    kind: OrganizationDesignFileKind;
    filename: string;
    contentType: string;
    sizeBytes: number;
};

const ORGANIZATION_DESIGN_SLUG_LOCK_NAMESPACE = 4;
const MAX_ORGANIZATION_DESIGN_SLUG_LENGTH = 255;
const UUID_SHAPED_SLUG_PATTERN =
    /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

const acquireOrganizationDesignSlugLock = async (
    trx: Knex.Transaction,
    organizationUuid: string,
    slug: string,
): Promise<void> => {
    await trx.raw('SELECT pg_advisory_xact_lock(?, hashtext(?))', [
        ORGANIZATION_DESIGN_SLUG_LOCK_NAMESPACE,
        `${organizationUuid}:${slug}`,
    ]);
};

const generateUniqueSlug = async (
    trx: Knex.Transaction,
    organizationUuid: string,
    name: string,
): Promise<string> => {
    const generatedSlug = generateSlug(name).slice(
        0,
        MAX_ORGANIZATION_DESIGN_SLUG_LENGTH,
    );
    const baseSlug = UUID_SHAPED_SLUG_PATTERN.test(generatedSlug)
        ? `theme-${generatedSlug}`
        : generatedSlug;

    let increment = 0;
    for (;;) {
        const suffix = increment === 0 ? '' : `-${increment}`;
        const candidate = `${baseSlug.slice(
            0,
            MAX_ORGANIZATION_DESIGN_SLUG_LENGTH - suffix.length,
        )}${suffix}`;
        // A forced package slug can match any generated suffix. Lock each
        // candidate before checking so generated and forced creates cannot
        // race into the same organization-scoped slug.
        // eslint-disable-next-line no-await-in-loop
        await acquireOrganizationDesignSlugLock(
            trx,
            organizationUuid,
            candidate,
        );
        // eslint-disable-next-line no-await-in-loop
        const existing = await trx(OrganizationDesignsTableName)
            .select('slug')
            .where({ organization_uuid: organizationUuid, slug: candidate })
            .first();
        if (!existing) return candidate;
        increment += 1;
    }
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
    slug: row.slug,
    name: row.name,
    description: row.description,
    extraInstructions: row.extra_instructions,
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

    private static async lockDesignForFileMutation(
        trx: Knex.Transaction,
        designUuid: string,
    ): Promise<void> {
        const design = await trx(OrganizationDesignsTableName)
            .select('design_uuid')
            .where('design_uuid', designUuid)
            .forUpdate()
            .first();
        if (!design) {
            throw new NotFoundError(`Design not found: ${designUuid}`);
        }
    }

    async create(
        organizationUuid: string,
        createdByUserUuid: string,
        data: { name: string; description: string | null },
    ): Promise<ApiOrganizationDesign> {
        return this.database.transaction(async (trx) => {
            const slug = await generateUniqueSlug(
                trx,
                organizationUuid,
                data.name,
            );
            const [row] = await trx(OrganizationDesignsTableName)
                .insert({
                    design_uuid: uuidv4(),
                    organization_uuid: organizationUuid,
                    slug,
                    name: data.name,
                    description: data.description,
                    extra_instructions: null,
                    created_by_user_uuid: createdByUserUuid,
                })
                .returning('*');
            return mapDbDesign(row, []);
        });
    }

    async createWithFiles(
        organizationUuid: string,
        createdByUserUuid: string,
        data: {
            designUuid: string;
            slug: string;
            name: string;
            description: string | null;
            extraInstructions: string | null;
            files: OrganizationDesignFileWrite[];
        },
    ): Promise<ApiOrganizationDesign> {
        return this.database.transaction(async (trx) => {
            await acquireOrganizationDesignSlugLock(
                trx,
                organizationUuid,
                data.slug,
            );
            const existing = await trx(OrganizationDesignsTableName)
                .where({
                    organization_uuid: organizationUuid,
                    slug: data.slug,
                })
                .first();
            if (existing) {
                throw new AlreadyExistsError(
                    `A theme with slug "${data.slug}" already exists in this organization`,
                );
            }

            const [row] = await trx(OrganizationDesignsTableName)
                .insert({
                    design_uuid: data.designUuid,
                    organization_uuid: organizationUuid,
                    slug: data.slug,
                    name: data.name,
                    description: data.description,
                    extra_instructions: data.extraInstructions,
                    created_by_user_uuid: createdByUserUuid,
                })
                .returning('*');

            const fileRows = data.files.map((file) => ({
                file_uuid: file.fileUuid,
                design_uuid: data.designUuid,
                kind: file.kind,
                filename: file.filename,
                content_type: file.contentType,
                size_bytes: file.sizeBytes,
                created_by_user_uuid: createdByUserUuid,
            }));
            const insertedFiles =
                fileRows.length === 0
                    ? []
                    : await trx(OrganizationDesignFilesTableName)
                          .insert(fileRows)
                          .returning('*');
            return mapDbDesign(row, insertedFiles);
        });
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
            .orderBy('created_at', 'asc')
            .orderBy('file_uuid', 'asc');
        return mapDbDesign(row, files);
    }

    async findByIdOrSlug(
        organizationUuid: string,
        designUuidOrSlug: UuidOrSlug,
    ): Promise<ApiOrganizationDesign | undefined> {
        const query = this.database(OrganizationDesignsTableName).where(
            'organization_uuid',
            organizationUuid,
        );
        if (isValidUuid(designUuidOrSlug)) {
            void query.andWhere('design_uuid', designUuidOrSlug);
        } else {
            void query.andWhere('slug', designUuidOrSlug);
        }
        const row = await query.first();
        if (!row) return undefined;
        const files = await this.database(OrganizationDesignFilesTableName)
            .where('design_uuid', row.design_uuid)
            .orderBy('created_at', 'asc')
            .orderBy('file_uuid', 'asc');
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
            .orderBy('created_at', 'asc')
            .orderBy('file_uuid', 'asc');
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
            .orderBy('created_at', 'asc')
            .orderBy('file_uuid', 'asc');
        return mapDbDesign(row, files);
    }

    async update(
        organizationUuid: string,
        designUuid: string,
        data: {
            name?: string;
            description?: string | null;
            extraInstructions?: string | null;
        },
    ): Promise<ApiOrganizationDesign> {
        const updateData: Record<string, unknown> = {
            updated_at: this.database.fn.now() as unknown as Date,
        };
        if (data.name !== undefined) updateData.name = data.name;
        if (data.description !== undefined)
            updateData.description = data.description;
        if (data.extraInstructions !== undefined)
            updateData.extra_instructions = data.extraInstructions;

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
            .orderBy('created_at', 'asc')
            .orderBy('file_uuid', 'asc');
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
                .orderBy('created_at', 'asc')
                .orderBy('file_uuid', 'asc');
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
            await OrganizationDesignModel.lockDesignForFileMutation(
                trx,
                designUuid,
            );
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
            await OrganizationDesignModel.lockDesignForFileMutation(
                trx,
                designUuid,
            );
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

    /**
     * Remove every file row for a design. Returns the deleted rows so the
     * caller can delete exactly those S3 objects — sweeping the design's
     * whole S3 prefix instead would race with a concurrent upload.
     */
    async removeAllFiles(
        designUuid: string,
    ): Promise<ApiOrganizationDesignFile[]> {
        return this.database.transaction(async (trx) => {
            await OrganizationDesignModel.lockDesignForFileMutation(
                trx,
                designUuid,
            );
            const rows = await trx(OrganizationDesignFilesTableName)
                .where('design_uuid', designUuid)
                .delete()
                .returning('*');
            if (rows.length > 0) {
                await trx(OrganizationDesignsTableName)
                    .where('design_uuid', designUuid)
                    .update({ updated_at: trx.fn.now() as unknown as Date });
            }
            return rows.map(mapDbFile);
        });
    }

    // Re-check package-managed state under a row lock before callers return
    // NO_CHANGES for a previously loaded snapshot.
    async confirmPackageSnapshot(
        organizationUuid: string,
        snapshot: ApiOrganizationDesign,
    ): Promise<ApiOrganizationDesign | undefined> {
        return this.database.transaction(async (trx) => {
            const current = await trx(OrganizationDesignsTableName)
                .where({
                    organization_uuid: organizationUuid,
                    design_uuid: snapshot.designUuid,
                })
                .forUpdate()
                .first();
            if (!current) return undefined;

            const files = await trx(OrganizationDesignFilesTableName)
                .where('design_uuid', snapshot.designUuid)
                .orderBy('created_at', 'asc')
                .orderBy('file_uuid', 'asc');
            const packageMetadataMatches =
                current.slug === snapshot.slug &&
                current.name === snapshot.name &&
                current.description === snapshot.description &&
                current.extra_instructions === snapshot.extraInstructions;
            const fileSnapshotMatches =
                files.length === snapshot.files.length &&
                files.every(
                    (file, index) =>
                        file.file_uuid === snapshot.files[index].fileUuid,
                );
            if (!packageMetadataMatches || !fileSnapshotMatches) {
                return undefined;
            }
            return mapDbDesign(current, files);
        });
    }

    async replaceFiles(
        organizationUuid: string,
        designUuid: string,
        createdByUserUuid: string,
        data: {
            name: string;
            description: string | null;
            extraInstructions: string | null;
            files: OrganizationDesignFileWrite[];
        },
    ): Promise<{
        design: ApiOrganizationDesign;
        removedFiles: ApiOrganizationDesignFile[];
    }> {
        return this.database.transaction(async (trx) => {
            const current = await trx(OrganizationDesignsTableName)
                .where({
                    organization_uuid: organizationUuid,
                    design_uuid: designUuid,
                })
                .forUpdate()
                .first();
            if (!current) {
                throw new NotFoundError(`Design not found: ${designUuid}`);
            }

            const removedRows = await trx(OrganizationDesignFilesTableName)
                .where('design_uuid', designUuid)
                .delete()
                .returning('*');

            const fileRows = data.files.map((file) => ({
                file_uuid: file.fileUuid,
                design_uuid: designUuid,
                kind: file.kind,
                filename: file.filename,
                content_type: file.contentType,
                size_bytes: file.sizeBytes,
                created_by_user_uuid: createdByUserUuid,
            }));
            const insertedFiles =
                fileRows.length === 0
                    ? []
                    : await trx(OrganizationDesignFilesTableName)
                          .insert(fileRows)
                          .returning('*');

            const [updated] = await trx(OrganizationDesignsTableName)
                .where('design_uuid', designUuid)
                .update({
                    name: data.name,
                    description: data.description,
                    extra_instructions: data.extraInstructions,
                    updated_at: trx.fn.now() as unknown as Date,
                })
                .returning('*');

            return {
                design: mapDbDesign(updated, insertedFiles),
                removedFiles: removedRows.map(mapDbFile),
            };
        });
    }
}
