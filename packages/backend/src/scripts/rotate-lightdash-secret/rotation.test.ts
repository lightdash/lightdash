import knex, { type Knex } from 'knex';
import { getTracker, MockClient, type Tracker } from 'knex-mock-client';
import { type LightdashSecrets } from '../../config/parseConfig';
import { EncryptionUtil } from '../../utils/EncryptionUtil/EncryptionUtil';
import { deriveTokenHashSalt, hashWithSecret } from '../../utils/hash';
import {
    getSecretArtifactKeyId,
    PRE_AGGREGATE_EXECUTION_SCOPE_ARTIFACT,
} from '../../utils/secretArtifactKeyId';
import { CIPHERTEXT_REGISTRY } from './registry';
import {
    classifyTokenHashes,
    rotateQueuedCreateProjectJobs,
    rotateRegisteredCiphertext,
    runSecretRotation,
    scanPreAggregateExecutionScopes,
} from './rotation';

const secrets = (active: string, ...fallbacks: string[]): LightdashSecrets => ({
    active,
    fallbacks,
    all: [active, ...fallbacks],
});

const encryptionFor = (keyring: LightdashSecrets) =>
    new EncryptionUtil({
        lightdashConfig: {
            lightdashSecret: keyring.active,
            lightdashSecrets: keyring,
        },
    });

const oldOnly = encryptionFor(secrets('old secret'));
const rotatedSecrets = secrets('new secret', 'old secret');
const rotatedEncryption = encryptionFor(rotatedSecrets);

const database = knex({ client: MockClient, dialect: 'pg' });
const context = {
    database: database as unknown as Knex,
    encryptionUtil: rotatedEncryption,
    lightdashSecrets: rotatedSecrets,
};

const TABLE_PRESENT = [{ table_name: 'present' }];

let tracker: Tracker;

beforeAll(() => {
    tracker = getTracker();
});

afterEach(() => {
    tracker.reset();
});

describe('ciphertext registry', () => {
    test('contains the full 25-field inventory', () => {
        expect(
            CIPHERTEXT_REGISTRY.map((e) => `${e.table}.${e.column}`),
        ).toEqual([
            'projects.dbt_connection',
            'warehouse_credentials.encrypted_credentials',
            'organization_warehouse_credentials.warehouse_connection',
            'user_warehouse_credentials.encrypted_credentials',
            'project_dbt_sources.dbt_connection',
            'warehouse_connect_codes.encrypted_credentials',
            'ssh_key_pairs.private_key',
            'github_app_installations.encrypted_installation_id',
            'gitlab_app_installations.encrypted_installation_id',
            'linear_app_installations.encrypted_installation_id',
            'linear_app_installations.encrypted_access_token',
            'linear_app_installations.encrypted_refresh_token',
            'git_user_credentials.encrypted_auth_token',
            'git_user_credentials.encrypted_refresh_token',
            'user_oauth_grants.encrypted_refresh_token',
            'organization_sso_configurations.config',
            'embedding.encoded_secret',
            'managed_agent_settings.service_account_token',
            'mobile_push_installations.encrypted_device_token',
            'mobile_push_installations.encrypted_push_to_start_token',
            'ai_agent_live_activities.encrypted_push_token',
            'ai_mcp_server_credential.encrypted_credentials',
            'ai_organization_settings.encrypted_provider_api_keys',
            'external_connection_secrets.encrypted_payload',
            'dbt_cloud_integrations.service_token',
        ]);
    });
});

