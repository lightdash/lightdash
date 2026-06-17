import {
    EXTERNAL_CONNECTION_DEFAULTS,
    NotFoundError,
    type CreateExternalConnection,
    type ExternalConnection,
    type UpdateExternalConnection,
} from '@lightdash/common';
import { type Knex } from 'knex';
import { AppsTableName } from '../../database/entities/apps';
import { EncryptionUtil } from '../../utils/EncryptionUtil/EncryptionUtil';
import {
    AppExternalConnectionsTableName,
    ExternalConnectionRateCountersTableName,
    ExternalConnectionSecretsTableName,
    ExternalConnectionsTableName,
    type DbExternalConnection,
} from '../database/entities/externalConnections';

type ExternalConnectionModelArguments = {
    database: Knex;
    encryptionUtil: EncryptionUtil;
};

type DbApp = {
    app_id: string;
    project_uuid: string;
    space_uuid: string | null;
    created_by_user_uuid: string;
    organization_uuid: string;
};

/**
 * Owns all DB access for external connections, their secrets (kept in a
 * separate table and never returned in the read shape), app↔connection
 * links, and the per-minute rate counters consumed by the M2 proxy.
 */
export class ExternalConnectionModel {
    private readonly database: Knex;

    private readonly encryptionUtil: EncryptionUtil;

    constructor(args: ExternalConnectionModelArguments) {
        this.database = args.database;
        this.encryptionUtil = args.encryptionUtil;
    }

    // eslint-disable-next-line class-methods-use-this
    private static mapToExternalConnection(
        row: DbExternalConnection,
        hasSecret: boolean,
    ): ExternalConnection {
        return {
            externalConnectionUuid: row.external_connection_uuid,
            projectUuid: row.project_uuid,
            organizationUuid: row.organization_uuid,
            name: row.name,
            type: row.type,
            origin: row.origin,
            allowedPathPrefixes: row.allowed_path_prefixes,
            allowedMethods: row.allowed_methods,
            allowedContentTypes: row.allowed_content_types,
            responseMaxBytes: row.response_max_bytes,
            requestMaxBytes: row.request_max_bytes,
            timeoutMs: row.timeout_ms,
            rateLimitPerMinute: row.rate_limit_per_minute,
            apiKeyName: row.api_key_name,
            apiKeyLocation: row.api_key_location,
            hasSecret,
            createdByUserUuid: row.created_by_user_uuid,
            updatedByUserUuid: row.updated_by_user_uuid,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };
    }

    async create(
        projectUuid: string,
        organizationUuid: string,
        userUuid: string,
        data: CreateExternalConnection,
    ): Promise<ExternalConnection> {
        return this.database.transaction(async (trx) => {
            const [row] = await trx(ExternalConnectionsTableName)
                .insert({
                    project_uuid: projectUuid,
                    organization_uuid: organizationUuid,
                    name: data.name,
                    type: data.type,
                    origin: data.origin,
                    allowed_path_prefixes: data.allowedPathPrefixes,
                    allowed_methods: data.allowedMethods,
                    allowed_content_types: data.allowedContentTypes,
                    response_max_bytes:
                        data.responseMaxBytes ??
                        EXTERNAL_CONNECTION_DEFAULTS.responseMaxBytes,
                    request_max_bytes:
                        data.requestMaxBytes ??
                        EXTERNAL_CONNECTION_DEFAULTS.requestMaxBytes,
                    timeout_ms:
                        data.timeoutMs ??
                        EXTERNAL_CONNECTION_DEFAULTS.timeoutMs,
                    rate_limit_per_minute: data.rateLimitPerMinute ?? null,
                    api_key_name: data.apiKeyName ?? null,
                    api_key_location: data.apiKeyLocation ?? null,
                    created_by_user_uuid: userUuid,
                    updated_by_user_uuid: userUuid,
                })
                .returning('*');

            const secret = data.secret ?? null;
            if (secret) {
                await trx(ExternalConnectionSecretsTableName).insert({
                    external_connection_uuid: row.external_connection_uuid,
                    encrypted_payload: this.encryptionUtil.encrypt(secret),
                });
            }

            return ExternalConnectionModel.mapToExternalConnection(
                row,
                Boolean(secret),
            );
        });
    }

    async list(projectUuid: string): Promise<ExternalConnection[]> {
        const rows = await this.database(ExternalConnectionsTableName)
            .leftJoin(
                ExternalConnectionSecretsTableName,
                `${ExternalConnectionSecretsTableName}.external_connection_uuid`,
                `${ExternalConnectionsTableName}.external_connection_uuid`,
            )
            .where(`${ExternalConnectionsTableName}.project_uuid`, projectUuid)
            .whereNull(`${ExternalConnectionsTableName}.deleted_at`)
            .orderBy(`${ExternalConnectionsTableName}.created_at`, 'desc')
            .select<
                Array<
                    DbExternalConnection & { encrypted_payload: Buffer | null }
                >
            >(
                `${ExternalConnectionsTableName}.*`,
                `${ExternalConnectionSecretsTableName}.encrypted_payload`,
            );

        return rows.map((row) =>
            ExternalConnectionModel.mapToExternalConnection(
                row,
                row.encrypted_payload !== null,
            ),
        );
    }

