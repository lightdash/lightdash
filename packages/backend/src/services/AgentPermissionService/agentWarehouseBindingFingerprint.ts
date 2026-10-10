import { NotFoundError, ProjectType } from '@lightdash/common';
import { type Knex } from 'knex';
import { createHash } from 'node:crypto';

type ProjectBindingMetadata = {
    project_uuid: string;
    organization_uuid: string;
    project_type: ProjectType;
    copied_from_project_uuid: string | null;
};

const canonicalize = (value: unknown): unknown => {
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value))
        return value
            .map(canonicalize)
            .sort((left, right) =>
                JSON.stringify(left).localeCompare(JSON.stringify(right)),
            );
    if (typeof value === 'object' && value !== null)
        return Object.fromEntries(
            Object.entries(value)
                .sort(([left], [right]) => left.localeCompare(right))
                .map(([key, entry]) => [key, canonicalize(entry)]),
        );
    return value;
};

export class AgentWarehouseBindingFingerprint {
    constructor(private readonly dependencies: { database: Knex }) {}

    private metadata(table: string, columns: string[]) {
        const { database } = this.dependencies;
        return database(table).select(
            ...columns.map((column) => `${table}.${column}`),
            database.raw('??.xmin::text as row_version', [table]),
        );
    }

    private projectMetadata(projectUuid: string) {
        return this.metadata('projects', [
            'project_uuid',
            'project_type',
            'copied_from_project_uuid',
            'organization_warehouse_credentials_uuid',
            'connection_mode',
        ])
            .innerJoin(
                'organizations',
                'organizations.organization_id',
                'projects.organization_id',
            )
            .select('organizations.organization_uuid')
            .where('projects.project_uuid', projectUuid);
    }

