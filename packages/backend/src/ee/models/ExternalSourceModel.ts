import {
    ExternalSourceStatus,
    NotFoundError,
    ParameterError,
    type ExternalSource,
    type ExternalSourceConnection,
    type ExternalSourceTable,
    type ExternalSourceType,
    type ResultColumns,
} from '@lightdash/common';
import { randomUUID } from 'crypto';
import { Knex } from 'knex';
import {
    ExternalSourceCredentialsTableName,
    ExternalSourceIngestAttemptsTableName,
    ExternalSourceObjectsTableName,
    ExternalSourcesTableName,
    ExternalSourceTablesTableName,
    type DbExternalSource,
    type DbExternalSourceIngestAttempt,
    type DbExternalSourceObject,
    type DbExternalSourceTable,
    type DbExternalSourceUpdate,
} from '../../database/entities/externalSources';
import { type PreAggregateDuckdbLocator } from '../../utils/duckdb/duckdbSqlTables';
import { type EncryptionUtil } from '../../utils/EncryptionUtil/EncryptionUtil';

type ExternalSourceModelArguments = {
    database: Knex;
    encryptionUtil: Pick<EncryptionUtil, 'encrypt' | 'decrypt'>;
};

export class ExternalSourceModel {
    private readonly database: Knex;

    private readonly encryptionUtil: Pick<
        EncryptionUtil,
        'encrypt' | 'decrypt'
    >;

    constructor(args: ExternalSourceModelArguments) {
        this.database = args.database;
        this.encryptionUtil = args.encryptionUtil;
    }

    /** API shape: the storage locator never leaves the backend. */
    private static mapTable(row: DbExternalSourceTable): ExternalSourceTable {
        return {
            tableUuid: row.external_source_table_uuid,
            sourceUuid: row.external_source_uuid,
            name: row.name,
            label: row.label,
            columns: row.columns,
            rowCount: row.row_count === null ? null : Number(row.row_count),
            totalBytes:
                row.total_bytes === null ? null : Number(row.total_bytes),
            version: row.version,
            lastIngestedAt: row.last_ingested_at,
        };
    }

    private static mapSource(
        row: DbExternalSource,
        tables: DbExternalSourceTable[],
    ): ExternalSource {
        return {
            sourceUuid: row.external_source_uuid,
            projectUuid: row.project_uuid,
            type: row.type,
            name: row.name,
            connection: row.connection,
            status: row.status,
            errorMessage: row.error_message,
            createdByUserUuid: row.created_by_user_uuid,
            lastRefreshedAt: row.last_refreshed_at,
            tables: tables.map(ExternalSourceModel.mapTable),
        };
    }

    async createSource(data: {
        projectUuid: string;
        type: ExternalSourceType;
        name: string;
        status: ExternalSourceStatus;
        connection: ExternalSourceConnection;
        createdByUserUuid: string;
    }): Promise<ExternalSource> {
        const [row] = await this.database(ExternalSourcesTableName)
            .insert({
                project_uuid: data.projectUuid,
                type: data.type,
                name: data.name,
                status: data.status,
                connection: data.connection,
                created_by_user_uuid: data.createdByUserUuid,
            })
            .returning('*');
        return ExternalSourceModel.mapSource(row, []);
    }

    private async getSourceRow(
        projectUuid: string,
        sourceUuid: string,
    ): Promise<DbExternalSource> {
        const row = await this.database(ExternalSourcesTableName)
            .where('project_uuid', projectUuid)
            .andWhere('external_source_uuid', sourceUuid)
            .first();
        if (!row) {
            throw new NotFoundError(
                `External source ${sourceUuid} not found in project`,
            );
        }
        return row;
    }

    private async getTableRows(
        sourceUuids: string[],
    ): Promise<DbExternalSourceTable[]> {
        if (sourceUuids.length === 0) return [];
        return this.database(ExternalSourceTablesTableName)
            .whereIn('external_source_uuid', sourceUuids)
            .orderBy('name');
    }

