import {
    type AppVersionResources,
    type AppVersionStatus,
    type DataAppTemplate,
} from '@lightdash/common';
import { type Knex } from 'knex';

export {
    APP_VERSION_STAGE_ORDER,
    APP_VERSION_TERMINAL_STATUSES,
    isAppVersionInProgress,
    type AppVersionStatus,
} from '@lightdash/common';

export const AppsTableName = 'apps';
export const AppVersionsTableName = 'app_versions';

export type DbApp = {
    app_id: string;
    name: string;
    description: string;
    project_uuid: string;
    space_uuid: string | null;
    // Stable, registry-owned sandbox id (`sandbox_registry.sandbox_uuid`). Null
    // until the app's first generation creates a sandbox. The provider's own
    // container id changes every turn under persist+destroy, so this indirection
    // is what survives across turns. The column keeps its original name
    // `sandbox_id` for backwards compatibility — renaming it would break
    // in-flight old code during a deploy.
    sandbox_id: string | null;
    template: Exclude<DataAppTemplate, 'custom'> | null;
    design_uuid: string | null;
    // The production app this (preview) app was promoted into. Null until the
    // app is first promoted. Lives on the preview side so a single production
    // app can be the upstream of many preview apps.
    upstream_app_uuid: string | null;
    created_at: Date;
    created_by_user_uuid: string;
    deleted_at: Date | null;
    deleted_by_user_uuid: string | null;
    views_count: number;
    search_vector: string;
};

export type AppsTable = Knex.CompositeTableType<
    DbApp,
    Pick<DbApp, 'project_uuid' | 'created_by_user_uuid'> &
        Partial<
            Pick<
                DbApp,
                | 'app_id'
                | 'name'
                | 'description'
                | 'space_uuid'
                | 'sandbox_id'
                | 'template'
                | 'design_uuid'
                | 'upstream_app_uuid'
            >
        >,
    Partial<
        Pick<
            DbApp,
            | 'name'
            | 'description'
            | 'space_uuid'
            | 'sandbox_id'
            | 'design_uuid'
            | 'upstream_app_uuid'
            | 'deleted_at'
            | 'deleted_by_user_uuid'
            | 'views_count'
        >
    >
>;

export type DbAppVersion = {
    app_version_id: string;
    app_id: string;
    version: number;
    prompt: string;
    status: AppVersionStatus;
    error: string | null;
    status_message: string | null;
    status_updated_at: Date | null;
    resources: AppVersionResources | null;
    created_at: Date;
    created_by_user_uuid: string;
};

export type AppVersionsTable = Knex.CompositeTableType<
    DbAppVersion,
    Pick<
        DbAppVersion,
        'app_id' | 'version' | 'prompt' | 'status' | 'created_by_user_uuid'
    > &
        Partial<Pick<DbAppVersion, 'app_version_id' | 'resources'>>,
    Partial<
        Pick<
            DbAppVersion,
            'status' | 'error' | 'status_message' | 'status_updated_at'
        >
    >
>;
