import {
    AiIdentityFailureReason,
    AiIdentitySort,
    AiIdentityState,
    AiIdentityStatus,
    AiIdentitySyncStatus,
} from '@lightdash/common';
import knex, { Knex } from 'knex';
import { getTracker, MockClient, Tracker } from 'knex-mock-client';
import { EncryptionUtil } from '../utils/EncryptionUtil/EncryptionUtil';
import { AiIdentityModel } from './AiIdentityModel';

const database = knex({ client: MockClient, dialect: 'pg' }) as Knex;
const encryptionUtil = {
    encrypt: (value: string) => Buffer.from(value),
    decrypt: (value: Buffer) => value.toString(),
} as EncryptionUtil;
const model = new AiIdentityModel({ database, encryptionUtil });
let tracker: Tracker;

beforeAll(() => {
    tracker = getTracker();
});
afterEach(() => {
    tracker.reset();
});

const row = {
    ai_identity_uuid: 'identity',
    ai_identity_account_uuid: 'account',
    user_uuid: 'user',
    snowflake_login: 'LOGIN',
    twin_name_override: null,
    public_key: 'KEY',
    public_key_fingerprint: 'SHA256:KEY',
    encrypted_private_key: Buffer.from('PRIVATE'),
    status: AiIdentityStatus.PENDING,
    failure_reason: null,
    status_message: null,
    checked_at: null,
    created_at: new Date(),
    updated_at: new Date(),
    email: 'person@example.com',
    first_name: 'First',
    last_name: 'Last',
    snowflake_account: 'ACCT',
    twin_name_template: '{snowflake_login}_AI',
};

const filter = {
    aiIdentityAccountUuid: 'account',
    states: [] as AiIdentityState[],
    reasons: [] as AiIdentityFailureReason[],
    projectUuid: null,
    search: null,
    staleOnly: false,
};

