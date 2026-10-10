import {
    NotFoundError,
    ProjectType,
    WarehouseTypes,
    type CreateSnowflakeCredentials,
} from '@lightdash/common';
import knex from 'knex';
import { getTracker, MockClient, type Tracker } from 'knex-mock-client';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { AgentWarehouseRestrictionConfirmationModel } from '../../models/AgentWarehouseRestrictionConfirmationModel';
import { OrganizationWarehouseCredentialsModel } from '../../models/OrganizationWarehouseCredentialsModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { WarehouseConnectionCompileModel } from '../../models/WarehouseConnectionCompileModel/WarehouseConnectionCompileModel';
import { WarehouseConnectionModel } from '../../models/WarehouseConnectionModel/WarehouseConnectionModel';
import { EncryptionUtil } from '../../utils/EncryptionUtil/EncryptionUtil';
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
        const rows =
            table === 'projects' && query.bindings.includes('parent')
                ? [{ ...metadata.projects[0], project_uuid: 'parent' }]
                : (metadata[table ?? ''] ?? []);
        const columns = [
            ...query.sql.split(' from ')[0].matchAll(/"[a-z_]+"\."([a-z_]+)"/g),
        ].map((match) => match[1]);
        if (query.sql.split(' from ')[0].includes('*')) return rows;
        return rows.map((row) =>
            Object.fromEntries(
                Object.entries(row).filter(
                    ([key]) =>
                        columns.includes(key) ||
                        query.sql.split(' from ')[0].includes(`"${key}"`) ||
                        (key === 'row_version' && query.sql.includes('xmin')),
                ),
            ),
        );
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
    ['projects', 'organization_warehouse_credentials_uuid'],
    ['projects', 'connection_mode'],
    ['warehouse_credentials', 'warehouse_type'],
    ['warehouse_credentials', 'credential_subject_user_uuid'],
    ['warehouse_credentials', 'preview_owns_credentials'],
    ['warehouse_connections', 'warehouse_connection_uuid'],
    ['warehouse_connections', 'warehouse_type'],
    ['warehouse_connections', 'connection_credential_generation'],
    ['warehouse_credentials', 'warehouse_credential_generation'],
    [
        'organization_warehouse_credentials',
        'organization_credential_generation',
    ],
    ['warehouse_connections', 'organization_warehouse_credentials_uuid'],
    ['ai_service_account_credentials', 'identity_uuid'],
    ['ai_service_account_credentials', 'warehouse_connection_uuid'],
    ['ai_service_account_credentials', 'authentication_method'],
    ['organization_agent_identity_rules', 'warehouse_type'],
    ['organization_agent_identity_rules', 'actor_kind'],
    ['organization_agent_identity_rules', 'source'],
    ['organization_agent_identity_settings', 'require_verified_agent_sessions'],
    [
        'organization_snowflake_agent_clients',
        'organization_snowflake_agent_client_uuid',
    ],
    ['organization_snowflake_agent_clients', 'client_version'],
    ['credentials', 'credential_uuid'],
    ['credentials', 'generation'],
])('invalidates when %s.%s changes', async (table, column) => {
    const first = await fingerprint.get('project');
    metadata[table][0][column] = 'replacement';
    expect(await fingerprint.get('project')).not.toBe(first);
});

test.each([
    ['projects', 'name'],
    ['projects', 'row_version'],
    ['warehouse_connections', 'name'],
    ['warehouse_connections', 'updated_at'],
    ['credentials', 'updated_at'],
    ['credentials', 'row_version'],
    ['ai_service_account_credentials', 'updated_at'],
    ['credential_token_state', 'version'],
    ['project_dbt_sources', 'row_version'],
    ['cached_explore', 'warehouse_connection_uuid'],
    ['user_warehouse_credentials', 'row_version'],
    [
        'project_user_warehouse_credentials_preference',
        'user_warehouse_credentials_uuid',
    ],
    [
        'warehouse_connection_user_credentials_preference',
        'user_warehouse_credentials_uuid',
    ],
])(
    'preserves confirmation after unrelated %s.%s changes',
    async (table, column) => {
        const first = await fingerprint.get('project');
        metadata[table][0][column] = 'replacement';
        expect(await fingerprint.get('project')).toBe(first);
    },
);