    async getSource(
        projectUuid: string,
        sourceUuid: string,
    ): Promise<ExternalSource> {
        const row = await this.getSourceRow(projectUuid, sourceUuid);
        const tables = await this.getTableRows([sourceUuid]);
        return ExternalSourceModel.mapSource(row, tables);
    }

    async listSources(projectUuid: string): Promise<ExternalSource[]> {
        const rows = await this.database(ExternalSourcesTableName)
            .where('project_uuid', projectUuid)
            .orderBy('name');
        const tables = await this.getTableRows(
            rows.map((row) => row.external_source_uuid),
        );
        const tablesBySource = tables.reduce<
            Record<string, DbExternalSourceTable[]>
        >((acc, table) => {
            acc[table.external_source_uuid] = [
                ...(acc[table.external_source_uuid] ?? []),
                table,
            ];
            return acc;
        }, {});
        return rows.map((row) =>
            ExternalSourceModel.mapSource(
                row,
                tablesBySource[row.external_source_uuid] ?? [],
            ),
        );
    }

    async findSourceByName(
        projectUuid: string,
        name: string,
    ): Promise<ExternalSource | undefined> {
        const row = await this.database(ExternalSourcesTableName)
            .where('project_uuid', projectUuid)
            .andWhere('name', name)
            .first();
        if (!row) return undefined;
        const tables = await this.getTableRows([row.external_source_uuid]);
        return ExternalSourceModel.mapSource(row, tables);
    }

    async updateSource(
        sourceUuid: string,
        update: DbExternalSourceUpdate,
    ): Promise<void> {
        await this.database(ExternalSourcesTableName)
            .where('external_source_uuid', sourceUuid)
            .update({ ...update, updated_at: new Date() });
    }

    async createTable(data: {
        sourceUuid: string;
        projectUuid: string;
        name: string;
        label: string;
    }): Promise<ExternalSourceTable> {
        const [row] = await this.database(ExternalSourceTablesTableName)
            .insert({
                external_source_uuid: data.sourceUuid,
                project_uuid: data.projectUuid,
                name: data.name,
                label: data.label,
            })
            .returning('*');
        return ExternalSourceModel.mapTable(row);
    }

    async upsertGoogleCredential(data: {
        sourceUuid: string;
        refreshToken: string;
        connectedByUserUuid: string;
    }): Promise<void> {
        await this.database(ExternalSourceCredentialsTableName)
            .insert({
                external_source_uuid: data.sourceUuid,
                provider: 'google',
                encrypted_refresh_token: this.encryptionUtil.encrypt(
                    data.refreshToken,
                ),
                connected_by_user_uuid: data.connectedByUserUuid,
            })
            .onConflict('external_source_uuid')
            .merge({
                encrypted_refresh_token: this.encryptionUtil.encrypt(
                    data.refreshToken,
                ),
                connected_by_user_uuid: data.connectedByUserUuid,
                updated_at: new Date(),
            });
    }

    async getGoogleCredential(sourceUuid: string): Promise<string> {
        const row = await this.database(ExternalSourceCredentialsTableName)
            .where('external_source_uuid', sourceUuid)
            .andWhere('provider', 'google')
            .first('encrypted_refresh_token');
        if (!row) {
            throw new ParameterError(
                'This Google Sheet needs to be reconnected',
            );
        }
        return this.encryptionUtil.decrypt(row.encrypted_refresh_token);
    }