    async get(projectUuid: string): Promise<string> {
        const { database } = this.dependencies;
        const project =
            await this.projectMetadata(
                projectUuid,
            ).first<ProjectBindingMetadata>();
        if (!project) throw new NotFoundError('Project not found');
        const parentUuid = project.copied_from_project_uuid;
        const parent =
            project.project_type === ProjectType.PREVIEW &&
            parentUuid !== null &&
            parentUuid !== projectUuid
                ? await this.projectMetadata(parentUuid)
                      .where(
                          'organizations.organization_uuid',
                          project.organization_uuid,
                      )
                      .first<ProjectBindingMetadata>()
                : undefined;
        const projectUuids = parent
            ? [projectUuid, parent.project_uuid]
            : [projectUuid];
        const projectIds = database('projects')
            .select('project_id')
            .whereIn('project_uuid', projectUuids);
        const connectionUuids = database('warehouse_connections')
            .select('warehouse_connection_uuid')
            .whereIn('project_uuid', projectUuids);
        const organizationCredentialUuids = database('projects')
            .select('organization_warehouse_credentials_uuid')
            .whereIn('project_uuid', projectUuids)
            .union(
                database('warehouse_connections')
                    .select('organization_warehouse_credentials_uuid')
                    .whereIn('project_uuid', projectUuids),
            );
        const memberUuids = database('users')
            .select('users.user_uuid')
            .innerJoin(
                'organization_memberships',
                'organization_memberships.user_id',
                'users.user_id',
            )
            .innerJoin(
                'organizations',
                'organizations.organization_id',
                'organization_memberships.organization_id',
            )
            .where(
                'organizations.organization_uuid',
                project.organization_uuid,
            );
        const credentialUuids = database('credentials')
            .select('credential_uuid')
            .where('organization_uuid', project.organization_uuid)
            .whereIn('purpose', [
                'shared_login',
                'ai_service_account',
                'personal_sign_in',
                'agent_sign_in',
                'agent_oauth_client',
            ])
            .where((query) =>
                query
                    .whereIn('owner_project_uuid', projectUuids)
                    .orWhereNull('owner_project_uuid'),
            );
        const reads = {
            dbtSources: this.metadata('project_dbt_sources', [
                'project_dbt_source_uuid',
                'project_uuid',
                'warehouse_connection_uuid',
                'warehouse_database',
                'warehouse_schema',
                'updated_at',
            ]).whereIn('project_uuid', projectUuids),
            exploreRouting: database('cached_explore')
                .select('project_uuid', 'name', 'warehouse_connection_uuid')
                .whereIn('project_uuid', projectUuids),
            credentialTokenVersions: this.metadata('credential_token_state', [
                'credential_uuid',
                'version',
                'updated_at',
            ]).whereIn('credential_uuid', credentialUuids),
            warehouseCredentials: this.metadata('warehouse_credentials', [
                'warehouse_credentials_id',
                'project_id',
                'warehouse_type',
                'credential_subject_user_uuid',
                'preview_owns_credentials',
            ]).whereIn('project_id', projectIds),
            warehouseConnections: this.metadata('warehouse_connections', [
                'warehouse_connection_uuid',
                'project_uuid',
                'is_original',
                'name',
                'warehouse_type',
                'organization_warehouse_credentials_uuid',
                'updated_at',
            ]).whereIn('project_uuid', projectUuids),
            organizationCredentials: this.metadata(
                'organization_warehouse_credentials',
                ['organization_warehouse_credentials_uuid', 'warehouse_type'],
            ).whereIn(
                'organization_warehouse_credentials_uuid',
                organizationCredentialUuids,
            ),
            serviceAccountSlots: this.metadata(
                'ai_service_account_credentials',
                [
                    'ai_service_account_credential_uuid',
                    'identity_uuid',
                    'project_uuid',
                    'warehouse_connection_uuid',
                    'warehouse_type',
                    'authentication_method',
                    'updated_at',
                ],
            ).whereIn('project_uuid', projectUuids),
            identityRules: this.metadata('organization_agent_identity_rules', [
                'warehouse_type',
                'actor_kind',
                'source',
                'updated_at',
            ]).where('organization_uuid', project.organization_uuid),
            legacyIdentityRule: this.metadata(
                'organization_agent_identity_settings',
                ['require_verified_agent_sessions', 'updated_at'],
            ).where('organization_uuid', project.organization_uuid),
            snowflakeClients: this.metadata(
                'organization_snowflake_agent_clients',
                [
                    'organization_snowflake_agent_client_uuid',
                    'client_version',
                    'updated_at',
                ],
            ).where('organization_uuid', project.organization_uuid),
            personCredentials: this.metadata('user_warehouse_credentials', [
                'user_warehouse_credentials_uuid',
                'user_uuid',
                'project_uuid',
                'warehouse_type',
                'purpose',
                'updated_at',
            ])
                .whereIn('user_uuid', memberUuids)
                .where((query) =>
                    query
                        .whereIn('project_uuid', projectUuids)
                        .orWhereNull('project_uuid'),
                ),
            projectPreferences: this.metadata(
                'project_user_warehouse_credentials_preference',
                [
                    'project_uuid',
                    'user_uuid',
                    'user_warehouse_credentials_uuid',
                ],
            ).whereIn('project_uuid', projectUuids),
            connectionPreferences: this.metadata(
                'warehouse_connection_user_credentials_preference',
                [
                    'warehouse_connection_uuid',
                    'user_uuid',
                    'user_warehouse_credentials_uuid',
                ],
            ).whereIn('warehouse_connection_uuid', connectionUuids),
            credentialBindings: this.metadata('credential_bindings', [
                'credential_binding_uuid',
                'project_uuid',
                'warehouse_connection_uuid',
                'slot',
                'user_uuid',
                'credential_uuid',
            ]).whereIn('project_uuid', projectUuids),
            credentialGenerations: this.metadata('credentials', [
                'credential_uuid',
                'owner_project_uuid',
                'owner_warehouse_connection_uuid',
                'purpose',
                'generation',
                'updated_at',
            ]).whereIn('credential_uuid', credentialUuids),
        };
        const metadata = Object.fromEntries(
            await Promise.all(
                Object.entries(reads).map(async ([key, query]) => [
                    key,
                    await query,
                ]),
            ),
        );
        return createHash('sha256')
            .update(
                JSON.stringify(
                    canonicalize({
                        version: 1,
                        projectUuid,
                        projects: parent ? [project, parent] : [project],
                        ...metadata,
                    }),
                ),
            )
            .digest('hex');
    }
}
