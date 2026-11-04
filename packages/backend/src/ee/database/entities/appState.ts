import { Knex } from 'knex';

export const AppUserStateTableName = 'app_user_state';
export const AppSharedStateTableName = 'app_shared_state';
export const AppSharedStateHistoryTableName = 'app_shared_state_history';

export type AppStateHistoryAuthorKind = 'user' | 'agent';

export type DbAppUserState = {
    app_user_state_uuid: string;
    app_uuid: string;
    user_uuid: string;
    key: string;
    value: unknown;
    created_at: Date;
    updated_at: Date;
};

export type DbAppSharedState = {
    app_shared_state_uuid: string;
    app_uuid: string;
    key: string;
    value: unknown;
    version: number;
    updated_by_user_uuid: string | null;
    created_at: Date;
    updated_at: Date;
};

export type DbAppSharedStateHistory = {
    app_shared_state_history_uuid: string;
    app_uuid: string;
    key: string;
    version: number;
    value: unknown;
    author_kind: AppStateHistoryAuthorKind;
    author_user_uuid: string | null;
    created_at: Date;
};

// Values are inserted pre-serialized: node-postgres would turn a JS array
// into a Postgres array literal instead of JSON.
export type AppUserStateTable = Knex.CompositeTableType<
    DbAppUserState,
    Pick<DbAppUserState, 'app_uuid' | 'user_uuid' | 'key'> & {
        value: string;
    },
    Partial<{ value: string; updated_at: Date }>
>;

export type AppSharedStateTable = Knex.CompositeTableType<
    DbAppSharedState,
    Pick<
        DbAppSharedState,
        'app_uuid' | 'key' | 'version' | 'updated_by_user_uuid'
    > & { value: string },
    Partial<{
        value: string;
        version: number;
        updated_by_user_uuid: string | null;
        updated_at: Date;
    }>
>;

export type AppSharedStateHistoryTable = Knex.CompositeTableType<
    DbAppSharedStateHistory,
    Pick<
        DbAppSharedStateHistory,
        'app_uuid' | 'key' | 'version' | 'author_kind' | 'author_user_uuid'
    > & { value: string },
    never
>;
