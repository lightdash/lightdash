import {
    APP_STATE_MAX_HISTORY_VERSIONS,
    type AppStateHistoryEntry,
    type AppStateSharedEntry,
    type AppStateSnapshot,
    type AppStateUserEntry,
} from '@lightdash/common';
import { type Knex } from 'knex';
import { UserTableName } from '../../database/entities/users';
import {
    AppSharedStateHistoryTableName,
    AppSharedStateTableName,
    AppUserStateTableName,
    type AppStateHistoryAuthorKind,
    type DbAppSharedState,
    type DbAppSharedStateHistory,
    type DbAppUserState,
} from '../database/entities/appState';

type AppStateModelArguments = {
    database: Knex;
};

type AuthorNameColumns = {
    author_first_name: string | null;
    author_last_name: string | null;
};

export type AppStateWriter =
    | { kind: 'user'; userUuid: string }
    | { kind: 'agent' };

export type UpsertUserStateResult =
    | { outcome: 'written'; entry: AppStateUserEntry }
    | { outcome: 'over_cap' };

export type UpsertSharedStateResult =
    | { outcome: 'written'; entry: AppStateSharedEntry }
    | { outcome: 'conflict'; current: AppStateSharedEntry | null }
    | { outcome: 'over_cap' };

const formatName = (
    firstName: string | null,
    lastName: string | null,
): string | null => {
    const name = [firstName, lastName].filter(Boolean).join(' ').trim();
    return name.length > 0 ? name : null;
};

export class AppStateModel {
    private readonly database: Knex;

    constructor(args: AppStateModelArguments) {
        this.database = args.database;
    }

    private static toUserEntry(row: DbAppUserState): AppStateUserEntry {
        return {
            value: row.value,
            updatedAt: row.updated_at.toISOString(),
        };
    }

    private static toSharedEntry(
        row: DbAppSharedState & AuthorNameColumns,
    ): AppStateSharedEntry {
        return {
            value: row.value,
            version: row.version,
            updatedAt: row.updated_at.toISOString(),
            updatedBy: row.updated_by_user_uuid
                ? {
                      userUuid: row.updated_by_user_uuid,
                      name: formatName(
                          row.author_first_name,
                          row.author_last_name,
                      ),
                  }
                : null,
        };
    }

    private static toHistoryEntry(
        row: DbAppSharedStateHistory & AuthorNameColumns,
    ): AppStateHistoryEntry {
        return {
            version: row.version,
            value: row.value,
            createdAt: row.created_at.toISOString(),
            author:
                row.author_kind === 'agent'
                    ? { kind: 'agent' }
                    : {
                          kind: 'user',
                          userUuid: row.author_user_uuid,
                          name: formatName(
                              row.author_first_name,
                              row.author_last_name,
                          ),
                      },
        };
    }

    /** Serializes writes within one scope for the rest of the transaction. */
    private static async lockScope(
        trx: Knex.Transaction,
        scope: string,
    ): Promise<void> {
        await trx.raw('SELECT pg_advisory_xact_lock(hashtext(?))', [scope]);
    }

    private sharedStateQuery(trx: Knex = this.database) {
        return trx(AppSharedStateTableName)
            .leftJoin(
                UserTableName,
                `${UserTableName}.user_uuid`,
                `${AppSharedStateTableName}.updated_by_user_uuid`,
            )
            .select<(DbAppSharedState & AuthorNameColumns)[]>(
                `${AppSharedStateTableName}.*`,
                `${UserTableName}.first_name as author_first_name`,
                `${UserTableName}.last_name as author_last_name`,
            );
    }

    async getSnapshot(
        appUuid: string,
        userUuid: string | null,
    ): Promise<AppStateSnapshot> {
        const [userRows, sharedRows] = await Promise.all([
            userUuid
                ? this.database(AppUserStateTableName)
                      .select<DbAppUserState[]>('*')
                      .where({ app_uuid: appUuid, user_uuid: userUuid })
                : Promise.resolve([] as DbAppUserState[]),
            this.sharedStateQuery().where(
                `${AppSharedStateTableName}.app_uuid`,
                appUuid,
            ),
        ]);
        return {
            user: Object.fromEntries(
                userRows.map((row) => [
                    row.key,
                    AppStateModel.toUserEntry(row),
                ]),
            ),
            shared: Object.fromEntries(
                sharedRows.map((row) => [
                    row.key,
                    AppStateModel.toSharedEntry(row),
                ]),
            ),
        };
    }

