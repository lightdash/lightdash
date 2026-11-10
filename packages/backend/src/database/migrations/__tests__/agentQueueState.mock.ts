import { type Knex } from 'knex';
import { randomUUID } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { validExplore } from '../../../services/ProjectService/ProjectService.mock';
import { AgentActionLogTableName } from '../../entities/agentActionLog';
import {
    AgentCapabilityPoliciesTableName,
    AgentSystemRoleCapabilitiesTableName,
} from '../../entities/agentCapabilityPolicies';
import { AgentConnectionApprovalRequestsTableName } from '../../entities/agentConnectionApprovalRequests';
import { AgentConnectionGrantsTableName } from '../../entities/agentConnectionGrants';
import { OrganizationAgentIdentityRulesTableName } from '../../entities/organizationAgentIdentityRules';
import { UserOAuthGrantsTableName } from '../../entities/userOAuthGrants';
import { type queueEvidenceFixture } from './agentQueueEvidence.mock';
import { postgresWarehouse } from './multiConnectionCompileFixtures';

const OAuthClientsTableName = 'oauth2_clients';
const OAuthAuthorizationCodesTableName = 'oauth2_authorization_codes';
const OAuthAccessTokensTableName = 'oauth2_access_tokens';
const OAuthRefreshTokensTableName = 'oauth2_refresh_tokens';

// Covers agent_connection_grants, agent_connection_approval_requests, agent_action_log,
// organization_agent_capability_policies, organization_agent_system_role_capabilities,
// organization_agent_identity_rules, user_oauth_grants, oauth2_clients,
// oauth2_authorization_codes, oauth2_access_tokens and oauth2_refresh_tokens.
const connectionTables = [
    AgentConnectionGrantsTableName,
    AgentConnectionApprovalRequestsTableName,
    AgentActionLogTableName,
    AgentCapabilityPoliciesTableName,
    AgentSystemRoleCapabilitiesTableName,
    OrganizationAgentIdentityRulesTableName,
    UserOAuthGrantsTableName,
    OAuthClientsTableName,
    OAuthAuthorizationCodesTableName,
    OAuthAccessTokensTableName,
    OAuthRefreshTokensTableName,
];
export const isConnectionStatement = (statement: string) =>
    connectionTables.some((table) =>
        new RegExp(`\\b${table}\\b`, 'i').test(statement),
    );

const protectedTables = [
    'cached_explore',
    'cached_explores',
    'cached_explore_staging',
    'project_parameters',
    'projects',
    'validations',
    'saved_queries',
    'saved_queries_versions',
    'saved_queries_version_fields',
    'pre_aggregate_definitions',
    'pre_aggregate_materializations',
    'query_history',
    'catalog_search',
    'project_merged_manifests',
    'warehouse_connection_manifests',
    'deploy_sessions',
    'deploy_session_batch_explores',
];
export const protectedRows = async (database: Knex) =>
    Object.fromEntries(
        await Promise.all(
            protectedTables.map(async (table) => [
                table,
                await database(table)
                    .select('*')
                    .orderByRaw('to_jsonb(??)::text', [table]),
            ]),
        ),
    );