    /** Strips the secret — returns the READ shape only. */
    async findByUuid(uuid: string): Promise<ExternalConnection | undefined> {
        const row = await this.database(ExternalConnectionsTableName)
            .leftJoin(
                ExternalConnectionSecretsTableName,
                `${ExternalConnectionSecretsTableName}.external_connection_uuid`,
                `${ExternalConnectionsTableName}.external_connection_uuid`,
            )
            .where(
                `${ExternalConnectionsTableName}.external_connection_uuid`,
                uuid,
            )
            .whereNull(`${ExternalConnectionsTableName}.deleted_at`)
            .first<
                | (DbExternalConnection & { encrypted_payload: Buffer | null })
                | undefined
            >(
                `${ExternalConnectionsTableName}.*`,
                `${ExternalConnectionSecretsTableName}.encrypted_payload`,
            );

        if (!row) {
            return undefined;
        }
        return ExternalConnectionModel.mapToExternalConnection(
            row,
            row.encrypted_payload !== null,
        );
    }

    /**
     * INTERNAL ONLY — returns the decrypted secret. Used by the M2 proxy
     * (`ExternalConnectionService.proxyFetch`). Never exposed via the API.
     */
    async getDecryptedSecret(uuid: string): Promise<string | null> {
        const row = await this.database(ExternalConnectionSecretsTableName)
            .where('external_connection_uuid', uuid)
            .first();
        if (!row) {
            return null;
        }
        return this.encryptionUtil.decrypt(row.encrypted_payload);
    }

    async update(
        uuid: string,
        userUuid: string,
        data: UpdateExternalConnection,
    ): Promise<ExternalConnection> {
        await this.database.transaction(async (trx) => {
            const existing = await trx(ExternalConnectionsTableName)
                .where('external_connection_uuid', uuid)
                .whereNull('deleted_at')
                .first();
            if (!existing) {
                throw new NotFoundError('External connection not found');
            }

            const updatePayload: Record<string, unknown> = {
                updated_by_user_uuid: userUuid,
                updated_at: trx.fn.now() as unknown as Date,
            };
            if (data.name !== undefined) updatePayload.name = data.name;
            if (data.type !== undefined) updatePayload.type = data.type;
            if (data.origin !== undefined) updatePayload.origin = data.origin;
            if (data.allowedPathPrefixes !== undefined)
                updatePayload.allowed_path_prefixes = data.allowedPathPrefixes;
            if (data.allowedMethods !== undefined)
                updatePayload.allowed_methods = data.allowedMethods;
            if (data.allowedContentTypes !== undefined)
                updatePayload.allowed_content_types = data.allowedContentTypes;
            if (data.responseMaxBytes !== undefined)
                updatePayload.response_max_bytes = data.responseMaxBytes;
            if (data.requestMaxBytes !== undefined)
                updatePayload.request_max_bytes = data.requestMaxBytes;
            if (data.timeoutMs !== undefined)
                updatePayload.timeout_ms = data.timeoutMs;
            if (data.rateLimitPerMinute !== undefined)
                updatePayload.rate_limit_per_minute = data.rateLimitPerMinute;
            if (data.apiKeyName !== undefined)
                updatePayload.api_key_name = data.apiKeyName;
            if (data.apiKeyLocation !== undefined)
                updatePayload.api_key_location = data.apiKeyLocation;

            await trx(ExternalConnectionsTableName)
                .where('external_connection_uuid', uuid)
                .update(updatePayload);

            // Blank / omitted secret = leave the stored secret unchanged.
            if (data.secret !== undefined && data.secret) {
                await ExternalConnectionModel.upsertSecret(
                    trx,
                    uuid,
                    this.encryptionUtil.encrypt(data.secret),
                );
            }
        });

        const updated = await this.findByUuid(uuid);
        if (!updated) {
            throw new NotFoundError('External connection not found');
        }
        return updated;
    }

    async softDelete(uuid: string): Promise<void> {
        const count = await this.database(ExternalConnectionsTableName)
            .where('external_connection_uuid', uuid)
            .whereNull('deleted_at')
            .update({ deleted_at: this.database.fn.now() as unknown as Date });
        if (count === 0) {
            throw new NotFoundError('External connection not found');
        }
    }

    async rotateSecret(uuid: string, secret: string): Promise<void> {
        await ExternalConnectionModel.upsertSecret(
            this.database,
            uuid,
            this.encryptionUtil.encrypt(secret),
            true,
        );
    }

    private static async upsertSecret(
        db: Knex,
        uuid: string,
        encryptedPayload: Buffer,
        markRotated = false,
    ): Promise<void> {
        await db(ExternalConnectionSecretsTableName)
            .insert({
                external_connection_uuid: uuid,
                encrypted_payload: encryptedPayload,
                ...(markRotated ? { rotated_at: db.fn.now() } : {}),
            })
            .onConflict('external_connection_uuid')
            .merge({
                encrypted_payload: encryptedPayload,
                ...(markRotated ? { rotated_at: db.fn.now() } : {}),
            });
    }