    async countUserKeys(appUuid: string, userUuid: string): Promise<number> {
        const [row] = await this.database(AppUserStateTableName)
            .where({ app_uuid: appUuid, user_uuid: userUuid })
            .count<{ count: string }[]>('* as count');
        return Number(row?.count ?? 0);
    }

    /**
     * Writes a per-user value. The per-scope key cap is checked inside the
     * transaction under an advisory lock, so concurrent creates cannot slip
     * past it together.
     */
    async upsertUserState(args: {
        appUuid: string;
        userUuid: string;
        key: string;
        value: unknown;
        maxKeys: number;
    }): Promise<UpsertUserStateResult> {
        const { appUuid, userUuid, key, value, maxKeys } = args;
        return this.database.transaction(async (trx) => {
            await AppStateModel.lockScope(trx, `user:${appUuid}:${userUuid}`);
            const existing = await trx(AppUserStateTableName)
                .select('app_user_state_uuid')
                .where({ app_uuid: appUuid, user_uuid: userUuid, key })
                .first();
            if (!existing) {
                const [count] = await trx(AppUserStateTableName)
                    .where({ app_uuid: appUuid, user_uuid: userUuid })
                    .count<{ count: string }[]>('* as count');
                if (Number(count?.count ?? 0) >= maxKeys) {
                    return { outcome: 'over_cap' };
                }
            }
            const [row] = await trx(AppUserStateTableName)
                .insert({
                    app_uuid: appUuid,
                    user_uuid: userUuid,
                    key,
                    value: JSON.stringify(value),
                })
                .onConflict(['app_uuid', 'user_uuid', 'key'])
                .merge({
                    value: JSON.stringify(value),
                    updated_at: new Date(),
                })
                .returning('*');
            return {
                outcome: 'written',
                entry: AppStateModel.toUserEntry(row),
            };
        });
    }

    async deleteUserState(
        appUuid: string,
        userUuid: string,
        key: string,
    ): Promise<void> {
        await this.database(AppUserStateTableName)
            .where({ app_uuid: appUuid, user_uuid: userUuid, key })
            .delete();
    }

    async countSharedKeys(appUuid: string): Promise<number> {
        const [row] = await this.database(AppSharedStateTableName)
            .where({ app_uuid: appUuid })
            .count<{ count: string }[]>('* as count');
        return Number(row?.count ?? 0);
    }

    async getSharedState(
        appUuid: string,
        key: string,
    ): Promise<AppStateSharedEntry | null> {
        const row = await this.sharedStateQuery()
            .where(`${AppSharedStateTableName}.app_uuid`, appUuid)
            .andWhere(`${AppSharedStateTableName}.key`, key)
            .first();
        return row ? AppStateModel.toSharedEntry(row) : null;
    }