describe('AiIdentityModel', () => {
    it('returns the default automatic sync before setup', async () => {
        tracker.on.select('ai_identity_automatic_sync').responseOnce([]);
        await expect(model.getAutomaticSync('account')).resolves.toEqual({
            pending: false,
            status: null,
            lastRunAt: null,
            managedScope: [],
            issues: [],
            progress: 0,
        });
    });

    it('returns the saved run status', async () => {
        const lastRunAt = new Date('2026-10-06T10:00:00Z');
        tracker.on.select('ai_identity_automatic_sync').responseOnce([
            {
                enabled: false,
                pending: false,
                status: AiIdentitySyncStatus.UNSAFE,
                last_run_at: lastRunAt,
            },
        ]);
        await expect(model.getAutomaticSync('account')).resolves.toMatchObject({
            status: AiIdentitySyncStatus.UNSAFE,
            lastRunAt,
        });
    });

    it('holds rule changes pending until Lightdash completes a sync', async () => {
        tracker.on.insert('ai_identity_automatic_sync').responseOnce([1]);
        await model.setAutomaticSyncPending('account', true);
        expect(tracker.history.insert[0].bindings).toContain(true);
        expect(tracker.history.insert[0].bindings).toContain('account');
    });

    it('compares cached schemas for the matching Snowflake sign-in', async () => {
        tracker.on.select('user_warehouse_credentials').responseOnce([
            {
                user_warehouse_credentials_uuid: 'matching',
                user_uuid: 'person',
                encrypted_credentials: Buffer.from(
                    JSON.stringify({ user: 'PERSON' }),
                ),
            },
            {
                user_warehouse_credentials_uuid: 'other',
                user_uuid: 'person',
                encrypted_credentials: Buffer.from(
                    JSON.stringify({ user: 'OTHER' }),
                ),
            },
        ]);
        tracker.on
            .select('warehouse_credentials_available_tables')
            .responseOnce([
                {
                    user_warehouse_credentials_uuid: 'matching',
                    database: 'DB',
                    schema: 'PUBLIC',
                },
            ]);
        await expect(
            model.getCachedCatalogSchemasForPeople('project', [
                { userUuid: 'person', snowflakeLogin: 'PERSON' },
            ]),
        ).resolves.toEqual(new Map([['person', ['DB.PUBLIC']]]));
    });

    it('keeps a matching sign-in with no cached schemas for access warnings', async () => {
        tracker.on.select('user_warehouse_credentials').responseOnce([
            {
                user_warehouse_credentials_uuid: 'matching',
                user_uuid: 'person',
                encrypted_credentials: Buffer.from(
                    JSON.stringify({ user: 'PERSON' }),
                ),
            },
        ]);
        tracker.on
            .select('warehouse_credentials_available_tables')
            .responseOnce([]);
        await expect(
            model.getCachedCatalogSchemasForPeople('project', [
                { userUuid: 'person', snowflakeLogin: 'PERSON' },
            ]),
        ).resolves.toEqual(new Map([['person', []]]));
    });
    it('returns the saved role template with the account', async () => {
        tracker.on.select('ai_identity_accounts').responseOnce([
            {
                ai_identity_account_uuid: 'account',
                organization_uuid: 'org',
                snowflake_account: 'ACCT',
                twin_name_template: '{snowflake_login}_AI',
                role_template: '{ai_identity_name}_ROLE',
                last_full_check_at: null,
                creation_mode: 'guided',
            },
        ]);
        tracker.on.select('ai_identities').responseOnce([]);
        tracker.on.select('ai_identity_provisioners').responseOnce([]);
        await expect(model.getAccount('account')).resolves.toMatchObject({
            roleTemplate: '{ai_identity_name}_ROLE',
        });
    });

    it('falls back to guided mode when automatic provisioning fails', async () => {
        tracker.on.select('ai_identity_accounts').responseOnce([
            {
                ai_identity_account_uuid: 'account',
                organization_uuid: 'org',
                snowflake_account: 'ACCT',
                twin_name_template: null,
                role_template: null,
                last_full_check_at: null,
                creation_mode: 'automatic',
            },
        ]);
        tracker.on.select('ai_identities').responseOnce([]);
        tracker.on
            .select('ai_identity_provisioners')
            .responseOnce([
                { status: 'revoked', status_message: 'JWT token is invalid' },
            ]);
        await expect(model.getAccount('account')).resolves.toMatchObject({
            effectiveMode: 'guided',
            fallbackReason: expect.stringContaining('JWT token is invalid'),
        });
    });

    it('stores the job link on an audit event', async () => {
        tracker.on.insert('ai_identity_events').responseOnce(1);
        await model.addEvent({
            organizationUuid: 'org',
            aiIdentityAccountUuid: 'account',
            aiIdentityUuid: null,
            aiIdentityJobUuid: 'job',
            actorType: 'user',
            actorUserUuid: 'user',
            action: 'export',
            targetCount: 0,
            status: 'success',
            detail: null,
        });
        expect(tracker.history.insert[0].sql).toContain(
            '"ai_identity_job_uuid"',
        );
        expect(tracker.history.insert[0].bindings).toContain('job');
    });

    it('finds the newest delivered Slack DM for one person and organization since the cutoff', async () => {
        const since = new Date('2026-10-04T12:00:00Z');
        const createdAt = new Date('2026-10-05T10:00:00Z');
        tracker.on.select('ai_identity_events').responseOnce([
            {
                ai_identity_event_uuid: 'event',
                created_at: createdAt,
            },
        ]);
        expect(
            await model.findLatestSlackDmEvent({
                organizationUuid: 'org',
                userUuid: 'user',
                since,
            }),
        ).toEqual({ aiIdentityEventUuid: 'event', createdAt });
        const query = tracker.history.select[0];
        expect(query.sql).toContain('"organization_uuid" = $1');
        expect(query.sql).toContain('"actor_user_uuid" = $2');
        expect(query.sql).toContain('"action" = $3');
        expect(query.sql).toContain('"created_at" > $5');
        expect(query.sql).toContain('order by "created_at" desc limit $6');
        expect(query.sql).toContain('"status" = $4');
        expect(query.bindings).toEqual([
            'org',
            'user',
            'slack_dm',
            'success',
            since,
            1,
        ]);
    });

    it('returns null when there is no recent Slack DM attempt', async () => {
        tracker.on.select('ai_identity_events').responseOnce([]);
        expect(
            await model.findLatestSlackDmEvent({
                organizationUuid: 'org',
                userUuid: 'user',
                since: new Date(),
            }),
        ).toBeNull();
    });

    it('keeps bulk test results in identity history but out of the request log', async () => {
        tracker.on.select('ai_identity_events').responseOnce([{ count: '0' }]);
        tracker.on.select('ai_identity_events').responseOnce([]);
        await model.listEvents('org', 1, 20);
        expect(tracker.history.select[0].sql).toContain(
            'not "ai_identity_events"."action" =',
        );
        expect(tracker.history.select[0].bindings).toContain('tested');
        tracker.reset();
        tracker.on.select('ai_identity_events').responseOnce([{ count: '0' }]);
        tracker.on.select('ai_identity_events').responseOnce([]);
        await model.listEvents('org', 1, 20, 'identity');
        expect(tracker.history.select[0].bindings).not.toContain('tested');
        expect(tracker.history.select[0].bindings).toContain('list');
    });

    it.each(['success', 'error'])(
        'merges the latest job %s into the initiating request before pagination',
        async (status) => {
            tracker.on
                .select('ai_identity_events')
                .responseOnce([{ count: '1' }]);
            tracker.on.select('ai_identity_events').responseOnce([
                {
                    ai_identity_event_uuid: 'request',
                    actor_type: 'api',
                    actor_user_uuid: 'user',
                    first_name: 'First',
                    last_name: 'Last',
                    action: 'export',
                    status: 'success',
                    target_count: 0,
                    ai_identity_job_uuid: 'job',
                    job_status: 'done',
                    outcome_status: status,
                    outcome_target_count: 12,
                    outcome_detail:
                        status === 'error' ? 'Storage unavailable' : null,
                },
            ]);
            const result = await model.listEvents('org', 2, 20);
            expect(result.data[0]).toMatchObject({
                aiIdentityEventUuid: 'request',
                actorType: 'api',
                actorName: 'First Last',
                action: 'export',
                status,
                targetCount: 12,
                detail: `Job job (done)${status === 'error' ? ' · Storage unavailable' : ''}`,
            });
            expect(result.pagination.totalResults).toBe(1);
            for (const query of tracker.history.select) {
                expect(query.sql).toContain('not exists');
                expect(query.sql).toContain(
                    '"request"."organization_uuid" = "ai_identity_events"."organization_uuid"',
                );
                expect(query.sql).toContain(
                    '"request"."ai_identity_job_uuid" = "ai_identity_events"."ai_identity_job_uuid"',
                );
                expect(query.bindings).toEqual(
                    expect.arrayContaining(['user', 'api']),
                );
            }
            expect(tracker.history.select[1].sql).toContain(
                'LEFT JOIN LATERAL',
            );
            expect(tracker.history.select[1].sql).toContain(
                'ORDER BY outcome.created_at DESC',
            );
            expect(tracker.history.select[1].bindings.slice(-2)).toEqual([
                20, 20,
            ]);
        },
    );

    it('preserves scheduler-only and legacy events without an outcome', async () => {
        tracker.on.select('ai_identity_events').responseOnce([{ count: '2' }]);
        tracker.on.select('ai_identity_events').responseOnce([
            {
                actor_type: 'scheduler',
                first_name: null,
                status: 'success',
                target_count: 7,
                detail: null,
                ai_identity_job_uuid: 'daily',
            },
            {
                actor_type: 'user',
                first_name: 'First',
                last_name: 'Last',
                status: 'error',
                target_count: 0,
                detail: 'Old error',
                ai_identity_job_uuid: null,
            },
        ]);
        const result = await model.listEvents('org', 1, 20);
        expect(result.data).toEqual([
            expect.objectContaining({
                actorType: 'scheduler',
                status: 'success',
                targetCount: 7,
                detail: 'Job daily',
            }),
            expect.objectContaining({
                actorType: 'user',
                status: 'error',
                detail: 'Old error',
            }),
        ]);
    });

    it('finds an identity by account and person without returning its private key', async () => {
        tracker.on.select('ai_identities').responseOnce([row]);
        const identity = await model.find({
            aiIdentityAccountUuid: 'account',
            userUuid: 'user',
        });
        expect(identity).toMatchObject({
            twinName: 'LOGIN_AI',
            snowflakeAccount: 'ACCT',
        });
        expect(identity).not.toHaveProperty('privateKey');
        expect(tracker.history.select[0].sql).toContain(
            'ai_identity_account_uuid',
        );
        expect(tracker.history.select[0].sql).not.toContain(
            'encrypted_private_key',
        );
    });

    it('maps stored legacy key failures to the combined reason', async () => {
        tracker.on
            .select('ai_identities')
            .responseOnce([{ ...row, failure_reason: 'public_key_not_set' }]);
        const found = await model.find({
            aiIdentityAccountUuid: 'account',
            userUuid: 'user',
        });
        expect(found?.failureReason).toBe(
            AiIdentityFailureReason.KEY_OR_USER_REJECTED,
        );
    });

    it('derives needs_sign_in when neither login nor override exists', async () => {
        tracker.on
            .select('ai_identities')
            .responseOnce([{ ...row, snowflake_login: null }]);
        expect(
            await model.find({
                aiIdentityAccountUuid: 'account',
                userUuid: 'user',
            }),
        ).toMatchObject({
            state: AiIdentityState.NEEDS_SIGN_IN,
            publicKey: 'KEY',
        });
    });

    it('decrypts only for a private lookup', async () => {
        tracker.on.select('ai_identities').responseOnce([row]);
        expect(
            await model.findWithPrivateKey({
                aiIdentityAccountUuid: 'account',
                userUuid: 'user',
            }),
        ).toMatchObject({ privateKey: 'PRIVATE' });
        expect(tracker.history.select[0].sql).toContain(
            'encrypted_private_key',
        );
    });

    it('applies state, reason, search and stale filters in SQL before pagination', async () => {
        tracker.on.select('ai_identities').responseOnce([]);
        tracker.on.select('ai_identities').responseOnce([]);
        await model.list(
            {
                ...filter,
                states: [AiIdentityState.FAILED],
                reasons: [AiIdentityFailureReason.KEY_OR_USER_REJECTED],
                search: 'first',
                staleOnly: true,
            },
            AiIdentitySort.SEVERITY,
            'asc',
            2,
            20,
        );
        const sql = tracker.history.select.map((query) => query.sql).join(' ');
        expect(sql).toContain('ILIKE');
        expect(sql).toContain('failure_reason');
        expect(sql).toContain('INTERVAL');
        expect(sql).toContain('limit');
        expect(tracker.history.select.at(-1)?.bindings).toContain(20);
    });

    it('filters project members through the existing access SQL', async () => {
        tracker.on.select('ai_identities').responseOnce([]);
        tracker.on.select('ai_identities').responseOnce([]);
        await model.list(
            { ...filter, projectUuid: 'project' },
            AiIdentitySort.SEVERITY,
            'asc',
            1,
            20,
        );
        const sql = tracker.history.select.map((query) => query.sql).join(' ');
        expect(sql).toContain('project_group_access');
        expect(tracker.history.select[0].bindings).toContain('project');
    });

    it('limits a bulk filter to selected identity UUIDs', async () => {
        tracker.on.select('ai_identities').responseOnce([]);
        tracker.on.select('ai_identities').responseOnce([]);
        await model.list(
            { ...filter, aiIdentityUuids: ['first-id', 'second-id'] },
            AiIdentitySort.SEVERITY,
            'asc',
            1,
            20,
        );
        const sql = tracker.history.select.map((query) => query.sql).join(' ');
        expect(sql).toContain('"ai_identities"."ai_identity_uuid" in');
        expect(tracker.history.select[0].bindings).toContain('first-id');
        expect(tracker.history.select[0].bindings).toContain('second-id');
    });

    it('samples risky names across the account without exposing private keys', async () => {
        tracker.on
            .select('ai_identities')
            .responseOnce([
                { ...row, ai_identity_uuid: 'missing', snowflake_login: null },
            ]);
        tracker.on.select('ai_identities').responseOnce([
            {
                ...row,
                ai_identity_uuid: 'punctuation',
                snowflake_login: 'FIRST.LAST',
            },
        ]);
        tracker.on.select('ai_identities').responseOnce([
            {
                ...row,
                ai_identity_uuid: 'long',
                snowflake_login: 'A'.repeat(256),
            },
        ]);
        tracker.on.select('ai_identities').responseOnce([row]);

        const identities = await model.preview('account');

        expect(identities.map((identity) => identity.aiIdentityUuid)).toEqual([
            'missing',
            'punctuation',
            'long',
        ]);
        expect(tracker.history.select).toHaveLength(4);
        expect(tracker.history.select[0].sql).toContain(
            'snowflake_login" is null',
        );
        expect(tracker.history.select[1].sql).toContain('snowflake_login ~ $');
        expect(tracker.history.select[2].sql).toContain(
            'length(ai_identities.snowflake_login) > 255',
        );
        expect(tracker.history.select[3].sql).toContain(
            'order by "ai_identities"."created_at" desc',
        );
        tracker.history.select.forEach((query) => {
            expect(query.bindings).toContain('account');
            expect(query.sql).not.toContain('encrypted_private_key');
        });
    });

    it('stores encrypted keys and resets the prior check', async () => {
        tracker.on.update('ai_identities').responseOnce(1);
        tracker.on
            .select('ai_identities')
            .responseOnce([{ ...row, public_key: 'TkVX' }]);
        await model.setKeys('identity', {
            publicKey: 'TkVX',
            privateKey: 'NEW PRIVATE',
        });
        expect(tracker.history.update[0].bindings).toContain(
            AiIdentityStatus.PENDING,
        );
        expect(tracker.history.update[0].bindings).not.toContain('NEW PRIVATE');
    });
});