describe('rotateRegisteredCiphertext', () => {
    const onlyOAuthGrants = {
        execute: false,
        batchSize: 500,
        tables: ['user_oauth_grants'],
    };

    const grantRow = (uuid: string, ciphertext: Buffer) => ({
        user_oauth_grant_uuid: uuid,
        encrypted_refresh_token: ciphertext,
    });

    test('dry-run counts fallback ciphertext without updating', async () => {
        tracker.on.any(/information_schema/).response(TABLE_PRESENT);
        tracker.on
            .select('user_oauth_grants')
            .response([
                grantRow('grant-1', oldOnly.encrypt('refresh-token')),
                grantRow('grant-2', rotatedEncryption.encrypt('refresh-token')),
            ]);

        const [result] = await rotateRegisteredCiphertext(
            context,
            onlyOAuthGrants,
        );

        expect(result).toMatchObject({
            table: 'user_oauth_grants',
            scanned: 2,
            active: 1,
            fallback: 1,
            reEncrypted: 0,
            concurrentSkips: 0,
            unreadablePrimaryKeys: [],
        });
        expect(tracker.history.update).toHaveLength(0);
    });

    test('execute re-encrypts fallback ciphertext with a compare-and-swap', async () => {
        const fallbackCiphertext = oldOnly.encrypt('refresh-token');
        tracker.on.any(/information_schema/).response(TABLE_PRESENT);
        tracker.on
            .select('user_oauth_grants')
            .response([grantRow('grant-1', fallbackCiphertext)]);
        tracker.on.update('user_oauth_grants').responseOnce(1);

        const [result] = await rotateRegisteredCiphertext(context, {
            ...onlyOAuthGrants,
            execute: true,
        });

        expect(result).toMatchObject({
            fallback: 1,
            reEncrypted: 1,
            concurrentSkips: 0,
        });
        expect(tracker.history.update).toHaveLength(1);
        const updateBindings = tracker.history.update[0].bindings;
        expect(updateBindings).toContain('grant-1');
        expect(
            updateBindings.some(
                (binding) =>
                    Buffer.isBuffer(binding) &&
                    binding.equals(fallbackCiphertext),
            ),
        ).toBe(true);
        const newCiphertext = updateBindings.find(
            (binding) =>
                Buffer.isBuffer(binding) && !binding.equals(fallbackCiphertext),
        ) as Buffer;
        expect(
            encryptionFor(secrets('new secret')).decrypt(newCiphertext),
        ).toEqual('refresh-token');
    });

    test('records a compare-and-swap miss as a concurrent skip', async () => {
        tracker.on.any(/information_schema/).response(TABLE_PRESENT);
        tracker.on
            .select('user_oauth_grants')
            .response([grantRow('grant-1', oldOnly.encrypt('refresh-token'))]);
        tracker.on.update('user_oauth_grants').responseOnce(0);

        const [result] = await rotateRegisteredCiphertext(context, {
            ...onlyOAuthGrants,
            execute: true,
        });

        expect(result).toMatchObject({
            fallback: 1,
            reEncrypted: 0,
            concurrentSkips: 1,
        });
    });

    test('reports unreadable ciphertext without modifying it and keeps scanning', async () => {
        tracker.on.any(/information_schema/).response(TABLE_PRESENT);
        tracker.on
            .select('user_oauth_grants')
            .response([
                grantRow(
                    'grant-bad',
                    encryptionFor(secrets('unknown secret')).encrypt('lost'),
                ),
                grantRow('grant-2', oldOnly.encrypt('refresh-token')),
            ]);
        tracker.on.update('user_oauth_grants').responseOnce(1);

        const [result] = await rotateRegisteredCiphertext(context, {
            ...onlyOAuthGrants,
            execute: true,
        });

        expect(result.unreadablePrimaryKeys).toEqual(['grant-bad']);
        expect(result.reEncrypted).toEqual(1);
        expect(tracker.history.update).toHaveLength(1);
    });

    test('skips absent tables without querying them', async () => {
        tracker.on.any(/information_schema/).response(undefined);

        const [result] = await rotateRegisteredCiphertext(
            context,
            onlyOAuthGrants,
        );

        expect(result.tablePresent).toBeFalsy();
        expect(result.scanned).toEqual(0);
        expect(
            tracker.history.all.filter((query) =>
                query.sql.includes('user_oauth_grants'),
            ),
        ).toHaveLength(0);
    });

    test('excludes null values in the query and paginates by primary key', async () => {
        tracker.on.any(/information_schema/).response(TABLE_PRESENT);
        tracker.on
            .select('user_oauth_grants')
            .responseOnce([
                grantRow('grant-1', rotatedEncryption.encrypt('a')),
                grantRow('grant-2', rotatedEncryption.encrypt('b')),
            ]);
        tracker.on
            .select('user_oauth_grants')
            .responseOnce([
                grantRow('grant-3', rotatedEncryption.encrypt('c')),
            ]);

        const [result] = await rotateRegisteredCiphertext(context, {
            ...onlyOAuthGrants,
            batchSize: 2,
        });

        expect(result.scanned).toEqual(3);
        const tableSelects = tracker.history.select.filter((query) =>
            query.sql.includes('user_oauth_grants'),
        );
        expect(tableSelects).toHaveLength(2);
        expect(tableSelects[0].sql).toContain('is not null');
        expect(tableSelects[1].bindings).toContain('grant-2');
    });

    test('a rerun over converged ciphertext performs no updates', async () => {
        tracker.on.any(/information_schema/).response(TABLE_PRESENT);
        tracker.on
            .select('user_oauth_grants')
            .response([
                grantRow('grant-1', rotatedEncryption.encrypt('refresh-token')),
            ]);

        const [result] = await rotateRegisteredCiphertext(context, {
            ...onlyOAuthGrants,
            execute: true,
        });

        expect(result).toMatchObject({ active: 1, fallback: 0 });
        expect(tracker.history.update).toHaveLength(0);
    });

    test('lifecycle: A-active ciphertext migrates under B-active/A-fallback and reads with B only', async () => {
        // Stage 1: pre-rotation, A ("old secret") is the only secret
        const preRotationCiphertext = oldOnly.encrypt('warehouse-password');
        expect(oldOnly.decrypt(preRotationCiphertext)).toEqual(
            'warehouse-password',
        );

        // Stage 2: B active with A as fallback — run the migration
        tracker.on.any(/information_schema/).response(TABLE_PRESENT);
        tracker.on
            .select('user_oauth_grants')
            .response([grantRow('grant-1', preRotationCiphertext)]);
        tracker.on.update('user_oauth_grants').responseOnce(1);

        const [result] = await rotateRegisteredCiphertext(context, {
            ...onlyOAuthGrants,
            execute: true,
        });
        expect(result).toMatchObject({ fallback: 1, reEncrypted: 1 });

        const migratedCiphertext = tracker.history.update[0].bindings.find(
            (binding) =>
                Buffer.isBuffer(binding) &&
                !binding.equals(preRotationCiphertext),
        ) as Buffer;

        // Stage 3: A removed — B alone reads the value, A alone cannot
        expect(
            encryptionFor(secrets('new secret')).decrypt(migratedCiphertext),
        ).toEqual('warehouse-password');
        expect(() => oldOnly.decrypt(migratedCiphertext)).toThrow();
    });
});

