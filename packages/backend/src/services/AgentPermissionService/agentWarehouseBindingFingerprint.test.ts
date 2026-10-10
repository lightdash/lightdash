import { NotFoundError, ProjectType } from '@lightdash/common';
import knex from 'knex';
import { getTracker, MockClient, type Tracker } from 'knex-mock-client';
import { AgentWarehouseBindingFingerprint } from './agentWarehouseBindingFingerprint';

const database = knex({ client: MockClient, dialect: 'pg' });
const fingerprint = new AgentWarehouseBindingFingerprint({ database });
let tracker: Tracker;
let metadata: Record<string, Record<string, unknown>[]>;

beforeEach(() => {
    tracker = getTracker();
    tracker.reset();
    metadata = {
        projects: [
            {
                project_uuid: 'project',
                organization_uuid: 'organization',
                project_type: ProjectType.DEFAULT,
                copied_from_project_uuid: null,
                row_version: '1',
            },
        ],
        project_dbt_sources: [
            { project_dbt_source_uuid: 'source', row_version: '14' },
        ],
        cached_explore: [
            { name: 'orders', warehouse_connection_uuid: 'connection' },
        ],
        credential_token_state: [
            { credential_uuid: 'credential', version: '1' },
        ],
        warehouse_credentials: [
            { warehouse_credentials_id: 1, row_version: '2' },
        ],
        warehouse_connections: [
            { warehouse_connection_uuid: 'connection', row_version: '3' },
        ],
        organization_warehouse_credentials: [
            {
                organization_warehouse_credentials_uuid: 'shared',
                row_version: '4',
            },
        ],
        ai_service_account_credentials: [
            {
                ai_service_account_credential_uuid: 'slot',
                identity_uuid: 'identity',
                row_version: '5',
            },
        ],
        organization_agent_identity_rules: [
            { source: 'ai_service_account', row_version: '6' },
        ],
        organization_agent_identity_settings: [
            { require_verified_agent_sessions: false, row_version: '7' },
        ],
        organization_snowflake_agent_clients: [
            { client_version: 'client-version', row_version: '8' },
        ],
        user_warehouse_credentials: [
            {
                user_warehouse_credentials_uuid: 'person-sign-in',
                row_version: '9',
            },
        ],
        project_user_warehouse_credentials_preference: [
            { user_warehouse_credentials_uuid: 'preferred', row_version: '10' },
        ],
        warehouse_connection_user_credentials_preference: [
            {
                user_warehouse_credentials_uuid: 'connection-preferred',
                row_version: '11',
            },
        ],
        credential_bindings: [
            { credential_uuid: 'credential', row_version: '12' },
        ],
        credentials: [
            {
                credential_uuid: 'credential',
                generation: 'generation',
                row_version: '13',
            },
        ],
    };
    tracker.on.select(/.*/).response((query) => {
        const table = query.sql.match(/from "([a-z_]+)"/)?.[1];
        if (table === 'projects' && query.bindings.includes('parent'))
            return [{ ...metadata.projects[0], project_uuid: 'parent' }];
        return metadata[table ?? ''] ?? [];
    });
});

afterAll(async () => database.destroy());

test('returns a deterministic digest without depending on row or field order', async () => {
    metadata.credentials.push({
        generation: 'other',
        credential_uuid: 'other',
    });
    const first = await fingerprint.get('project');
    metadata.credentials.reverse();
    metadata.credentials[0] = { credential_uuid: 'other', generation: 'other' };
    expect(await fingerprint.get('project')).toBe(first);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
});

test.each([
    'projects',
    'project_dbt_sources',
    'warehouse_credentials',
    'warehouse_connections',
    'organization_warehouse_credentials',
    'ai_service_account_credentials',
    'organization_agent_identity_rules',
    'organization_agent_identity_settings',
    'organization_snowflake_agent_clients',
    'user_warehouse_credentials',
    'project_user_warehouse_credentials_preference',
    'warehouse_connection_user_credentials_preference',
    'credential_bindings',
    'credentials',
])('invalidates when %s binding metadata changes', async (table) => {
    const first = await fingerprint.get('project');
    metadata[table][0].row_version = 'replacement';
    expect(await fingerprint.get('project')).not.toBe(first);
});

test('includes parent credential metadata for a preview project', async () => {
    metadata.projects[0].project_type = ProjectType.PREVIEW;
    metadata.projects[0].copied_from_project_uuid = 'parent';
    const first = await fingerprint.get('project');
    const credentialRead = tracker.history.select.find((query) =>
        query.sql.includes('from "ai_service_account_credentials"'),
    );
    expect(credentialRead?.bindings).toContain('parent');
    metadata.ai_service_account_credentials.push({
        project_uuid: 'parent',
        identity_uuid: 'inherited-replacement',
    });
    expect(await fingerprint.get('project')).not.toBe(first);
    expect(tracker.history.select[1].bindings).toContain('organization');
});

test('invalidates when a binding is added or removed', async () => {
    const first = await fingerprint.get('project');
    metadata.warehouse_connections = [];
    expect(await fingerprint.get('project')).not.toBe(first);
});

test('does not select ciphertext, token material, or secret-derived fingerprints', async () => {
    await fingerprint.get('project');
    const sql = tracker.history.select.map((query) => query.sql).join('\n');
    expect(sql).not.toMatch(
        /encrypted_|source_fingerprint|refresh_token|access_token|select \*/,
    );
    expect(sql).toContain('xmin');
    expect(sql).toContain('generation');
    expect(sql).toContain('client_version');
});

test('does not confirm a missing project', async () => {
    metadata.projects = [];
    await expect(fingerprint.get('missing')).rejects.toBeInstanceOf(
        NotFoundError,
    );
});

test('invalidates when an explore moves to another warehouse connection', async () => {
    const first = await fingerprint.get('project');
    metadata.cached_explore[0].warehouse_connection_uuid = 'other-connection';
    expect(await fingerprint.get('project')).not.toBe(first);
});

test('invalidates when credential token state rotates without a generation change', async () => {
    const first = await fingerprint.get('project');
    metadata.credential_token_state[0].version = '2';
    expect(await fingerprint.get('project')).not.toBe(first);
});