    /**
     * Durable request boundary. Source state and the unique generation are
     * committed together; enqueueing may safely happen afterwards because a
     * sweeper can recover queued attempts.
     */
    async requestIngest(data: {
        organizationUuid: string;
        projectUuid: string;
        sourceUuid: string;
        tableUuid: string;
        requestedByUserUuid: string;
        targetVersion: number;
        rawObjectKey?: string;
    }): Promise<DbExternalSourceIngestAttempt> {
        return this.database.transaction(async (trx) => {
            const source = await trx(ExternalSourcesTableName)
                .where('external_source_uuid', data.sourceUuid)
                .andWhere('project_uuid', data.projectUuid)
                .forUpdate()
                .first();
            if (!source) {
                throw new NotFoundError('External source not found');
            }
            const table = await trx(ExternalSourceTablesTableName)
                .where('external_source_table_uuid', data.tableUuid)
                .andWhere('external_source_uuid', data.sourceUuid)
                .forUpdate()
                .first();
            if (!table) {
                throw new NotFoundError('External source table not found');
            }
            if (data.targetVersion !== table.version + 1) {
                throw new ParameterError(
                    `Expected ingest version ${table.version + 1}`,
                );
            }

            const [attempt] = await trx(ExternalSourceIngestAttemptsTableName)
                .insert({
                    organization_uuid: data.organizationUuid,
                    project_uuid: data.projectUuid,
                    external_source_uuid: data.sourceUuid,
                    external_source_table_uuid: data.tableUuid,
                    requested_by_user_uuid: data.requestedByUserUuid,
                    target_version: data.targetVersion,
                    status: 'queued',
                })
                .onConflict(['external_source_table_uuid', 'target_version'])
                .ignore()
                .returning('*');
            const durableAttempt =
                attempt ??
                (await trx(ExternalSourceIngestAttemptsTableName)
                    .where({
                        external_source_table_uuid: data.tableUuid,
                        target_version: data.targetVersion,
                    })
                    .first());
            if (!durableAttempt) {
                throw new Error('Failed to create external source attempt');
            }
            if (data.rawObjectKey) {
                await trx(ExternalSourceObjectsTableName)
                    .where('object_key', data.rawObjectKey)
                    .andWhere('external_source_uuid', data.sourceUuid)
                    .update({
                        external_source_ingest_attempt_uuid:
                            durableAttempt.external_source_ingest_attempt_uuid,
                        updated_at: new Date(),
                    });
            }
            await trx(ExternalSourcesTableName)
                .where('external_source_uuid', data.sourceUuid)
                .update({
                    status: ExternalSourceStatus.SYNCING,
                    error_message: null,
                    updated_at: new Date(),
                });
            return durableAttempt;
        });
    }

    async claimIngestAttempt(data: {
        attemptUuid: string;
        leaseMs: number;
        maxConcurrentPerOrganization: number;
    }): Promise<DbExternalSourceIngestAttempt | null> {
        return this.database.transaction(async (trx) => {
            const attempt = await trx(ExternalSourceIngestAttemptsTableName)
                .where('external_source_ingest_attempt_uuid', data.attemptUuid)
                .forUpdate()
                .first();
            if (
                !attempt ||
                ['succeeded', 'cancelled'].includes(attempt.status)
            ) {
                return null;
            }
            if (
                ['running', 'publishing', 'failed'].includes(attempt.status) &&
                attempt.lease_expires_at &&
                attempt.lease_expires_at > new Date()
            ) {
                return null;
            }

            await trx.raw('SELECT pg_advisory_xact_lock(hashtext(?))', [
                `external-source:${attempt.organization_uuid}`,
            ]);
            const [{ count }] = await trx(ExternalSourceIngestAttemptsTableName)
                .where('organization_uuid', attempt.organization_uuid)
                .whereIn('status', ['running', 'publishing', 'failed'])
                .where('lease_expires_at', '>', new Date())
                .whereNot(
                    'external_source_ingest_attempt_uuid',
                    data.attemptUuid,
                )
                .count<{ count: string }[]>('* as count');
            if (Number(count) >= data.maxConcurrentPerOrganization) {
                return null;
            }

            const [claimed] = await trx(ExternalSourceIngestAttemptsTableName)
                .where('external_source_ingest_attempt_uuid', data.attemptUuid)
                .update({
                    status: attempt.columns ? 'publishing' : 'running',
                    execution_uuid: randomUUID(),
                    lease_expires_at: new Date(Date.now() + data.leaseMs),
                    run_count: attempt.run_count + 1,
                    error_message: null,
                    updated_at: new Date(),
                })
                .returning('*');
            await trx(ExternalSourcesTableName)
                .where('external_source_uuid', attempt.external_source_uuid)
                .update({
                    status: ExternalSourceStatus.SYNCING,
                    error_message: null,
                    updated_at: new Date(),
                });
            return claimed;
        });
    }