describe('AI role schema rule storage', () => {
    it.each([
        {
            name: 'all_except',
            rule: {
                mode: 'all_except',
                database: 'RULE_DB',
                patterns: ['PII_*'],
            },
            schemas: ['COLUMN_DB.PUBLIC'],
            expected: { database: 'RULE_DB', excludePatterns: ['PII_*'] },
        },
        {
            name: 'list',
            rule: { mode: 'list', schemas: ['LIST_DB.PUBLIC'] },
            schemas: ['COLUMN_DB.PUBLIC'],
            expected: { database: 'LIST_DB', excludePatterns: ['*'] },
        },
        {
            name: 'only_matching',
            rule: {
                mode: 'only_matching',
                database: 'RULE_DB',
                patterns: ['PUBLIC'],
            },
            schemas: ['COLUMN_DB.PUBLIC'],
            expected: { database: 'COLUMN_DB', excludePatterns: ['*'] },
        },
        {
            name: 'existing_role',
            rule: { mode: 'existing_role' },
            schemas: ['COLUMN_DB.PUBLIC'],
            expected: { database: 'COLUMN_DB', excludePatterns: ['*'] },
        },
        {
            name: 'empty list',
            rule: { mode: 'list', schemas: [] },
            schemas: [],
            expected: { database: '', excludePatterns: ['*'] },
        },
        {
            name: 'only_matching without stored schemas',
            rule: {
                mode: 'only_matching',
                database: 'RULE_DB',
                patterns: ['PUBLIC'],
            },
            schemas: [],
            expected: { database: '', excludePatterns: ['*'] },
        },
        {
            name: 'existing_role without stored schemas',
            rule: { mode: 'existing_role' },
            schemas: [],
            expected: { database: '', excludePatterns: ['*'] },
        },
        {
            name: 'null rule',
            rule: null,
            schemas: ['COLUMN_DB.PUBLIC'],
            expected: { database: 'COLUMN_DB', excludePatterns: ['*'] },
        },
        {
            name: 'null rule without stored schemas',
            rule: null,
            schemas: [],
            expected: { database: '', excludePatterns: ['*'] },
        },
        {
            name: 'current rule',
            rule: { database: 'DB', excludePatterns: [] },
            schemas: ['COLUMN_DB.PUBLIC'],
            expected: { database: 'DB', excludePatterns: [] },
        },
    ])(
        'reads $name and returns the compatibility schemas field',
        async ({ rule, schemas, expected }) => {
            tracker.on.select('ai_identity_ai_roles').responseOnce([
                {
                    ai_identity_ai_role_uuid: 'role',
                    role_name: 'AI_ROLE',
                    warehouse: 'WH',
                    schemas,
                    schema_rule: rule,
                },
            ]);
            expect(await model.getAiRoles('account')).toEqual([
                {
                    aiIdentityAiRoleUuid: 'role',
                    roleName: 'AI_ROLE',
                    warehouse: 'WH',
                    schemas: [],
                    schemaRule: expected,
                },
            ]);
        },
    );
    it('stores exclusions with an empty compatibility schemas field', async () => {
        tracker.on.delete('ai_identity_ai_roles').responseOnce(1);
        tracker.on.insert('ai_identity_ai_roles').responseOnce(1);
        tracker.on.select('ai_identity_accounts').responseOnce({});
        tracker.on.select('ai_identity_ai_roles').responseOnce([]);
        tracker.on.insert('ai_identity_events').responseOnce(1);
        await model.replaceAiRoles(
            'account',
            [
                {
                    roleName: 'AI_ROLE',
                    warehouse: 'WH',
                    schemaRule: { database: 'DB', excludePatterns: ['PII_*'] },
                },
            ],
            {
                organizationUuid: 'org',
                actorType: 'user',
                actorUserUuid: 'admin',
            },
        );
        expect(tracker.history.insert[0].bindings).toContain('[]');
        expect(tracker.history.insert[0].bindings).toContain(
            JSON.stringify({ database: 'DB', excludePatterns: ['PII_*'] }),
        );
    });
});