export const seedProtectedRows = async (
    database: Knex,
    f: Awaited<ReturnType<typeof queueEvidenceFixture>>,
) => {
    const table = (name: string) => database<Record<string, unknown>>(name);
    await f.projects.saveExploresToCache(f.projectUuid, [validExplore], true);
    await f.catalogService.indexCatalog(f.projectUuid, f.userUuid);
    const [project] = await database('projects').where(
        'project_uuid',
        f.projectUuid,
    );
    await database('projects')
        .where('project_uuid', f.projectUuid)
        .update({
            project_defaults: { case_sensitive: false },
            table_groups: { retained: { label: 'Retained group' } },
        });
    await table('project_parameters').insert({
        project_uuid: f.projectUuid,
        name: 'retained',
        config: { type: 'string', default: 'old' },
    });
    const [space] = await table('spaces')
        .insert({
            project_id: project.project_id,
            name: 'Retained space',
            slug: 'retained-space',
            path: 'retained_space',
        })
        .returning('*');
    const [chart] = await table('saved_queries')
        .insert({
            project_uuid: f.projectUuid,
            space_id: space.space_id,
            name: 'Retained chart',
            slug: 'retained-chart',
            last_version_chart_kind: 'cartesian',
            last_version_updated_by_user_uuid: f.userUuid,
        })
        .returning('*');
    const [version] = await table('saved_queries_versions')
        .insert({
            saved_query_id: chart.saved_query_id,
            explore_name: validExplore.name,
            filters: {},
            row_limit: 10,
            chart_type: 'cartesian',
            chart_config: {},
            updated_by_user_uuid: f.userUuid,
        })
        .returning('*');
    await table('saved_queries_version_fields').insert({
        saved_queries_version_id: version.saved_queries_version_id,
        name: 'a_met1',
        field_type: 'metric',
        order: 0,
    });
    await table('validations').insert({
        project_uuid: f.projectUuid,
        saved_chart_uuid: chart.saved_query_uuid,
        error: 'Retained validation',
        error_type: 'metric',
        source: 'chart',
    });
    const [explore] = await database('cached_explore').where(
        'project_uuid',
        f.projectUuid,
    );
    const [definition] = await table('pre_aggregate_definitions')
        .insert({
            project_uuid: f.projectUuid,
            source_cached_explore_uuid: explore.cached_explore_uuid,
            pre_agg_cached_explore_uuid: explore.cached_explore_uuid,
            pre_aggregate_definition: {
                name: 'retained',
                dimensions: [],
                metrics: [],
            },
        })
        .returning('*');
    const [query] = await table('query_history')
        .insert({
            project_uuid: f.projectUuid,
            organization_uuid: f.organizationUuid,
            created_by_user_uuid: f.userUuid,
            context: 'exploreView',
            default_page_size: 10,
            compiled_sql: 'select 1',
            metric_query: {},
            fields: {},
            request_parameters: {},
            status: 'error',
            error: 'Retained failed query fixture',
            cache_key: randomUUID(),
        })
        .returning('*');
    await table('pre_aggregate_materializations').insert({
        project_uuid: f.projectUuid,
        pre_aggregate_definition_uuid: definition.pre_aggregate_definition_uuid,
        query_uuid: query.query_uuid,
        status: 'failed',
        trigger: 'manual',
        error_message: 'Retained failed materialization fixture',
    });
    await table('cached_explore_staging').insert({
        project_uuid: f.projectUuid,
        save_uuid: randomUUID(),
        name: validExplore.name,
        table_names: Object.keys(validExplore.tables),
        explore: validExplore,
    });
    const manifest = gzipSync(
        JSON.stringify({ nodes: {}, metadata: { revision: 'retained' } }),
    );
    await f.projects.upsertMergedManifest(f.projectUuid, manifest);
    const connection = await f.warehouseConnectionModel.createExtra(
        await f.warehouseConnectionModel.getProject(f.projectUuid),
        {
            name: 'Retained extra connection',
            warehouseType: postgresWarehouse('retained').type,
            source: {
                kind: 'project',
                credentials: postgresWarehouse('retained'),
            },
            listAllDatabases: false,
            additionalDatabases: [],
            createdByUserUuid: f.userUuid,
        },
    );
    await f.warehouseConnectionCompileModel.saveCompileArtifacts(
        f.projectUuid,
        connection.warehouseConnectionUuid,
        { manifest, catalog: null },
    );
    const session = await f.sessions.createSession(f.projectUuid, f.userUuid);
    await f.sessions.addBatch(session, f.projectUuid, [validExplore], 0, true);
    const snapshot = await protectedRows(database);
    for (const name of protectedTables)
        expect(
            snapshot[name],
            `Populated preservation fixture: ${name}`,
        ).not.toHaveLength(0);
};