    async recordIngestOutput(data: {
        attemptUuid: string;
        executionUuid: string;
        columns: ResultColumns;
        locator: PreAggregateDuckdbLocator;
        rowCount: number;
        totalBytes: number | null;
    }): Promise<boolean> {
        const updated = await this.database(
            ExternalSourceIngestAttemptsTableName,
        )
            .where('external_source_ingest_attempt_uuid', data.attemptUuid)
            .andWhere('execution_uuid', data.executionUuid)
            .andWhere('status', 'running')
            .update({
                status: 'publishing',
                columns: data.columns,
                locator: data.locator,
                row_count: data.rowCount,
                total_bytes: data.totalBytes,
                updated_at: new Date(),
            });
        return updated === 1;
    }

    async publishIngestAttempt(data: {
        attemptUuid: string;
        executionUuid: string;
    }): Promise<boolean> {
        return this.database.transaction(async (trx) => {
            const attempt = await trx(ExternalSourceIngestAttemptsTableName)
                .where('external_source_ingest_attempt_uuid', data.attemptUuid)
                .forUpdate()
                .first();
            if (!attempt || attempt.status === 'succeeded') return true;
            if (
                attempt.status !== 'publishing' ||
                attempt.execution_uuid !== data.executionUuid ||
                !attempt.columns ||
                !attempt.locator
            ) {
                return false;
            }
            const table = await trx(ExternalSourceTablesTableName)
                .where(
                    'external_source_table_uuid',
                    attempt.external_source_table_uuid,
                )
                .forUpdate()
                .first();
            if (!table || table.version > attempt.target_version) {
                return false;
            }
            if (table.version === attempt.target_version - 1) {
                await trx(ExternalSourceTablesTableName)
                    .where(
                        'external_source_table_uuid',
                        attempt.external_source_table_uuid,
                    )
                    .update({
                        columns: attempt.columns,
                        locator: attempt.locator,
                        row_count: attempt.row_count,
                        total_bytes: attempt.total_bytes,
                        version: attempt.target_version,
                        last_ingested_at: new Date(),
                        updated_at: new Date(),
                    });
            } else if (table.version !== attempt.target_version) {
                return false;
            }
            await trx(ExternalSourcesTableName)
                .where('external_source_uuid', attempt.external_source_uuid)
                .update({
                    status: ExternalSourceStatus.READY,
                    error_message: null,
                    last_refreshed_at: new Date(),
                    updated_at: new Date(),
                });
            await trx(ExternalSourceIngestAttemptsTableName)
                .where('external_source_ingest_attempt_uuid', data.attemptUuid)
                .update({
                    status: 'succeeded',
                    lease_expires_at: null,
                    finished_at: new Date(),
                    updated_at: new Date(),
                });

            const currentObjects = await trx(ExternalSourceObjectsTableName)
                .where('external_source_ingest_attempt_uuid', data.attemptUuid)
                .select('purpose');
            const purposes = [...new Set(currentObjects.map((v) => v.purpose))];
            if (purposes.length > 0) {
                await trx(ExternalSourceObjectsTableName)
                    .where('external_source_uuid', attempt.external_source_uuid)
                    .whereIn('purpose', purposes)
                    .whereNot(
                        'external_source_ingest_attempt_uuid',
                        data.attemptUuid,
                    )
                    .whereNot('status', 'deleted')
                    .update({
                        status: 'pending_delete',
                        delete_after: new Date(),
                        updated_at: new Date(),
                    });
                await trx(ExternalSourceObjectsTableName)
                    .where(
                        'external_source_ingest_attempt_uuid',
                        data.attemptUuid,
                    )
                    .update({
                        status: 'active',
                        delete_after: null,
                        updated_at: new Date(),
                    });
            }
            return true;
        });
    }