describe('rotateQueuedCreateProjectJobs', () => {
    test('scans only unlocked jobs and re-encrypts with guarded updates', async () => {
        const oldPayload = oldOnly.encrypt('{"name":"p"}').toString('base64');
        tracker.on.any(/information_schema/).response(TABLE_PRESENT);
        tracker.on
            .any(/graphile_worker\.jobs/)
            .responseOnce({ rows: [{ id: '7', data: oldPayload }] });
        tracker.on.any(/graphile_worker\.jobs/).responseOnce({ rowCount: 1 });

        const result = await rotateQueuedCreateProjectJobs(context, {
            execute: true,
            batchSize: 500,
        });

        expect(result).toMatchObject({
            scanned: 1,
            fallback: 1,
            reEncrypted: 1,
            concurrentSkips: 0,
        });
        const rawQueries = tracker.history.all.filter((query) =>
            query.sql.includes('graphile_worker.jobs'),
        );
        expect(rawQueries[0].sql).toContain('locked_at IS NULL');
        expect(rawQueries[0].sql).toContain('LIMIT');
        expect(rawQueries[1].sql).toContain('locked_at IS NULL');
        expect(rawQueries[1].sql).toContain("payload->>'data' =");
        expect(rawQueries[1].bindings).toContain('7');
        expect(rawQueries[1].bindings).toContain(oldPayload);

        // The written value must round-trip: base64 payload back through
        // decode + decrypt with the new secret alone
        const rewrittenPayload = rawQueries[1].bindings.find(
            (binding) =>
                typeof binding === 'string' &&
                binding !== '7' &&
                binding !== oldPayload,
        ) as string;
        expect(
            encryptionFor(secrets('new secret')).decrypt(
                Buffer.from(rewrittenPayload, 'base64'),
            ),
        ).toEqual('{"name":"p"}');
    });

    test('paginates unlocked jobs by id with the configured batch size', async () => {
        const payloadFor = (name: string) =>
            oldOnly.encrypt(`{"name":"${name}"}`).toString('base64');
        tracker.on.any(/information_schema/).response(TABLE_PRESENT);
        tracker.on.any(/graphile_worker\.jobs/).responseOnce({
            rows: [
                { id: '1', data: payloadFor('a') },
                { id: '2', data: payloadFor('b') },
            ],
        });
        tracker.on.any(/graphile_worker\.jobs/).responseOnce({
            rows: [{ id: '3', data: payloadFor('c') }],
        });

        const result = await rotateQueuedCreateProjectJobs(context, {
            execute: false,
            batchSize: 2,
        });

        expect(result).toMatchObject({ scanned: 3, fallback: 3 });
        const selects = tracker.history.all.filter((query) =>
            query.sql.includes('SELECT id'),
        );
        expect(selects).toHaveLength(2);
        expect(selects[0].sql).not.toContain('id >');
        expect(selects[1].sql).toContain('id >');
        expect(selects[1].bindings).toContain('2');
    });

    test('records a concurrently changed payload as a skip', async () => {
        const oldPayload = oldOnly.encrypt('{"name":"p"}').toString('base64');
        tracker.on.any(/information_schema/).response(TABLE_PRESENT);
        tracker.on
            .any(/graphile_worker\.jobs/)
            .responseOnce({ rows: [{ id: '7', data: oldPayload }] });
        tracker.on.any(/graphile_worker\.jobs/).responseOnce({ rowCount: 0 });

        const result = await rotateQueuedCreateProjectJobs(context, {
            execute: true,
            batchSize: 500,
        });

        expect(result).toMatchObject({ concurrentSkips: 1, reEncrypted: 0 });
    });

    test('reports undecryptable job payloads', async () => {
        tracker.on.any(/information_schema/).response(TABLE_PRESENT);
        tracker.on.any(/graphile_worker\.jobs/).responseOnce({
            rows: [{ id: '9', data: 'bm90LWEtY2lwaGVydGV4dA==' }],
        });

        const result = await rotateQueuedCreateProjectJobs(context, {
            execute: false,
            batchSize: 500,
        });

        expect(result.unreadableJobIds).toEqual(['9']);
    });
});