    /**
     * Writes one version of a shared key. `expectedVersion: null` creates the
     * key; a number updates it only when that version is still current. The
     * history row is appended in the same transaction and old versions are
     * pruned past the retention cap.
     */
    async upsertSharedState(args: {
        appUuid: string;
        key: string;
        value: unknown;
        expectedVersion: number | null;
        writer: AppStateWriter;
        maxKeys: number;
    }): Promise<UpsertSharedStateResult> {
        const { appUuid, key, value, expectedVersion, writer, maxKeys } = args;
        const serialized = JSON.stringify(value);
        const authorKind: AppStateHistoryAuthorKind = writer.kind;
        const authorUserUuid = writer.kind === 'user' ? writer.userUuid : null;

        return this.database.transaction(async (trx) => {
            await AppStateModel.lockScope(trx, `shared:${appUuid}`);
            let written: DbAppSharedState | undefined;
            if (expectedVersion === null) {
                // A create for a key that exists is a conflict, not a cap hit.
                const existing = await trx(AppSharedStateTableName)
                    .where({ app_uuid: appUuid, key })
                    .first('app_shared_state_uuid');
                if (!existing) {
                    const [count] = await trx(AppSharedStateTableName)
                        .where({ app_uuid: appUuid })
                        .count<{ count: string }[]>('* as count');
                    if (Number(count?.count ?? 0) >= maxKeys) {
                        return { outcome: 'over_cap' };
                    }
                }
                // Versions never restart: a recreated key continues from its
                // retained history, so a writer holding a version from before
                // the delete still conflicts.
                const [last] = await trx(AppSharedStateHistoryTableName)
                    .where({ app_uuid: appUuid, key })
                    .max<{ max: number | null }[]>('version as max');
                const version = (last?.max ?? 0) + 1;
                // A unique violation would abort the transaction, so let the
                // insert be skipped instead and report the conflict below.
                [written] = await trx(AppSharedStateTableName)
                    .insert({
                        app_uuid: appUuid,
                        key,
                        value: serialized,
                        version,
                        updated_by_user_uuid: authorUserUuid,
                    })
                    .onConflict(['app_uuid', 'key'])
                    .ignore()
                    .returning('*');
            } else {
                [written] = await trx(AppSharedStateTableName)
                    .where({ app_uuid: appUuid, key, version: expectedVersion })
                    .update({
                        value: serialized,
                        version: expectedVersion + 1,
                        updated_by_user_uuid: authorUserUuid,
                        updated_at: new Date(),
                    })
                    .returning('*');
            }

            if (!written) {
                const current = await this.sharedStateQuery(trx)
                    .where(`${AppSharedStateTableName}.app_uuid`, appUuid)
                    .andWhere(`${AppSharedStateTableName}.key`, key)
                    .first();
                return {
                    outcome: 'conflict',
                    current: current
                        ? AppStateModel.toSharedEntry(current)
                        : null,
                };
            }

            await trx(AppSharedStateHistoryTableName).insert({
                app_uuid: appUuid,
                key,
                version: written.version,
                value: serialized,
                author_kind: authorKind,
                author_user_uuid: authorUserUuid,
            });
            await trx(AppSharedStateHistoryTableName)
                .where({ app_uuid: appUuid, key })
                .andWhere(
                    'version',
                    '<=',
                    written.version - APP_STATE_MAX_HISTORY_VERSIONS,
                )
                .delete();

            const [withAuthor] = await this.sharedStateQuery(trx).where(
                `${AppSharedStateTableName}.app_shared_state_uuid`,
                written.app_shared_state_uuid,
            );
            return {
                outcome: 'written',
                entry: AppStateModel.toSharedEntry(withAuthor),
            };
        });
    }

    /** Removes the current value. History stays, so versions keep counting. */
    async deleteSharedState(appUuid: string, key: string): Promise<void> {
        await this.database(AppSharedStateTableName)
            .where({ app_uuid: appUuid, key })
            .delete();
    }

    async getSharedHistory(
        appUuid: string,
        key: string,
        options: { limit: number; beforeVersion: number | null },
    ): Promise<AppStateHistoryEntry[]> {
        const query = this.database(AppSharedStateHistoryTableName)
            .leftJoin(
                UserTableName,
                `${UserTableName}.user_uuid`,
                `${AppSharedStateHistoryTableName}.author_user_uuid`,
            )
            .select<(DbAppSharedStateHistory & AuthorNameColumns)[]>(
                `${AppSharedStateHistoryTableName}.*`,
                `${UserTableName}.first_name as author_first_name`,
                `${UserTableName}.last_name as author_last_name`,
            )
            .where(`${AppSharedStateHistoryTableName}.app_uuid`, appUuid)
            .andWhere(`${AppSharedStateHistoryTableName}.key`, key)
            .orderBy(`${AppSharedStateHistoryTableName}.version`, 'desc')
            .limit(options.limit);
        if (options.beforeVersion !== null) {
            void query.andWhere(
                `${AppSharedStateHistoryTableName}.version`,
                '<',
                options.beforeVersion,
            );
        }
        const rows = await query;
        return rows.map(AppStateModel.toHistoryEntry);
    }
}