    async failIngestAttempt(
        attemptUuid: string,
        errorMessage: string,
        deferRetryUntilLeaseExpires = false,
    ): Promise<void> {
        await this.database.transaction(async (trx) => {
            const [attempt] = await trx(ExternalSourceIngestAttemptsTableName)
                .where('external_source_ingest_attempt_uuid', attemptUuid)
                .whereIn('status', ['queued', 'running', 'publishing'])
                .update({
                    status: 'failed',
                    lease_expires_at: deferRetryUntilLeaseExpires
                        ? undefined
                        : null,
                    error_message: errorMessage,
                    updated_at: new Date(),
                })
                .returning('*');
            if (attempt) {
                await trx(ExternalSourcesTableName)
                    .where('external_source_uuid', attempt.external_source_uuid)
                    .update({
                        status: ExternalSourceStatus.ERROR,
                        error_message: errorMessage,
                        updated_at: new Date(),
                    });
            }
        });
    }

    async getAttempt(
        attemptUuid: string,
    ): Promise<DbExternalSourceIngestAttempt | undefined> {
        return this.database(ExternalSourceIngestAttemptsTableName)
            .where('external_source_ingest_attempt_uuid', attemptUuid)
            .first();
    }

    async listRecoverableAttempts(limit: number) {
        return this.database(ExternalSourceIngestAttemptsTableName)
            .where('run_count', '<', 5)
            .andWhere((builder) =>
                builder
                    .where('status', 'queued')
                    .orWhere((failed) =>
                        failed
                            .where('status', 'failed')
                            .andWhere((lease) =>
                                lease
                                    .whereNull('lease_expires_at')
                                    .orWhere(
                                        'lease_expires_at',
                                        '<',
                                        new Date(),
                                    ),
                            ),
                    )
                    .orWhere((expired) =>
                        expired
                            .whereIn('status', ['running', 'publishing'])
                            .andWhere('lease_expires_at', '<', new Date()),
                    ),
            )
            .orderBy('updated_at')
            .limit(limit);
    }

    async registerObject(data: {
        organizationUuid: string;
        projectUuid: string;
        sourceUuid: string;
        attemptUuid?: string;
        key: string;
        purpose: 'raw' | 'parquet';
        expectedBytes?: number;
        maxOrganizationBytes: number;
    }): Promise<DbExternalSourceObject> {
        return this.database.transaction(async (trx) => {
            await trx.raw('SELECT pg_advisory_xact_lock(hashtext(?))', [
                `external-source-storage:${data.organizationUuid}`,
            ]);
            const [{ total }] = await trx(ExternalSourceObjectsTableName)
                .where('organization_uuid', data.organizationUuid)
                .whereNot('status', 'deleted')
                .sum<{ total: string | null }[]>('size_bytes as total');
            if (
                Number(total ?? 0) + (data.expectedBytes ?? 0) >
                data.maxOrganizationBytes
            ) {
                throw new ParameterError(
                    'External source storage quota exceeded for this organization',
                );
            }
            const [object] = await trx(ExternalSourceObjectsTableName)
                .insert({
                    organization_uuid: data.organizationUuid,
                    project_uuid: data.projectUuid,
                    external_source_uuid: data.sourceUuid,
                    external_source_ingest_attempt_uuid:
                        data.attemptUuid ?? null,
                    object_key: data.key,
                    purpose: data.purpose,
                    status: 'uploading',
                    size_bytes: data.expectedBytes ?? null,
                })
                .onConflict('object_key')
                .merge({
                    external_source_ingest_attempt_uuid:
                        data.attemptUuid ?? null,
                    status: 'uploading',
                    size_bytes: data.expectedBytes ?? null,
                    delete_after: null,
                    last_error: null,
                    updated_at: new Date(),
                })
                .returning('*');
            return object;
        });
    }