    async linkToApp(
        appId: string,
        externalConnectionUuid: string,
        alias: string,
    ): Promise<void> {
        await this.database(AppExternalConnectionsTableName).insert({
            app_id: appId,
            external_connection_uuid: externalConnectionUuid,
            alias,
        });
    }

    async unlinkFromApp(appId: string, alias: string): Promise<void> {
        const count = await this.database(AppExternalConnectionsTableName)
            .where('app_id', appId)
            .where('alias', alias)
            .delete();
        if (count === 0) {
            throw new NotFoundError('App external connection link not found');
        }
    }

    async listAppLinks(
        appId: string,
    ): Promise<Array<{ alias: string; connection: ExternalConnection }>> {
        const rows = await this.database(AppExternalConnectionsTableName)
            .innerJoin(
                ExternalConnectionsTableName,
                `${ExternalConnectionsTableName}.external_connection_uuid`,
                `${AppExternalConnectionsTableName}.external_connection_uuid`,
            )
            .leftJoin(
                ExternalConnectionSecretsTableName,
                `${ExternalConnectionSecretsTableName}.external_connection_uuid`,
                `${ExternalConnectionsTableName}.external_connection_uuid`,
            )
            .where(`${AppExternalConnectionsTableName}.app_id`, appId)
            .whereNull(`${ExternalConnectionsTableName}.deleted_at`)
            .select<
                Array<
                    DbExternalConnection & {
                        alias: string;
                        encrypted_payload: Buffer | null;
                    }
                >
            >(
                `${ExternalConnectionsTableName}.*`,
                `${AppExternalConnectionsTableName}.alias`,
                `${ExternalConnectionSecretsTableName}.encrypted_payload`,
            );

        return rows.map((row) => ({
            alias: row.alias,
            connection: ExternalConnectionModel.mapToExternalConnection(
                row,
                row.encrypted_payload !== null,
            ),
        }));
    }

    /** Returns the connection if it is linked to the app under `alias` and not soft-deleted. */
    async resolveAppAlias(
        appId: string,
        alias: string,
    ): Promise<ExternalConnection | undefined> {
        const row = await this.database(AppExternalConnectionsTableName)
            .innerJoin(
                ExternalConnectionsTableName,
                `${ExternalConnectionsTableName}.external_connection_uuid`,
                `${AppExternalConnectionsTableName}.external_connection_uuid`,
            )
            .leftJoin(
                ExternalConnectionSecretsTableName,
                `${ExternalConnectionSecretsTableName}.external_connection_uuid`,
                `${ExternalConnectionsTableName}.external_connection_uuid`,
            )
            .where(`${AppExternalConnectionsTableName}.app_id`, appId)
            .where(`${AppExternalConnectionsTableName}.alias`, alias)
            .whereNull(`${ExternalConnectionsTableName}.deleted_at`)
            .first<
                | (DbExternalConnection & { encrypted_payload: Buffer | null })
                | undefined
            >(
                `${ExternalConnectionsTableName}.*`,
                `${ExternalConnectionSecretsTableName}.encrypted_payload`,
            );

        if (!row) {
            return undefined;
        }
        return ExternalConnectionModel.mapToExternalConnection(
            row,
            row.encrypted_payload !== null,
        );
    }

    /**
     * Looks up an app with its organization UUID for use in assertCanManageApp.
     * Returns undefined if the app is not found or soft-deleted.
     */
    async findApp(appUuid: string): Promise<DbApp | undefined> {
        return this.database(AppsTableName)
            .innerJoin(
                'projects',
                'projects.project_uuid',
                `${AppsTableName}.project_uuid`,
            )
            .innerJoin(
                'organizations',
                'organizations.organization_id',
                'projects.organization_id',
            )
            .where(`${AppsTableName}.app_id`, appUuid)
            .whereNull(`${AppsTableName}.deleted_at`)
            .first<DbApp | undefined>(
                `${AppsTableName}.app_id`,
                `${AppsTableName}.project_uuid`,
                `${AppsTableName}.space_uuid`,
                `${AppsTableName}.created_by_user_uuid`,
                'organizations.organization_uuid',
            );
    }

    /**
     * Atomically bumps the per-(connection, app, window) counter and returns
     * the new count. Consumed by the M2 proxy's rate limiter.
     */
    async incrementRateCounter(
        externalConnectionUuid: string,
        appId: string,
        windowStartedAt: Date,
    ): Promise<number> {
        const [row] = await this.database(
            ExternalConnectionRateCountersTableName,
        )
            .insert({
                external_connection_uuid: externalConnectionUuid,
                app_id: appId,
                window_started_at: windowStartedAt,
                request_count: 1,
            })
            .onConflict([
                'external_connection_uuid',
                'app_id',
                'window_started_at',
            ])
            .merge({
                request_count: this.database.raw(
                    `${ExternalConnectionRateCountersTableName}.request_count + 1`,
                ) as unknown as number,
            })
            .returning('request_count');

        return row.request_count;
    }
}