test('preserves confirmation when a member adds personal credentials', async () => {
    const first = await fingerprint.get('project');
    metadata.user_warehouse_credentials.push({
        user_warehouse_credentials_uuid: 'new-personal',
    });
    expect(await fingerprint.get('project')).toBe(first);
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
    expect(sql).not.toMatch(
        /xmin|updated_at|credential_token_state|cached_explore|project_dbt_sources|user_warehouse_credentials/,
    );
    const credentialRead = tracker.history.select.find((query) =>
        query.sql.includes('from "credentials"'),
    );
    expect(credentialRead?.bindings).toEqual(
        expect.arrayContaining([
            'ai_service_account',
            'agent_sign_in',
            'agent_oauth_client',
        ]),
    );
    expect(credentialRead?.bindings).not.toEqual(
        expect.arrayContaining(['personal_sign_in']),
    );
    expect(sql).toContain('generation');
    expect(sql).toContain('client_version');
});

test('does not confirm a missing project', async () => {
    metadata.projects = [];
    await expect(fingerprint.get('missing')).rejects.toBeInstanceOf(
        NotFoundError,
    );
});

test('invalidates when the preview parent changes', async () => {
    metadata.projects[0].project_type = ProjectType.PREVIEW;
    metadata.projects[0].copied_from_project_uuid = 'parent';
    const first = await fingerprint.get('project');
    metadata.projects[0].copied_from_project_uuid = null;
    expect(await fingerprint.get('project')).not.toBe(first);
});

test('preserves a preview confirmation when its parent has an unrelated edit', async () => {
    metadata.projects[0].project_type = ProjectType.PREVIEW;
    metadata.projects[0].copied_from_project_uuid = 'parent';
    const first = await fingerprint.get('project');
    metadata.projects[0].row_version = 'updated';
    metadata.projects[0].name = 'renamed';
    expect(await fingerprint.get('project')).toBe(first);
});

test('invalidates a stored confirmation after an existing connection credential replacement', async () => {
    const encryptionUtil = {
        encrypt: (value: string) => Buffer.from(value),
    } as EncryptionUtil;
    const connections = new WarehouseConnectionModel({
        database,
        encryptionUtil,
        organizationWarehouseCredentialsModel:
            new OrganizationWarehouseCredentialsModel({
                database,
                encryptionUtil,
            }),
    });
    const confirmations = new AgentWarehouseRestrictionConfirmationModel({
        database,
    });
    const confirmed =
        await confirmations.getCurrentBindingFingerprint('project');
    metadata.agent_warehouse_restriction_confirmations = [
        {
            project_uuid: 'project',
            binding_fingerprint: confirmed,
            confirmed_by_user_uuid: 'admin',
            confirmed_at: new Date(),
        },
    ];
    tracker.on.update('warehouse_connections').response((query) => {
        if (
            query.sql.includes(
                '"connection_credential_generation" = "connection_credential_generation" + 1',
            )
        ) {
            metadata.warehouse_connections[0].connection_credential_generation =
                Number(
                    metadata.warehouse_connections[0]
                        .connection_credential_generation ?? 0,
                ) + 1;
        }
        return 1;
    });
    const project = {
        projectUuid: 'project',
        organizationUuid: 'organization',
        connectionMode: 'multi' as const,
        originalWarehouseType: WarehouseTypes.POSTGRES,
    };
    await connections.rename(project, 'connection', 'renamed');
    await connections.updateListingSettings(project, 'connection', {
        listAllDatabases: true,
        additionalDatabases: [],
    });
    expect(await confirmations.getCurrentBindingFingerprint('project')).toBe(
        confirmed,
    );
    tracker.on.insert('warehouse_connection_manifests').response(1);
    await new WarehouseConnectionCompileModel({
        database,
    }).saveCompileArtifacts('project', 'connection', {
        manifest: Buffer.from('{}'),
        catalog: null,
    });
    expect(await confirmations.getCurrentBindingFingerprint('project')).toBe(
        confirmed,
    );
    await connections.updateExtraCredentials(project, 'connection', {
        kind: 'project',
        credentials: {
            type: WarehouseTypes.POSTGRES,
            host: 'new-host',
            port: 5432,
            user: 'new-user',
            password: 'secret',
            dbname: 'database',
            schema: 'public',
        },
    });
    expect((await confirmations.get('project'))?.bindingFingerprint).toBe(
        confirmed,
    );
    expect(
        await confirmations.getCurrentBindingFingerprint('project'),
    ).not.toBe((await confirmations.get('project'))?.bindingFingerprint);
    const update = tracker.history.update.at(-1)!;
    expect(update.sql).toContain(
        '"connection_credential_generation" = "connection_credential_generation" + 1',
    );
    expect(update.sql).toContain('"encrypted_credentials" = $');
});

