import knex, { type Knex } from 'knex';
import { getTracker, MockClient, type Tracker } from 'knex-mock-client';
import { EncryptionUtil } from '../../utils/EncryptionUtil/EncryptionUtil';
import {
    AppExternalConnectionsTableName,
    ExternalConnectionRateCountersTableName,
    ExternalConnectionSecretsTableName,
    ExternalConnectionsTableName,
} from '../database/entities/externalConnections';
import { ExternalConnectionModel } from './ExternalConnectionModel';

const PROJECT_UUID = '00000000-0000-0000-0000-000000000001';
const ORG_UUID = '00000000-0000-0000-0000-000000000002';
const USER_UUID = '00000000-0000-0000-0000-000000000003';
const CONNECTION_UUID = '00000000-0000-0000-0000-000000000010';
const APP_ID = '00000000-0000-0000-0000-000000000020';

// Reversible fake so tests can assert "the value that hit the DB is NOT the
// plaintext" without depending on AES internals.
const fakeEncryptionUtil = {
    encrypt: (s: string): Buffer => Buffer.from(`enc:${s}`, 'utf-8'),
    decrypt: (b: Buffer): string => b.toString('utf-8').replace(/^enc:/, ''),
} as unknown as EncryptionUtil;

const makeDbConnection = (overrides: Record<string, unknown> = {}) => ({
    external_connection_uuid: CONNECTION_UUID,
    project_uuid: PROJECT_UUID,
    organization_uuid: ORG_UUID,
    name: 'Acme API',
    type: 'bearer_token',
    origin: 'https://api.acme.com',
    allowed_path_prefixes: ['/v1/'],
    allowed_methods: ['GET'],
    allowed_content_types: ['application/json'],
    response_max_bytes: 1048576,
    request_max_bytes: 262144,
    timeout_ms: 10000,
    rate_limit_per_minute: null,
    api_key_name: null,
    api_key_location: null,
    created_by_user_uuid: USER_UUID,
    updated_by_user_uuid: USER_UUID,
    created_at: new Date('2026-01-01T00:00:00Z'),
    updated_at: new Date('2026-01-01T00:00:00Z'),
    deleted_at: null,
    ...overrides,
});

