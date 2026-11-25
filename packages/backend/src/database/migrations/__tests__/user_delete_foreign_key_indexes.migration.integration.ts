import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../testing/migratedDatabase';

const knownUnindexedForeignKeys = new Set([
    'ai_agent_document(created_by_user_uuid)',
    'ai_agent_document(updated_by_user_uuid)',
    'ai_agent_memory_consolidation_run(triggered_by_user_uuid)',
    'ai_agent_review_item(assigned_to_user_uuid)',
    'ai_agent_review_item(created_by_user_uuid)',
    'ai_agent_review_item(source_ai_agent_memory_uuid)',
    'ai_agent_review_item(status_updated_by_user_uuid)',
    'ai_agent_review_remediation(created_by_user_uuid)',
    'ai_agent_review_remediation(resolved_by_user_uuid)',
    'ai_artifact_versions(verified_by_user_uuid)',
    'ai_mcp_server_credential(created_by_user_uuid)',
    'ai_mcp_server_credential(updated_by_user_uuid)',
    'ai_prompt_interrupt(created_by_user_uuid)',
    'ai_prompt_steer(created_by_user_uuid)',
    'ai_sql_approval(decided_by_user_uuid)',
    'ai_thread_share(created_by_user_uuid)',
    'ai_web_app_prompt(user_uuid)',
    'ai_web_app_thread(user_uuid)',
    'catalog_search_tags(created_by_user_uuid)',
    'changesets(created_by_user_uuid)',
    'changesets(updated_by_user_uuid)',
    'content_drafts(author_user_uuid)',
    'content_verification(verified_by_user_uuid)',
    'credential_bindings(credential_uuid,slot)',
    'credential_bindings(credential_uuid,user_uuid)',
    'dashboard_tile_comments(user_uuid)',
    'data_app_analyses(reused_from_analysis_uuid)',
    'embedding(created_by)',
    'external_connection_samples(created_by_user_uuid)',
    'feature_flag_overrides(user_uuid)',
    'github_app_installations(created_by_user_uuid)',
    'github_app_installations(updated_by_user_uuid)',
    'gitlab_app_installations(created_by_user_uuid)',
    'gitlab_app_installations(updated_by_user_uuid)',
    'groups(created_by_user_uuid)',
    'groups(updated_by_user_uuid)',
    'managed_agent_actions(reversed_by_user_uuid)',
    'managed_agent_protections(created_by_user_uuid)',
    'managed_agent_settings(enabled_by_user_uuid)',
    'metrics_tree_edges(created_by_user_uuid)',
    'metrics_trees(created_by_user_uuid)',
    'metrics_trees(updated_by_user_uuid)',
    'oauth2_clients(created_by_user_uuid)',
    'organization_member_user_attributes(user_id,organization_id)',
    'organization_memberships(user_id)',
    'password_reset_links(email_id)',
    'personal_access_tokens(created_by_user_id)',
    'project_announcements(created_by_user_uuid)',
    'project_user_warehouse_credentials_preference(user_warehouse_credentials_uuid)',
    'projects(created_by_user_uuid)',
    'pull_requests(created_by_user_uuid)',
    'roles(created_by)',
    'saved_sql(last_version_updated_by_user_uuid)',
    'scheduler(created_by)',
    'scim_organization_access_tokens(created_by_user_uuid)',
    'scim_organization_access_tokens(rotated_by_user_uuid)',
    'scoped_roles(granted_by)',
    'service_accounts(created_by_user_uuid)',
    'service_accounts(rotated_by_user_uuid)',
    'share(created_by_user_id)',
    'slack_auth_tokens(created_by_user_id)',
    'tags(created_by_user_uuid)',
    'user_warehouse_credentials(user_uuid)',
    'warehouse_credentials_available_tables(user_warehouse_credentials_uuid)',
]);

const foreignKeysOnUserDeletePath = `
WITH RECURSIVE foreign_keys AS (
    SELECT oid, conrelid, confrelid, conkey, confdeltype
    FROM pg_constraint
    WHERE contype = 'f'
), delete_path AS (
    SELECT foreign_keys.*, ARRAY[confrelid] AS visited, 1 AS depth
    FROM foreign_keys
    WHERE confrelid = 'users'::regclass
    UNION ALL
    SELECT foreign_keys.*, delete_path.visited || foreign_keys.confrelid, delete_path.depth + 1
    FROM delete_path
    JOIN foreign_keys ON foreign_keys.confrelid = delete_path.conrelid
    WHERE delete_path.confdeltype = 'c'
      AND NOT foreign_keys.confrelid = ANY (delete_path.visited[2:])
      AND delete_path.depth < 10
)
SELECT DISTINCT
    delete_path.conrelid::regclass::text || '(' || (
        SELECT string_agg(attname, ',' ORDER BY key.position)
        FROM unnest(delete_path.conkey) WITH ORDINALITY AS key(column_number, position)
        JOIN pg_attribute ON attrelid = delete_path.conrelid AND attnum = key.column_number
    ) || ')' AS foreign_key,
    EXISTS (
        SELECT 1
        FROM pg_index
        WHERE indrelid = delete_path.conrelid
          AND indisvalid
          AND indpred IS NULL
          AND indexprs IS NULL
          AND (
              SELECT array_agg(column_number ORDER BY column_number)
              FROM unnest((indkey::int2[])[0:cardinality(delete_path.conkey) - 1]) AS column_number
          ) = (
              SELECT array_agg(column_number ORDER BY column_number)
              FROM unnest(delete_path.conkey) AS column_number
          )
    ) AS indexed
FROM delete_path
`;

describe('foreign keys on the user delete path', () => {
    let migrated: MigratedDatabase;
    let foreignKeys: { foreign_key: string; indexed: boolean }[];

    beforeAll(async () => {
        migrated = await createMigratedDatabase();
        const { rows } = await migrated.database.raw<{
            rows: { foreign_key: string; indexed: boolean }[];
        }>(foreignKeysOnUserDeletePath);
        foreignKeys = rows;
    });

    afterAll(async () => {
        await migrated?.destroy();
    });

    test('have an index that leads with the referencing columns', () => {
        const unindexed = foreignKeys
            .filter(({ indexed }) => !indexed)
            .map(({ foreign_key }) => foreign_key)
            .filter((foreignKey) => !knownUnindexedForeignKeys.has(foreignKey))
            .sort();

        expect(unindexed).toEqual([]);
    });

    test('known unindexed foreign keys leave the list once they get an index', () => {
        const indexedButListed = foreignKeys
            .filter(({ indexed }) => indexed)
            .map(({ foreign_key }) => foreign_key)
            .filter((foreignKey) => knownUnindexedForeignKeys.has(foreignKey))
            .sort();

        expect(indexedButListed).toEqual([]);
    });
});