test.each(['project', 'organization', 'preview'] as const)(
    'invalidates %s replacements but preserves refresh rotations',
    async (owner) => {
        const encryptionUtil = {
            encrypt: (value: string) => Buffer.from(value),
            decrypt: (value: Buffer) => value.toString(),
        } as EncryptionUtil;
        const credentials: CreateSnowflakeCredentials = {
            type: WarehouseTypes.SNOWFLAKE,
            account: 'account',
            user: 'person',
            password: 'password',
            database: 'database',
            warehouse: 'warehouse',
            schema: 'public',
            refreshToken: 'before',
        };
        const table =
            owner !== 'organization'
                ? 'warehouse_credentials'
                : 'organization_warehouse_credentials';
        const secretColumn =
            owner !== 'organization'
                ? 'encrypted_credentials'
                : 'warehouse_connection';
        Object.assign(metadata[table][0], {
            organization_credential_generation: 0,
            warehouse_credential_generation: 0,
            project_id: 1,
            credential_subject_user_uuid: null,
            organization_uuid: 'organization',
            warehouse_type: credentials.type,
            [secretColumn]: encryptionUtil.encrypt(JSON.stringify(credentials)),
        });
        tracker.on.update(table).response((query) => {
            if (
                query.sql.includes(
                    '"warehouse_credential_generation" = "warehouse_credential_generation" + 1',
                )
            )
                metadata[table][0].warehouse_credential_generation =
                    Number(
                        metadata[table][0].warehouse_credential_generation ?? 0,
                    ) + 1;
            for (const match of query.sql
                .split(' where ')[0]
                .matchAll(/"([a-z_]+)" = \$(\d+)/g)) {
                metadata[table][0][match[1]] =
                    query.bindings[Number(match[2]) - 1];
            }
            return 1;
        });
        const projects = new ProjectModel({
            database,
            encryptionUtil,
            lightdashConfig: lightdashConfigMock,
        });
        const organizations = new OrganizationWarehouseCredentialsModel({
            database,
            encryptionUtil,
        });
        const confirmations = new AgentWarehouseRestrictionConfirmationModel({
            database,
        });
        const confirmed =
            await confirmations.getCurrentBindingFingerprint('project');
        metadata.agent_warehouse_restriction_confirmations = [
            {
                project_uuid: 'project',
                binding_fingerprint: confirmed,
                confirmed_by_user_uuid: 'admin',
                confirmed_at: new Date(),
            },
        ];
        const rotated =
            owner !== 'organization'
                ? await projects.rotateRefreshToken(
                      'project',
                      'before',
                      'after',
                  )
                : await organizations.rotateRefreshToken(
                      'shared',
                      'before',
                      'after',
                  );
        expect(rotated).toBe(true);
        expect(
            await confirmations.getCurrentBindingFingerprint('project'),
        ).toBe((await confirmations.get('project'))?.bindingFingerprint);
        if (owner !== 'organization') {
            await projects.updateWarehouseCredentialsIf(
                'project',
                (current) => ({ ...current, refreshToken: 'synced' }),
                'token_sync',
            );
            expect(
                await confirmations.getCurrentBindingFingerprint('project'),
            ).toBe(confirmed);
        }
        if (owner === 'preview') {
            metadata.warehouse_credentials[0].project_uuid = 'project';
            await database.transaction((transaction) =>
                projects['rewritePreviewWarehouseCredentials'](
                    transaction,
                    'parent',
                    { signIn: null, subjectUserUuid: null },
                    (current) =>
                        current.type === WarehouseTypes.SNOWFLAKE
                            ? { ...current, database: 'replacement' }
                            : null,
                ),
            );
        } else if (owner === 'project') {
            expect(
                await projects.updateWarehouseCredentialsIf(
                    'project',
                    (current) =>
                        current.type === WarehouseTypes.SNOWFLAKE
                            ? { ...current, database: 'replacement' }
                            : null,
                ),
            ).toBe(true);
        } else {
            await organizations.update('shared', { name: 'Renamed' });
            expect(
                await confirmations.getCurrentBindingFingerprint('project'),
            ).toBe(confirmed);
            await organizations.update('shared', {
                credentials: { ...credentials, database: 'replacement' },
            });
        }
        expect(
            await confirmations.getCurrentBindingFingerprint('project'),
        ).not.toBe((await confirmations.get('project'))?.bindingFingerprint);
    },
);
