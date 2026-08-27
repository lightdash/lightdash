import knex, { type Knex } from 'knex';
import { getTracker, MockClient, type Tracker } from 'knex-mock-client';
import { type LightdashSecrets } from '../../config/parseConfig';
import { EncryptionUtil } from '../../utils/EncryptionUtil/EncryptionUtil';
import { deriveTokenHashSalt, hashWithSecret } from '../../utils/hash';
import { CIPHERTEXT_REGISTRY } from './registry';
import {
    classifyTokenHashes,
    rotateQueuedCreateProjectJobs,
    rotateRegisteredCiphertext,
    runSecretRotation,
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
    test('contains the full 22-field inventory', () => {
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

        const report = await runSecretRotation(context, {
            execute: false,
            batchSize: 500,
            tables: ['user_oauth_grants'],
        });

        expect(report.blockers).toEqual([]);
        expect(report.hasUnreadableValues).toBe(false);
    });
});