    async completeObject(
        key: string,
        sizeBytes: number,
        maxOrganizationBytes: number,
    ): Promise<void> {
        await this.database.transaction(async (trx) => {
            const object = await trx(ExternalSourceObjectsTableName)
                .where('object_key', key)
                .forUpdate()
                .first();
            if (!object)
                throw new NotFoundError('External source object missing');
            await trx.raw('SELECT pg_advisory_xact_lock(hashtext(?))', [
                `external-source-storage:${object.organization_uuid}`,
            ]);
            const [{ total }] = await trx(ExternalSourceObjectsTableName)
                .where('organization_uuid', object.organization_uuid)
                .whereNot('status', 'deleted')
                .whereNot(
                    'external_source_object_uuid',
                    object.external_source_object_uuid,
                )
                .sum<{ total: string | null }[]>('size_bytes as total');
            if (Number(total ?? 0) + sizeBytes > maxOrganizationBytes) {
                throw new ParameterError(
                    'External source storage quota exceeded for this organization',
                );
            }
            await trx(ExternalSourceObjectsTableName)
                .where('object_key', key)
                .update({
                    status: 'active',
                    size_bytes: sizeBytes,
                    updated_at: new Date(),
                });
        });
    }

    async abandonObject(key: string, error?: string): Promise<void> {
        await this.database(ExternalSourceObjectsTableName)
            .where('object_key', key)
            .whereNot('status', 'deleted')
            .update({
                status: 'pending_delete',
                delete_after: new Date(),
                last_error: error ?? null,
                updated_at: new Date(),
            });
    }

    async prepareSourceDeletion(sourceUuid: string): Promise<void> {
        await this.database(ExternalSourceObjectsTableName)
            .where('external_source_uuid', sourceUuid)
            .whereNot('status', 'deleted')
            .update({
                status: 'pending_delete',
                delete_after: new Date(),
                updated_at: new Date(),
            });
    }

    async prepareGarbageCollection(data: {
        stagedBefore: Date;
        uploadingBefore: Date;
        limit: number;
    }): Promise<DbExternalSourceObject[]> {
        await this.database.transaction(async (trx) => {
            await trx(ExternalSourceObjectsTableName)
                .whereNot('status', 'deleted')
                .whereNotExists(
                    trx
                        .select(trx.raw('1'))
                        .from(ExternalSourcesTableName)
                        .whereRaw(
                            'external_sources.external_source_uuid = external_source_objects.external_source_uuid',
                        ),
                )
                .update({
                    status: 'pending_delete',
                    delete_after: new Date(),
                    updated_at: new Date(),
                });
            const staleSources = await trx(ExternalSourcesTableName)
                .where('status', 'staged')
                .andWhere('created_at', '<', data.stagedBefore)
                .select('external_source_uuid');
            const sourceUuids = staleSources.map(
                (source) => source.external_source_uuid,
            );
            if (sourceUuids.length > 0) {
                await trx(ExternalSourceObjectsTableName)
                    .whereIn('external_source_uuid', sourceUuids)
                    .whereNot('status', 'deleted')
                    .update({
                        status: 'pending_delete',
                        delete_after: new Date(),
                        updated_at: new Date(),
                    });
                await trx(ExternalSourcesTableName)
                    .whereIn('external_source_uuid', sourceUuids)
                    .delete();
            }
            await trx(ExternalSourceObjectsTableName)
                .where('status', 'uploading')
                .andWhere('updated_at', '<', data.uploadingBefore)
                .update({
                    status: 'pending_delete',
                    delete_after: new Date(),
                    updated_at: new Date(),
                });
        });
        return this.database(ExternalSourceObjectsTableName)
            .where('status', 'pending_delete')
            .andWhere('delete_after', '<=', new Date())
            .orderBy('delete_after')
            .limit(data.limit);
    }

    async markObjectDeleted(objectUuid: string): Promise<void> {
        await this.database(ExternalSourceObjectsTableName)
            .where('external_source_object_uuid', objectUuid)
            .update({
                status: 'deleted',
                size_bytes: null,
                last_error: null,
                updated_at: new Date(),
            });
    }

    async markObjectDeleteFailed(
        objectUuid: string,
        error: string,
    ): Promise<void> {
        await this.database(ExternalSourceObjectsTableName)
            .where('external_source_object_uuid', objectUuid)
            .increment('delete_attempts', 1)
            .update({
                last_error: error,
                delete_after: new Date(Date.now() + 5 * 60 * 1000),
                updated_at: new Date(),
            });
    }