describe('classifyTokenHashes', () => {
    test('classifies by canonical bcrypt prefix, legacy sha256 and unknown', async () => {
        // 'new secret' is a secret whose raw derived salt differs from the
        // canonical prefix bcrypt stores, which is exactly why sentinel
        // hashes are required for classification.
        const activeHash = await hashWithSecret('token-a', 'new secret');
        expect(activeHash.startsWith(deriveTokenHashSalt('new secret'))).toBe(
            false,
        );
        const fallbackHash = await hashWithSecret('token-b', 'old secret');
        const legacyHash =
            '3c469e9d6c5875d37a43f353d4f88e61fcf812c66eee3457465a40b0da4153e0';

        tracker.on.any(/information_schema/).response(TABLE_PRESENT);
        tracker.on
            .select('personal_access_tokens')
            .response([
                { token_hash: activeHash },
                { token_hash: fallbackHash },
                { token_hash: legacyHash },
                { token_hash: 'garbage' },
            ]);
        tracker.on
            .select('service_accounts')
            .response([{ token_hash: fallbackHash }]);

        const [patResult, serviceAccountResult] = await classifyTokenHashes(
            context,
            { batchSize: 500 },
        );

        expect(patResult).toMatchObject({
            table: 'personal_access_tokens',
            total: 4,
            active: 1,
            fallback: [1],
            legacySha256: 1,
            unknown: 1,
        });
        expect(serviceAccountResult).toMatchObject({
            table: 'service_accounts',
            total: 1,
            active: 0,
            fallback: [1],
        });
    });

    test('reports absent token tables without querying them', async () => {
        tracker.on.any(/information_schema/).response(undefined);

        const results = await classifyTokenHashes(context, { batchSize: 500 });

        expect(results).toHaveLength(2);
        expect(results[0].tablePresent).toBeFalsy();
        expect(results[0].total).toEqual(0);
    });

    test('paginates token hashes by primary key with the configured batch size', async () => {
        const fallbackHash = await hashWithSecret('token', 'old secret');
        tracker.on.any(/information_schema/).response(TABLE_PRESENT);
        tracker.on.select('personal_access_tokens').responseOnce([
            { token_hash: fallbackHash, personal_access_token_uuid: 'pat-1' },
            { token_hash: fallbackHash, personal_access_token_uuid: 'pat-2' },
        ]);
        tracker.on.select('personal_access_tokens').responseOnce([
            {
                token_hash: fallbackHash,
                personal_access_token_uuid: 'pat-3',
            },
        ]);
        tracker.on.select('service_accounts').response([]);

        const [patResult] = await classifyTokenHashes(context, {
            batchSize: 2,
        });

        expect(patResult).toMatchObject({ total: 3, fallback: [3] });
        const patSelects = tracker.history.select.filter((query) =>
            query.sql.includes('personal_access_tokens'),
        );
        expect(patSelects).toHaveLength(2);
        expect(patSelects[0].sql).toContain('limit');
        expect(patSelects[1].bindings).toContain('pat-2');
    });
});

