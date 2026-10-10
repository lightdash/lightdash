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
        );
    }

    private projectMetadata(projectUuid: string) {
        return this.metadata('projects', [
            'project_uuid',
            'project_type',
            'copied_from_project_uuid',
            'organization_warehouse_credentials_uuid',
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
        const reads = {
            warehouseCredentials: this.metadata('warehouse_credentials', [
                'project_id',
                'warehouse_type',
                'credential_subject_user_uuid',
                'preview_owns_credentials',
            ]).whereIn('project_id', projectIds),
            warehouseConnections: this.metadata('warehouse_connections', [
                'warehouse_connection_uuid',
                'project_uuid',
                'warehouse_type',
                'organization_warehouse_credentials_uuid',
            ]).whereIn('project_uuid', projectUuids),
            serviceAccountSlots: this.metadata(
                'ai_service_account_credentials',
                [
                    'identity_uuid',
                    'project_uuid',
                    'warehouse_connection_uuid',
                    'warehouse_type',
                    'authentication_method',
                ],
            ).whereIn('project_uuid', projectUuids),
            identityRules: this.metadata('organization_agent_identity_rules', [
                'warehouse_type',
                'actor_kind',
                'source',
            ]).where('organization_uuid', project.organization_uuid),
            legacyIdentityRule: this.metadata(
                'organization_agent_identity_settings',
                ['require_verified_agent_sessions'],
            ).where('organization_uuid', project.organization_uuid),
            snowflakeClients: this.metadata(
                'organization_snowflake_agent_clients',
                ['organization_snowflake_agent_client_uuid', 'client_version'],
            ).where('organization_uuid', project.organization_uuid),
            credentialGenerations: this.metadata('credentials', [
                'credential_uuid',
                'generation',
            ])
                .where('organization_uuid', project.organization_uuid)
                .whereIn('purpose', [
                    'ai_service_account',
                    'agent_sign_in',
                    'agent_oauth_client',
                ])
                .where((query) =>
                    query
                        .whereIn('owner_project_uuid', projectUuids)
                        .orWhereNull('owner_project_uuid'),
                ),
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
                        version: 2,
                        projectUuid,
                        projects: parent ? [project, parent] : [project],
                        ...metadata,
                    }),
                ),
            )
            .digest('hex');
    }
}