    /** Atomically swap a table to a freshly ingested file. */
    async updateTableIngest(
        tableUuid: string,
        data: {
            columns: ResultColumns;
            locator: PreAggregateDuckdbLocator;
            rowCount: number | null;
            totalBytes: number | null;
            ingestVersion: number;
        },
    ): Promise<boolean> {
        return this.database.transaction(async (trx) => {
            const row = await trx(ExternalSourceTablesTableName)
                .where('external_source_table_uuid', tableUuid)
                .forUpdate()
                .first();
            if (!row) {
                throw new NotFoundError(
                    `External source table ${tableUuid} not found`,
                );
            }
            if (row.version > data.ingestVersion) {
                return false;
            }
            if (row.version === data.ingestVersion) {
                return true;
            }
            if (row.version !== data.ingestVersion - 1) {
                throw new Error(
                    `Cannot publish external source ingest version ${data.ingestVersion} after version ${row.version}`,
                );
            }
            await trx(ExternalSourceTablesTableName)
                .where('external_source_table_uuid', tableUuid)
                .update({
                    columns: data.columns,
                    locator: data.locator,
                    row_count: data.rowCount,
                    total_bytes: data.totalBytes,
                    version: data.ingestVersion,
                    last_ingested_at: new Date(),
                    updated_at: new Date(),
                });
            return true;
        });
    }

    async updateTableLabel(tableUuid: string, label: string): Promise<void> {
        await this.database(ExternalSourceTablesTableName)
            .where('external_source_table_uuid', tableUuid)
            .update({ label, updated_at: new Date() });
    }

    async deleteSource(projectUuid: string, sourceUuid: string): Promise<void> {
        await this.database.transaction(async (trx) => {
            await trx(ExternalSourceObjectsTableName)
                .where('external_source_uuid', sourceUuid)
                .whereNot('status', 'deleted')
                .update({
                    status: 'pending_delete',
                    delete_after: new Date(),
                    updated_at: new Date(),
                });
            await trx(ExternalSourceIngestAttemptsTableName)
                .where('external_source_uuid', sourceUuid)
                .whereIn('status', [
                    'queued',
                    'running',
                    'publishing',
                    'failed',
                ])
                .update({
                    status: 'cancelled',
                    lease_expires_at: null,
                    finished_at: new Date(),
                    updated_at: new Date(),
                });
            await trx(ExternalSourcesTableName)
                .where('project_uuid', projectUuid)
                .andWhere('external_source_uuid', sourceUuid)
                .delete();
        });
    }

    /**
     * Backend-only shape for ingest and query execution: includes locators.
     */
    async getSourceRowsForIngest(projectUuid: string, sourceUuid: string) {
        const source = await this.getSourceRow(projectUuid, sourceUuid);
        const tables = await this.getTableRows([sourceUuid]);
        return { source, tables };
    }

    async findTableByUuid(
        projectUuid: string,
        tableUuid: string,
    ): Promise<DbExternalSourceTable | undefined> {
        return this.database(ExternalSourceTablesTableName)
            .where('project_uuid', projectUuid)
            .andWhere('external_source_table_uuid', tableUuid)
            .first();
    }

    async findTableForQuery(projectUuid: string, tableUuid: string) {
        const row = await this.database(ExternalSourceTablesTableName)
            .innerJoin(
                ExternalSourcesTableName,
                `${ExternalSourcesTableName}.external_source_uuid`,
                `${ExternalSourceTablesTableName}.external_source_uuid`,
            )
            .select(`${ExternalSourceTablesTableName}.*`)
            .select(
                `${ExternalSourcesTableName}.status as external_source_status`,
            )
            .where(`${ExternalSourceTablesTableName}.project_uuid`, projectUuid)
            .andWhere(`${ExternalSourcesTableName}.project_uuid`, projectUuid)
            .andWhere(
                `${ExternalSourceTablesTableName}.external_source_table_uuid`,
                tableUuid,
            )
            .first();
        return row as
            | (DbExternalSourceTable & {
                  external_source_status: ExternalSourceStatus;
              })
            | undefined;
    }
}