describe('AI role exclusion events', () => {
    const role = (patterns: string[]) => ({
        roleName: 'ANALYST_AI',
        warehouse: 'WH',
        schemaRule: { database: 'DB', excludePatterns: patterns },
    });
    it.each([
        {
            name: 'add',
            before: ['PII_*'],
            after: ['PII_*', '*_RAW'],
            action: 'ai_role_exclusions_changed',
            added: '*_RAW',
            removed: 'none',
        },
        {
            name: 'remove',
            before: ['PII_*', '*_RAW'],
            after: ['PII_*'],
            action: 'ai_role_exclusions_changed',
            added: 'none',
            removed: '*_RAW',
        },
        {
            name: 'create',
            before: null,
            after: ['PII_*'],
            action: 'ai_role_created',
            added: 'PII_*',
            removed: 'none',
        },
        {
            name: 'delete',
            before: ['PII_*'],
            after: null,
            action: 'ai_role_deleted',
            added: 'none',
            removed: 'PII_*',
        },
        {
            name: 'create without patterns',
            before: null,
            after: [],
            action: 'ai_role_created',
            added: 'none',
            removed: 'none',
        },
        {
            name: 'delete without patterns',
            before: [],
            after: null,
            action: 'ai_role_deleted',
            added: 'none',
            removed: 'none',
        },
    ])(
        'records who, role and patterns for $name',
        async ({ before, after, action, added, removed }) => {
            tracker.on.select('ai_identity_accounts').responseOnce({});
            tracker.on.select('ai_identity_ai_roles').responseOnce(
                before === null
                    ? []
                    : [
                          {
                              role_name: 'ANALYST_AI',
                              schemas: [],
                              schema_rule: role(before).schemaRule,
                          },
                      ],
            );
            tracker.on.delete('ai_identity_ai_roles').responseOnce(1);
            tracker.on.insert('ai_identity_ai_roles').responseOnce(1);
            tracker.on.insert('ai_identity_events').responseOnce(1);
            await model.replaceAiRoles(
                'account',
                after === null ? [] : [role(after)],
                {
                    organizationUuid: 'org',
                    actorType: 'user',
                    actorUserUuid: 'admin',
                },
            );
            const event = tracker.history.insert.find((query) =>
                query.sql.includes('ai_identity_events'),
            )!;
            expect(event.bindings).toEqual(
                expect.arrayContaining([
                    'org',
                    'account',
                    'user',
                    'admin',
                    action,
                    `ANALYST_AI · Database: DB · Added: ${added} · Removed: ${removed}`,
                ]),
            );
        },
    );
    it('does not record reordered or case-only pattern changes', async () => {
        tracker.on.select('ai_identity_accounts').responseOnce({});
        tracker.on.select('ai_identity_ai_roles').responseOnce([
            {
                role_name: 'ANALYST_AI',
                schemas: [],
                schema_rule: role(['pii_*', '*_RAW']).schemaRule,
            },
        ]);
        tracker.on.delete('ai_identity_ai_roles').responseOnce(1);
        tracker.on.insert('ai_identity_ai_roles').responseOnce(1);
        await model.replaceAiRoles('account', [role(['*_RAW', 'PII_*'])], {
            organizationUuid: 'org',
            actorType: 'user',
            actorUserUuid: 'admin',
        });
        expect(tracker.history.insert).toHaveLength(1);
    });
});

it('filters exclusion history by organization, account and action before pagination', async () => {
    tracker.on.select('ai_identity_events').responseOnce([{ count: '51' }]);
    tracker.on.select('ai_identity_events').responseOnce([]);
    const result = await model.listEvents('org', 2, 50, null, false, 'account');
    for (const query of tracker.history.select) {
        expect(query.bindings).toEqual(
            expect.arrayContaining([
                'org',
                'account',
                'ai_role_created',
                'ai_role_deleted',
                'ai_role_exclusions_changed',
            ]),
        );
        expect(query.sql).toContain(
            '"ai_identity_events"."ai_identity_account_uuid" =',
        );
        expect(query.sql).toContain('"ai_identity_events"."action" in');
    }
    expect(result.pagination).toEqual({
        page: 2,
        pageSize: 50,
        totalResults: 51,
        totalPageCount: 2,
    });
});