const scopeRow = (
    uuid: string,
    secret: string,
    status: 'active' | 'in_progress' = 'active',
) => ({
    pre_aggregate_materialization_uuid: uuid,
    pre_aggregate_definition_uuid: `definition-${uuid}`,
    status,
    execution_scope_key_id: getSecretArtifactKeyId(
        secret,
        PRE_AGGREGATE_EXECUTION_SCOPE_ARTIFACT,
    ),
});

describe('scanPreAggregateExecutionScopes', () => {
    test('classifies live proofs by active, each fallback, or unknown key', async () => {
        tracker.on.any(/information_schema/).response(true);
        tracker.on
            .select('pre_aggregate_materializations')
            .response([
                scopeRow('mat-1', 'new secret'),
                scopeRow('mat-2', 'old secret', 'in_progress'),
                scopeRow('mat-3', 'older secret'),
                scopeRow('mat-4', 'unknown secret'),
            ]);

        const result = await scanPreAggregateExecutionScopes(
            {
                ...context,
                lightdashSecrets: secrets(
                    'new secret',
                    'old secret',
                    'older secret',
                ),
            },
            { batchSize: 500 },
        );

        expect(result).toEqual({
            tablePresent: true,
            columnPresent: true,
            scanned: 4,
            active: 1,
            fallback: [1, 1],
            unknown: 1,
            blockingMaterializations: [
                {
                    materializationUuid: 'mat-2',
                    definitionUuid: 'definition-mat-2',
                    status: 'in_progress',
                    keySource: { type: 'fallback', fallbackIndex: 0 },
                },
                {
                    materializationUuid: 'mat-3',
                    definitionUuid: 'definition-mat-3',
                    status: 'active',
                    keySource: { type: 'fallback', fallbackIndex: 1 },
                },
                {
                    materializationUuid: 'mat-4',
                    definitionUuid: 'definition-mat-4',
                    status: 'active',
                    keySource: { type: 'unknown' },
                },
            ],
            blockingMaterializationsTruncated: false,
        });
        expect(tracker.history.update).toHaveLength(0);
    });

    test('filters out terminal statuses and secret-independent scopes, paginating by UUID', async () => {
        tracker.on.any(/information_schema/).response(true);
        tracker.on
            .select('pre_aggregate_materializations')
            .responseOnce([
                scopeRow('mat-1', 'new secret'),
                scopeRow('mat-2', 'old secret'),
            ]);
        tracker.on
            .select('pre_aggregate_materializations')
            .responseOnce([scopeRow('mat-3', 'old secret', 'in_progress')]);

        const result = await scanPreAggregateExecutionScopes(context, {
            batchSize: 2,
        });

        expect(result).toMatchObject({ scanned: 3, active: 1, fallback: [2] });
        const queries = tracker.history.select.filter((query) =>
            query.sql.includes('from "pre_aggregate_materializations"'),
        );
        expect(queries).toHaveLength(2);
        for (const query of queries) {
            expect(query.sql).toContain('"status" in ($1, $2)');
            expect(query.bindings.slice(0, 2)).toEqual([
                'active',
                'in_progress',
            ]);
            expect(query.sql).toContain('"execution_scope_key_id" is not null');
            expect(query.sql).toContain(
                'order by "pre_aggregate_materialization_uuid" asc limit',
            );
            expect(query.bindings.at(-1)).toEqual(2);
        }
        expect(queries[1].bindings).toContain('mat-2');
        expect(queries[1].sql).toContain(
            '"pre_aggregate_materialization_uuid" >',
        );
    });

    test.each([
        { tablePresent: false, columnPresent: false },
        { tablePresent: true, columnPresent: false },
    ])('tolerates an older schema: %j', async (presence) => {
        tracker.on
            .any(/information_schema.*tables/)
            .response(presence.tablePresent);
        tracker.on.any(/information_schema.*columns/).response(false);

        const result = await scanPreAggregateExecutionScopes(context, {
            batchSize: 500,
        });

        expect(result).toMatchObject({ ...presence, scanned: 0 });
        expect(
            tracker.history.select.filter((query) =>
                query.sql.includes('from "pre_aggregate_materializations"'),
            ),
        ).toHaveLength(0);
    });

    test('an empty enterprise table has no blockers', async () => {
        tracker.on.any(/information_schema/).response(true);
        tracker.on.select('pre_aggregate_materializations').response([]);

        const result = await scanPreAggregateExecutionScopes(context, {
            batchSize: 500,
        });

        expect(result).toMatchObject({
            tablePresent: true,
            columnPresent: true,
            scanned: 0,
            fallback: [0],
            unknown: 0,
            blockingMaterializations: [],
        });
    });

    test('caps reported IDs while counting every blocking materialization', async () => {
        tracker.on.any(/information_schema/).response(true);
        tracker.on
            .select('pre_aggregate_materializations')
            .response(
                Array.from({ length: 101 }, (_, index) =>
                    scopeRow(`mat-${index}`, 'old secret'),
                ),
            );

        const result = await scanPreAggregateExecutionScopes(context, {
            batchSize: 500,
        });

        expect(result.scanned).toBe(101);
        expect(result.fallback).toEqual([101]);
        expect(result.blockingMaterializations).toHaveLength(100);
        expect(result.blockingMaterializationsTruncated).toBe(true);
    });

    test('reclassifies proofs when the active and fallback secrets switch', async () => {
        tracker.on.any(/information_schema/).response(true);
        tracker.on
            .select('pre_aggregate_materializations')
            .response([scopeRow('mat-1', 'new secret')]);

        const activeResult = await scanPreAggregateExecutionScopes(context, {
            batchSize: 500,
        });
        const rollbackResult = await scanPreAggregateExecutionScopes(
            {
                ...context,
                lightdashSecrets: secrets('old secret', 'new secret'),
            },
            { batchSize: 500 },
        );
        const removedResult = await scanPreAggregateExecutionScopes(
            { ...context, lightdashSecrets: secrets('old secret') },
            { batchSize: 500 },
        );

        expect(activeResult).toMatchObject({ active: 1, fallback: [0] });
        expect(rollbackResult).toMatchObject({ active: 0, fallback: [1] });
        expect(removedResult).toMatchObject({ active: 0, unknown: 1 });
    });
});