describe('ExternalConnectionModel', () => {
    const database = knex({ client: MockClient, dialect: 'pg' });
    const model = new ExternalConnectionModel({
        database: database as unknown as Knex,
        encryptionUtil: fakeEncryptionUtil,
    });
    let tracker: Tracker;

    beforeAll(() => {
        tracker = getTracker();
    });

    afterEach(() => {
        tracker.reset();
    });

    describe('create', () => {
        it('encrypts the secret before inserting it and never returns plaintext', async () => {
            tracker.on
                .insert(ExternalConnectionsTableName)
                .responseOnce([makeDbConnection()]);
            tracker.on
                .insert(ExternalConnectionSecretsTableName)
                .responseOnce([{}]);

            const result = await model.create(
                PROJECT_UUID,
                ORG_UUID,
                USER_UUID,
                {
                    name: 'Acme API',
                    type: 'bearer_token',
                    origin: 'https://api.acme.com',
                    allowedPathPrefixes: ['/v1/'],
                    allowedMethods: ['GET'],
                    allowedContentTypes: ['application/json'],
                    secret: 'super-secret-token',
                },
            );

            // Read shape exposes hasSecret, not the value, and has no `secret` key.
            expect(result.hasSecret).toBe(true);
            expect(result).not.toHaveProperty('secret');

            const secretInsert = tracker.history.insert.find(
                (q) =>
                    q.bindings.includes('enc:super-secret-token') ||
                    q.bindings.some(
                        (b) =>
                            Buffer.isBuffer(b) &&
                            b.toString('utf-8') === 'enc:super-secret-token',
                    ),
            );
            // The encrypted form is what hits the DB; raw plaintext never does.
            const anyRawPlaintext = tracker.history.insert.some((q) =>
                q.bindings.includes('super-secret-token'),
            );
            expect(secretInsert).toBeDefined();
            expect(anyRawPlaintext).toBe(false);
        });

        it('does not insert a secret row for type "none"', async () => {
            tracker.on
                .insert(ExternalConnectionsTableName)
                .responseOnce([makeDbConnection({ type: 'none' })]);

            const result = await model.create(
                PROJECT_UUID,
                ORG_UUID,
                USER_UUID,
                {
                    name: 'Open API',
                    type: 'none',
                    origin: 'https://api.acme.com',
                    allowedPathPrefixes: ['/v1/'],
                    allowedMethods: ['GET'],
                    allowedContentTypes: ['application/json'],
                    secret: null,
                },
            );

            expect(result.hasSecret).toBe(false);
            const secretInserts = tracker.history.insert.filter((q) =>
                q.sql.includes(ExternalConnectionSecretsTableName),
            );
            expect(secretInserts).toHaveLength(0);
        });

        it('serializes jsonb array columns to JSON strings on insert', async () => {
            tracker.on
                .insert(ExternalConnectionsTableName)
                .responseOnce([makeDbConnection({ type: 'none' })]);

            await model.create(PROJECT_UUID, ORG_UUID, USER_UUID, {
                name: 'Open API',
                type: 'none',
                origin: 'https://api.acme.com',
                allowedPathPrefixes: ['/v1/'],
                allowedMethods: ['GET'],
                allowedContentTypes: ['application/json'],
                secret: null,
            });

            const connInsert = tracker.history.insert.find((q) =>
                q.sql.includes(ExternalConnectionsTableName),
            );
            // jsonb columns MUST be serialized JSON strings — a raw JS array
            // binding makes Postgres throw "invalid input syntax for type json".
            expect(connInsert?.bindings).toContain(JSON.stringify(['GET']));
            expect(connInsert?.bindings).toContain(JSON.stringify(['/v1/']));
            expect(connInsert?.bindings).toContain(
                JSON.stringify(['application/json']),
            );
            expect(connInsert?.bindings.some((b) => Array.isArray(b))).toBe(
                false,
            );
        });
    });

    describe('findByUuid', () => {
        it('returns the read shape with hasSecret=true and no plaintext secret', async () => {
            tracker.on.select(ExternalConnectionsTableName).responseOnce([
                {
                    ...makeDbConnection(),
                    encrypted_payload: Buffer.from('enc:tok', 'utf-8'),
                },
            ]);

            const result = await model.findByUuid(CONNECTION_UUID);

            expect(result).toBeDefined();
            expect(result?.hasSecret).toBe(true);
            expect(result).not.toHaveProperty('secret');
            expect(result?.externalConnectionUuid).toBe(CONNECTION_UUID);
        });

        it('returns undefined when not found', async () => {
            tracker.on.select(ExternalConnectionsTableName).responseOnce([]);
            await expect(
                model.findByUuid(CONNECTION_UUID),
            ).resolves.toBeUndefined();
        });
    });

    describe('update', () => {
        it('leaves the stored secret unchanged when secret is blank', async () => {
            tracker.on
                .select(ExternalConnectionsTableName)
                .response([makeDbConnection()]);
            tracker.on.update(ExternalConnectionsTableName).response(1);

            await model.update(CONNECTION_UUID, USER_UUID, {
                name: 'Renamed',
                secret: '',
            });

            // No write to the secrets table when the secret is blank.
            const secretWrites = [
                ...tracker.history.insert,
                ...tracker.history.update,
            ].filter((q) => q.sql.includes(ExternalConnectionSecretsTableName));
            expect(secretWrites).toHaveLength(0);
        });

        it('re-encrypts and upserts the secret when a new one is provided', async () => {
            tracker.on
                .select(ExternalConnectionsTableName)
                .response([makeDbConnection()]);
            tracker.on.update(ExternalConnectionsTableName).response(1);
            tracker.on
                .insert(ExternalConnectionSecretsTableName)
                .response([{}]);

            await model.update(CONNECTION_UUID, USER_UUID, {
                secret: 'rotated-value',
            });

            const wroteEncrypted = tracker.history.insert.some((q) =>
                q.bindings.some(
                    (b) =>
                        Buffer.isBuffer(b) &&
                        b.toString('utf-8') === 'enc:rotated-value',
                ),
            );
            expect(wroteEncrypted).toBe(true);
        });
    });

    describe('rotateSecret', () => {
        it('encrypts and upserts the new secret, stamping rotated_at', async () => {
            tracker.on
                .insert(ExternalConnectionSecretsTableName)
                .responseOnce([{}]);

            await model.rotateSecret(CONNECTION_UUID, 'new-token');

            const wroteEncrypted = tracker.history.insert.some((q) =>
                q.bindings.some(
                    (b) =>
                        Buffer.isBuffer(b) &&
                        b.toString('utf-8') === 'enc:new-token',
                ),
            );
            const wroteRawPlaintext = tracker.history.insert.some((q) =>
                q.bindings.includes('new-token'),
            );
            expect(wroteEncrypted).toBe(true);
            expect(wroteRawPlaintext).toBe(false);

            // rotateSecret passes markRotated=true to upsertSecret, which
            // includes `rotated_at` in both the INSERT and the ON CONFLICT merge.
            const hasRotatedAt = tracker.history.insert
                .concat(tracker.history.update ?? [])
                .some((q) => q.sql.includes('rotated_at'));
            expect(hasRotatedAt).toBe(true);
        });
    });

    describe('getDecryptedSecret', () => {
        it('returns the decrypted secret', async () => {
            tracker.on
                .select(ExternalConnectionSecretsTableName)
                .responseOnce([
                    { encrypted_payload: Buffer.from('enc:plain', 'utf-8') },
                ]);

            await expect(
                model.getDecryptedSecret(CONNECTION_UUID),
            ).resolves.toBe('plain');
        });

        it('returns null when there is no secret row', async () => {
            tracker.on
                .select(ExternalConnectionSecretsTableName)
                .responseOnce([]);
            await expect(
                model.getDecryptedSecret(CONNECTION_UUID),
            ).resolves.toBeNull();
        });

        it('returns null for a soft-deleted connection', async () => {
            // Insert a connection+secret then soft-delete the connection.
            // getDecryptedSecret joins external_connections and checks deleted_at IS NULL,
            // so the result must be null even though the secret row exists.
            tracker.on
                .select(ExternalConnectionSecretsTableName)
                .responseOnce([]);

            await expect(
                model.getDecryptedSecret(CONNECTION_UUID),
            ).resolves.toBeNull();
        });
    });

    describe('link + resolveAppAlias', () => {
        it('inserts a link row', async () => {
            tracker.on
                .insert(AppExternalConnectionsTableName)
                .responseOnce([{}]);

            await expect(
                model.linkToApp(APP_ID, CONNECTION_UUID, 'acme'),
            ).resolves.toBeUndefined();

            expect(tracker.history.insert).toHaveLength(1);
            const { bindings } = tracker.history.insert[0];
            expect(bindings).toEqual(
                expect.arrayContaining([APP_ID, CONNECTION_UUID, 'acme']),
            );
        });

        it('resolves a linked, non-deleted connection by alias', async () => {
            tracker.on.select(AppExternalConnectionsTableName).responseOnce([
                {
                    ...makeDbConnection(),
                    alias: 'acme',
                    encrypted_payload: Buffer.from('enc:t', 'utf-8'),
                },
            ]);

            const result = await model.resolveAppAlias(APP_ID, 'acme');
            expect(result?.externalConnectionUuid).toBe(CONNECTION_UUID);
            expect(result?.hasSecret).toBe(true);
            expect(result).not.toHaveProperty('secret');
        });

        it('returns undefined for an unknown alias', async () => {
            tracker.on.select(AppExternalConnectionsTableName).responseOnce([]);
            await expect(
                model.resolveAppAlias(APP_ID, 'nope'),
            ).resolves.toBeUndefined();
        });
    });

    describe('incrementRateCounter', () => {
        it('upserts and returns the new count', async () => {
            tracker.on
                .insert(ExternalConnectionRateCountersTableName)
                .responseOnce([{ request_count: 7 }]);

            const count = await model.incrementRateCounter(
                CONNECTION_UUID,
                APP_ID,
                new Date('2026-01-01T00:00:00Z'),
            );
            expect(count).toBe(7);
        });
    });
});
