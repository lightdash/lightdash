import { type Knex } from 'knex';

export const AppsTableName = 'apps';
export const AppVersionsTableName = 'app_versions';

export type DbApp = {
    app_id: string;
    name: string;
    description: string;
    project_uuid: string;
    space_uuid: string | null;
    sandbox_id: string | null;
    created_at: Date;
    created_by_user_uuid: string;
    deleted_at: Date | null;
    deleted_by_user_uuid: string | null;
};

export type AppsTable = Knex.CompositeTableType<
    DbApp,
    Pick<DbApp, 'project_uuid' | 'created_by_user_uuid'> &
        Partial<
            Pick<
                DbApp,
                'app_id' | 'name' | 'description' | 'space_uuid' | 'sandbox_id'
            >
        >,
    Partial<
        Pick<
            DbApp,
            | 'name'
            | 'description'
            | 'space_uuid'
            | 'sandbox_id'
            | 'deleted_at'
            | 'deleted_by_user_uuid'
        >
    >
>;

/**
 * Pipeline stages double as the version status. The frontend treats
 * anything other than 'ready' or 'error' as "in progress".
 */
export type AppVersionStatus =
    | 'pending'
    | 'sandbox'
    | 'catalog'
    | 'generating'
    | 'building'
    | 'packaging'
    | 'ready'
    | 'error';

export const isAppVersionInProgress = (status: AppVersionStatus): boolean =>
    status !== 'ready' && status !== 'error';

export type DbAppVersion = {
    app_version_id: string;
    app_id: string;
    version: number;
    prompt: string;
    status: AppVersionStatus;
    error: string | null;
    status_message: string | null;
    status_updated_at: Date | null;
    created_at: Date;
    created_by_user_uuid: string;
};

export type AppVersionsTable = Knex.CompositeTableType<
    DbAppVersion,
    Pick<
        DbAppVersion,
        'app_id' | 'version' | 'prompt' | 'status' | 'created_by_user_uuid'
    > &
        Partial<Pick<DbAppVersion, 'app_version_id'>>,
    Partial<
        Pick<
            DbAppVersion,
            'status' | 'error' | 'status_message' | 'status_updated_at'
        >
    >
>;