describe('runSecretRotation blockers', () => {
    test('reports blockers for pending fallback state', async () => {
        tracker.on.any(/information_schema/).response(TABLE_PRESENT);
        tracker.on.any(/graphile_worker\.jobs/).response({ rows: [] });
        tracker.on.select('user_oauth_grants').response([
            {
                user_oauth_grant_uuid: 'grant-1',
                encrypted_refresh_token: oldOnly.encrypt('refresh-token'),
            },
        ]);
        tracker.on.select('personal_access_tokens').response([]);
        tracker.on.select('pre_aggregate_materializations').response([]);
        tracker.on
            .select('service_accounts')
            .response([
                { token_hash: await hashWithSecret('token', 'old secret') },
            ]);

        const report = await runSecretRotation(context, {
            execute: false,
            batchSize: 500,
            tables: ['user_oauth_grants'],
        });

        expect(report.hasUnreadableValues).toBe(false);
        expect(report.blockers).toEqual([
            '1 registered ciphertext value(s) still require a fallback secret',
            '1 token hash(es) still derive from a fallback secret; reissue or revoke the credentials before removing the fallback',
        ]);
    });

    test('reports no blockers when everything has converged', async () => {
        tracker.on.any(/information_schema/).response(TABLE_PRESENT);
        tracker.on.any(/graphile_worker\.jobs/).response({ rows: [] });
        tracker.on.select('user_oauth_grants').response([
            {
                user_oauth_grant_uuid: 'grant-1',
                encrypted_refresh_token:
                    rotatedEncryption.encrypt('refresh-token'),
            },
        ]);
        tracker.on.select('personal_access_tokens').response([]);
        tracker.on.select('service_accounts').response([]);
        tracker.on.select('pre_aggregate_materializations').response([]);

        const report = await runSecretRotation(context, {
            execute: false,
            batchSize: 500,
            tables: ['user_oauth_grants'],
        });

        expect(report.blockers).toEqual([]);
        expect(report.hasUnreadableValues).toBe(false);
    });

    test.each([false, true])(
        'reports live-proof blockers without rewriting them (execute=%s)',
        async (execute) => {
            tracker.on.any(/information_schema/).response(TABLE_PRESENT);
            tracker.on.any(/graphile_worker\.jobs/).response({ rows: [] });
            tracker.on.select('personal_access_tokens').response([]);
            tracker.on.select('service_accounts').response([]);
            tracker.on
                .select('pre_aggregate_materializations')
                .response([
                    scopeRow('mat-1', 'old secret'),
                    scopeRow('mat-2', 'unknown secret', 'in_progress'),
                ]);

            const report = await runSecretRotation(context, {
                execute,
                batchSize: 500,
                tables: [],
            });

            expect(report.blockers).toEqual([
                '1 live pre-aggregate materialization(s) still require a fallback secret; manually refresh affected definitions under the active secret and drain or cancel old attempts before removing the fallback',
                '1 live pre-aggregate materialization(s) have execution scopes from no configured secret; manually refresh affected definitions and drain or cancel old attempts',
            ]);
            expect(report.hasUnreadableValues).toBe(true);
            expect(tracker.history.update).toHaveLength(0);
        },
    );

    test('clears the removal gate after refreshing and settling old attempts', async () => {
        tracker.on.any(/information_schema/).response(TABLE_PRESENT);
        tracker.on.any(/graphile_worker\.jobs/).response({ rows: [] });
        tracker.on.select('personal_access_tokens').response([]);
        tracker.on.select('service_accounts').response([]);
        tracker.on
            .select('pre_aggregate_materializations')
            .responseOnce([scopeRow('old-materialization', 'old secret')]);
        tracker.on
            .select('pre_aggregate_materializations')
            .responseOnce([
                scopeRow('refreshed-materialization', 'new secret'),
            ]);

        const options = { execute: false, batchSize: 500, tables: [] };
        const before = await runSecretRotation(context, options);
        const after = await runSecretRotation(context, options);

        expect(before.blockers).toHaveLength(1);
        expect(before.hasUnreadableValues).toBe(false);
        expect(after.blockers).toEqual([]);
        expect(after.hasUnreadableValues).toBe(false);
        expect(after.preAggregateExecutionScopes).toMatchObject({
            active: 1,
            fallback: [0],
        });
    });
});
