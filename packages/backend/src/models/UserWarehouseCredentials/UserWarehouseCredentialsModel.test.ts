import {
    AthenaAuthenticationType,
    BigqueryAuthenticationType,
    BigqueryTokenError,
    ParameterError,
    SnowflakeAuthenticationType,
    UserWarehouseCredentialPurpose,
    WarehouseTypes,
} from '@lightdash/common';
import knex, { Knex } from 'knex';
import { getTracker, MockClient } from 'knex-mock-client';
import { lightdashConfigWithGoogleOAuthMock } from '../../config/lightdashConfig.mock';
import { DbUserWarehouseCredentials } from '../../database/entities/userWarehouseCredentials';
import { EncryptionUtil } from '../../utils/EncryptionUtil/EncryptionUtil';
import { UserWarehouseCredentialsModel } from './UserWarehouseCredentialsModel';

const passthroughEncryption = {
    encrypt: (value: string) => Buffer.from(value),
    decrypt: (value: Buffer) => value.toString(),
} as unknown as EncryptionUtil;

const validBigqueryCredentials = {
    type: WarehouseTypes.BIGQUERY,
    authenticationType: BigqueryAuthenticationType.SSO,
    keyfileContents: {
        type: 'authorized_user',
        client_id:
            lightdashConfigWithGoogleOAuthMock.auth.google.oauth2ClientId!,
        client_secret: 'client-secret',
        refresh_token: 'refresh-token',
    },
};

const brokenBigqueryCredentials = {
    type: WarehouseTypes.BIGQUERY,
    authenticationType: BigqueryAuthenticationType.SSO,
    keyfileContents: {},
};

const makeRow = (
    uuid: string,
    credentials: { type: WarehouseTypes; [key: string]: unknown },
): DbUserWarehouseCredentials & {
    project_name: string | null;
    project_type: null;
} => ({
    user_warehouse_credentials_uuid: uuid,
    user_uuid: 'user-1',
    name: 'Default',
    warehouse_type: credentials.type,
    encrypted_credentials: Buffer.from(JSON.stringify(credentials)),
    created_at: new Date(),
    updated_at: new Date(),
    expires_at: null,
    project_uuid: null,
    purpose: UserWarehouseCredentialPurpose.DEFAULT,
    project_name: null,
    project_type: null,
});

/**
 * Builds a model whose first database call resolves the preferred-credential
 * query (`.first()`) and whose second resolves the fallback query (awaited
 * directly as a row list).
 */
const createModel = ({
    preferredRow,
    fallbackRows,
    whereCalls,
}: {
    preferredRow: object | undefined;
    fallbackRows: object[];
    whereCalls?: unknown[][];
}) => {
    const makeBuilder = (result: {
        firstRow?: object;
        rows?: object[];
    }): Record<string, unknown> => {
        const builder: Record<string, unknown> = {};
        [
            'leftJoin',
            'select',
            'where',
            'andWhere',
            'orderByRaw',
            'orderBy',
        ].forEach((method) => {
            builder[method] = vi.fn((...args: unknown[]) => {
                if (method === 'where' || method === 'andWhere')
                    whereCalls?.push(args);
                return builder;
            });
        });
        builder.modify = vi.fn((callback: (query: typeof builder) => void) => {
            callback(builder);
            return builder;
        });
        builder.first = vi.fn(async () => result.firstRow);
        builder.then = (
            resolve: (rows: object[]) => unknown,
            reject: (error: unknown) => unknown,
        ) => Promise.resolve(result.rows ?? []).then(resolve, reject);
        return builder;
    };
    const builders = [
        makeBuilder({ firstRow: preferredRow }),
        makeBuilder({ rows: fallbackRows }),
    ];
    let call = 0;
    const database = vi.fn(() => {
        const builder = builders[call];
        call += 1;
        return builder;
    }) as unknown as Knex;
    return new UserWarehouseCredentialsModel({
        database,
        encryptionUtil: passthroughEncryption,
    });
};

describe('UserWarehouseCredentialsModel', () => {
    const sqlDatabase = knex({ client: MockClient, dialect: 'pg' });
    const tracker = getTracker();
    const credentialModel = new UserWarehouseCredentialsModel({
        database: sqlDatabase,
        encryptionUtil: passthroughEncryption,
    });
    beforeEach(() => tracker.reset());
    afterAll(async () => sqlDatabase.destroy());

    test.each([true, false])(
        'secret reads project nested BigQuery identity only when strict (%s)',
        async (strictPersonalOverlay) => {
            const row = makeRow('personal', {
                ...validBigqueryCredentials,
                keyfileContents: {
                    ...validBigqueryCredentials.keyfileContents,
                    quota_project_id: 'legacy-project',
                },
            });
            tracker.on.select('user_warehouse_credentials').response([row]);
            const result = await credentialModel.getByUuidWithSecrets(
                'personal',
                undefined,
                { strictPersonalOverlay },
            );
            const preferred = await credentialModel.findForProjectWithSecrets(
                'project',
                'user-1',
                WarehouseTypes.BIGQUERY,
                { strictPersonalOverlay },
            );
            expect(preferred?.credentials).toEqual(result.credentials);
            expect(result.credentials).toEqual(
                strictPersonalOverlay
                    ? validBigqueryCredentials
                    : JSON.parse(row.encrypted_credentials.toString()),
            );
        },
    );

    describe('hasOrganizationAiSnowflakeCredential', () => {
        test.each([true, false])(
            'returns %s for matching activation evidence',
            async (exists) => {
                tracker.on.select('user_warehouse_credentials').response(
                    exists
                        ? [
                              {
                                  user_warehouse_credentials_uuid: 'credential',
                                  encrypted_credentials: Buffer.from(
                                      JSON.stringify({
                                          type: WarehouseTypes.SNOWFLAKE,
                                      }),
                                  ),
                              },
                          ]
                        : [],
                );
                await expect(
                    credentialModel.hasOrganizationAiSnowflakeCredential(
                        'org',
                        null,
                    ),
                ).resolves.toBe(exists);
                const query = tracker.history.select[0];
                expect(query.sql).toContain(
                    'inner join "users" on "users"."user_uuid" = "user_warehouse_credentials"."user_uuid"',
                );
                expect(query.sql).toContain(
                    'inner join "organization_memberships" on "organization_memberships"."user_id" = "users"."user_id"',
                );
                expect(query.sql).toContain(
                    'inner join "organizations" on "organizations"."organization_id" = "organization_memberships"."organization_id"',
                );
                expect(query.sql).toContain(
                    'where "organizations"."organization_uuid" = $1 and "user_warehouse_credentials"."warehouse_type" = $2 and "user_warehouse_credentials"."purpose" = $3',
                );
                expect(query.sql).toContain(
                    'select "user_warehouse_credentials".*',
                );
                expect(query.bindings).toEqual([
                    'org',
                    WarehouseTypes.SNOWFLAKE,
                    UserWarehouseCredentialPurpose.AI,
                ]);
            },
        );
    });

    test.each([
        [null, null, true],
        [null, 'version', false],
        [
            { organizationUuid: 'org', clientVersion: 'version' },
            'version',
            true,
        ],
        [{ organizationUuid: 'org', clientVersion: 'old' }, 'version', false],
        [{ organizationUuid: 'other-org', clientVersion: null }, null, false],
    ] as const)(
        'checks client binding %j against version %s',
        async (binding, version, expected) => {
            tracker.on.select('user_warehouse_credentials').response([
                makeRow('credential', {
                    type: WarehouseTypes.SNOWFLAKE,
                    ...(binding ? { aiClientBinding: binding } : {}),
                }),
            ]);
            expect(
                await credentialModel.hasOrganizationAiSnowflakeCredential(
                    'org',
                    version,
                ),
            ).toBe(expected);
        },
    );

    test('returns the binding separately for agent status and strips it from warehouse credentials', async () => {
        const aiClientBinding = {
            organizationUuid: 'org',
            clientVersion: 'version',
        };
        const credentials = {
            type: WarehouseTypes.SNOWFLAKE,
            user: 'person',
            authenticationType: SnowflakeAuthenticationType.SSO,
            refreshToken: 'token',
        };
        tracker.on
            .select('user_warehouse_credentials')
            .response([
                makeRow('credential', { ...credentials, aiClientBinding }),
            ]);
        const ai = await credentialModel.findAiCredentialWithSecrets(
            {
                userUuid: 'user-1',
                warehouseType: WarehouseTypes.SNOWFLAKE,
            },
            { strictPersonalOverlay: false },
        );
        expect(ai?.aiClientBinding).toEqual(aiClientBinding);
        expect(ai?.credentials).toEqual(credentials);
        const secretResult = await credentialModel.getByUuidWithSecrets(
            'credential',
            undefined,
            { strictPersonalOverlay: false },
        );
        expect(secretResult).not.toHaveProperty('aiClientBinding');
        expect(secretResult.credentials).toEqual(credentials);
        const [statusCredential] =
            await credentialModel.getAiCredentialsByUserUuid('user-1');
        expect(statusCredential.aiClientBinding).toEqual(aiClientBinding);
        expect(statusCredential.credentials).not.toHaveProperty(
            'aiClientBinding',
        );
        const publicResult = await credentialModel.getAllByUserUuid('user-1');
        expect(JSON.stringify(publicResult)).not.toContain('aiClientBinding');
        expect(JSON.stringify(publicResult)).not.toContain('clientVersion');
    });

    describe('deleteAiCredential', () => {
        test.each(['project-uuid', null])(
            'returns only deleted metadata with project %s',
            async (projectUuid) => {
                tracker.on.delete('user_warehouse_credentials').response([
                    {
                        warehouse_type: WarehouseTypes.SNOWFLAKE,
                        project_uuid: projectUuid,
                    },
                ]);
                expect(
                    await credentialModel.deleteAiCredential(
                        'owner',
                        'credential',
                    ),
                ).toEqual({
                    warehouseType: WarehouseTypes.SNOWFLAKE,
                    projectUuid,
                });
                expect(tracker.history.delete).toHaveLength(1);
                expect(tracker.history.delete[0].sql).toBe(
                    'delete from "user_warehouse_credentials" where "user_uuid" = $1 and "user_warehouse_credentials_uuid" = $2 and "purpose" = $3 returning "warehouse_type", "project_uuid"',
                );
                expect(tracker.history.delete[0].bindings).toEqual([
                    'owner',
                    'credential',
                    UserWarehouseCredentialPurpose.AI,
                ]);
            },
        );

        test('returns null when no owned AI credential is deleted', async () => {
            tracker.on.delete('user_warehouse_credentials').response([]);
            await expect(
                credentialModel.deleteAiCredential('other-owner', 'credential'),
            ).resolves.toBeNull();
            expect(tracker.history.delete[0].bindings).toEqual([
                'other-owner',
                'credential',
                UserWarehouseCredentialPurpose.AI,
            ]);
        });
    });

    test('the application list queries only default credentials', async () => {
        const calls: unknown[][] = [];
        const builder: Record<string, unknown> = {};
        for (const method of [
            'leftJoin',
            'select',
            'where',
            'andWhere',
            'orderBy',
        ]) {
            builder[method] = vi.fn((...args: unknown[]) => {
                calls.push(args);
                return builder;
            });
        }
        builder.then = (resolve: (rows: object[]) => unknown) =>
            Promise.resolve([]).then(resolve);
        const database = vi.fn(() => builder) as unknown as Knex;
        const model = new UserWarehouseCredentialsModel({
            database,
            encryptionUtil: passthroughEncryption,
        });
        await model.getAllByUserUuid('user-1');
        expect(calls).toContainEqual([
            'user_warehouse_credentials.purpose',
            UserWarehouseCredentialPurpose.DEFAULT,
        ]);
    });

    describe('getQueryTimeValidationError', () => {
        test('accepts a BigQuery credential with a refresh token', () => {
            expect(
                UserWarehouseCredentialsModel.getQueryTimeValidationError(
                    validBigqueryCredentials as never,
                ),
            ).toBeUndefined();
        });

        test('rejects a BigQuery credential with an empty keyfile', () => {
            expect(
                UserWarehouseCredentialsModel.getQueryTimeValidationError(
                    brokenBigqueryCredentials as never,
                ),
            ).toBeInstanceOf(BigqueryTokenError);
        });

        test('accepts non-SSO credentials without validation', () => {
            expect(
                UserWarehouseCredentialsModel.getQueryTimeValidationError({
                    type: WarehouseTypes.POSTGRES,
                    user: 'user',
                    password: 'password',
                } as never),
            ).toBeUndefined();
        });
    });

    describe('normalizeCredentialsForPersistence', () => {
        const normalize = (credentials: object) =>
            UserWarehouseCredentialsModel.normalizeCredentialsForPersistence(
                {
                    name: 'Default',
                    credentials: credentials as never,
                },
                { strictPersonalOverlay: false },
            );

        test('keeps only the access keys of Athena credentials', () => {
            expect(
                normalize({
                    type: WarehouseTypes.ATHENA,
                    accessKeyId: 'AKIA',
                    secretAccessKey: 'secret',
                    authenticationType: AthenaAuthenticationType.ACCESS_KEY,
                    assumeRoleArn: 'arn:aws:iam::123456789012:role/other',
                    webIdentityAudience: 'lightdash-other',
                }).credentials,
            ).toEqual({
                type: WarehouseTypes.ATHENA,
                accessKeyId: 'AKIA',
                secretAccessKey: 'secret',
            });
        });

        test('rejects Athena credentials that are not access keys', () => {
            expect(() =>
                normalize({
                    type: WarehouseTypes.ATHENA,
                    authenticationType: AthenaAuthenticationType.WEB_IDENTITY,
                    webIdentityAudience: 'lightdash-other',
                }),
            ).toThrow(ParameterError);
        });

        test('defaults an omitted Snowflake authentication type to password', () => {
            expect(
                normalize({
                    type: WarehouseTypes.SNOWFLAKE,
                    user: 'user',
                    password: 'password',
                }).credentials,
            ).toEqual({
                type: WarehouseTypes.SNOWFLAKE,
                user: 'user',
                password: 'password',
                authenticationType: SnowflakeAuthenticationType.PASSWORD,
            });
        });

        test('preserves an explicit Snowflake authentication type', () => {
            expect(
                normalize({
                    type: WarehouseTypes.SNOWFLAKE,
                    user: 'user',
                    privateKey: 'private-key',
                    authenticationType: SnowflakeAuthenticationType.PRIVATE_KEY,
                }).credentials,
            ).toEqual(
                expect.objectContaining({
                    authenticationType: SnowflakeAuthenticationType.PRIVATE_KEY,
                }),
            );
        });

        test('rejects a Snowflake private key credential with an empty key', () => {
            expect(() =>
                normalize({
                    type: WarehouseTypes.SNOWFLAKE,
                    user: 'user',
                    privateKey: '',
                    authenticationType: SnowflakeAuthenticationType.PRIVATE_KEY,
                }),
            ).toThrow(ParameterError);
        });

        test('accepts BigQuery user credentials', () => {
            expect(normalize(validBigqueryCredentials).credentials).toEqual(
                validBigqueryCredentials,
            );
        });

        test('accepts a secret-free BigQuery SSO keyfile', () => {
            const { client_secret: _clientSecret, ...keyfileContents } =
                validBigqueryCredentials.keyfileContents;
            expect(() =>
                normalize({ ...validBigqueryCredentials, keyfileContents }),
            ).not.toThrow();
        });

        test('keeps the secret of a foreign Google app', () => {
            const credentials = {
                ...validBigqueryCredentials,
                keyfileContents: {
                    ...validBigqueryCredentials.keyfileContents,
                    client_id: 'foreign-app',
                },
            };
            expect(normalize(credentials).credentials).toEqual(credentials);
        });

        test('rejects unsupported BigQuery key file types', () => {
            expect(() =>
                normalize({
                    ...validBigqueryCredentials,
                    keyfileContents: {
                        ...validBigqueryCredentials.keyfileContents,
                        type: 'external_account',
                    },
                }),
            ).toThrow(ParameterError);
        });

        test('rejects BigQuery key files with non-string values', () => {
            expect(() =>
                normalize({
                    ...validBigqueryCredentials,
                    keyfileContents: {
                        ...validBigqueryCredentials.keyfileContents,
                        credential_source: { url: 'https://example.com' },
                    },
                }),
            ).toThrow(ParameterError);
        });

        test('leaves other warehouse types untouched', () => {
            const postgres = {
                type: WarehouseTypes.POSTGRES,
                user: 'user',
                password: 'password',
            };
            expect(normalize(postgres).credentials).toEqual(postgres);
        });
    });

    describe('mergeCredentialsForUpdate', () => {
        const existingCredentials = {
            type: WarehouseTypes.ATHENA,
            accessKeyId: 'existing-access-key',
            secretAccessKey: 'existing-secret-key',
        } as const;

        test('preserves the Athena secret when the access key ID is unchanged', () => {
            expect(
                UserWarehouseCredentialsModel.mergeCredentialsForUpdate(
                    {
                        name: 'Renamed',
                        credentials: {
                            type: WarehouseTypes.ATHENA,
                            accessKeyId: 'existing-access-key',
                        },
                    },
                    existingCredentials,
                ).credentials,
            ).toEqual(existingCredentials);
        });

        test('requires the Athena secret when the access key ID changes', () => {
            expect(() =>
                UserWarehouseCredentialsModel.mergeCredentialsForUpdate(
                    {
                        name: 'Renamed',
                        credentials: {
                            type: WarehouseTypes.ATHENA,
                            accessKeyId: 'new-access-key',
                        },
                    },
                    existingCredentials,
                ),
            ).toThrow(ParameterError);
        });
    });

    describe('findForProjectWithSecrets', () => {
        test('filters both preferred and fallback credentials to the default purpose', async () => {
            const whereCalls: unknown[][] = [];
            const model = createModel({
                preferredRow: undefined,
                fallbackRows: [],
                whereCalls,
            });
            await model.findForProjectWithSecrets(
                'project-1',
                'user-1',
                WarehouseTypes.BIGQUERY,
                { strictPersonalOverlay: false },
            );
            expect(
                whereCalls.filter(
                    ([column]) =>
                        column === 'user_warehouse_credentials.purpose',
                ),
            ).toEqual([
                [
                    'user_warehouse_credentials.purpose',
                    UserWarehouseCredentialPurpose.DEFAULT,
                ],
                [
                    'user_warehouse_credentials.purpose',
                    UserWarehouseCredentialPurpose.DEFAULT,
                ],
            ]);
        });

        test('a new agent sign-in changes its credential UUID', async () => {
            const merge = vi.fn();
            const returning = vi.fn(async () => [
                {
                    user_warehouse_credentials_uuid:
                        merge.mock.calls.at(-1)?.[0]
                            .user_warehouse_credentials_uuid,
                },
            ]);
            const builder = {
                insert: vi.fn(),
                onConflict: vi.fn(),
                merge,
                returning,
            };
            builder.insert.mockReturnValue(builder);
            builder.onConflict.mockReturnValue(builder);
            merge.mockReturnValue(builder);
            const database = Object.assign(
                vi.fn(() => builder),
                { raw: vi.fn() },
            ) as unknown as Knex;
            const model = new UserWarehouseCredentialsModel({
                database,
                encryptionUtil: passthroughEncryption,
            });
            const first = await model.upsertAiSnowflakeCredential(
                'user-1',
                'first-token',
                new Date('2030-01-01T00:00:00Z'),
                { organizationUuid: 'org', clientVersion: 'version' },
                { strictPersonalOverlay: false },
            );
            const second = await model.upsertAiSnowflakeCredential(
                'user-1',
                'second-token',
                null,
                { organizationUuid: 'org', clientVersion: 'version' },
                { strictPersonalOverlay: false },
            );
            expect(builder.insert.mock.calls[0][0].expires_at).toEqual(
                new Date('2030-01-01T00:00:00Z'),
            );
            expect(merge.mock.calls[0][0].expires_at).toEqual(
                new Date('2030-01-01T00:00:00Z'),
            );
            expect(
                JSON.parse(
                    passthroughEncryption.decrypt(
                        builder.insert.mock.calls[0][0].encrypted_credentials,
                    ),
                ),
            ).toMatchObject({
                aiClientBinding: {
                    organizationUuid: 'org',
                    clientVersion: 'version',
                },
            });
            expect(builder.insert.mock.calls[1][0].expires_at).toBeNull();
            expect(merge.mock.calls[1][0].expires_at).toBeNull();
            expect(first).not.toBe(second);
            expect(first).toMatch(/^[a-f0-9-]{36}$/);
            expect(builder.insert).toHaveBeenCalledWith(
                expect.objectContaining({
                    purpose: UserWarehouseCredentialPurpose.AI,
                }),
            );
        });

        test('AI lookup asks only for the AI purpose', async () => {
            const row = makeRow('ai-credential', {
                type: WarehouseTypes.SNOWFLAKE,
                authenticationType: SnowflakeAuthenticationType.SSO,
                refreshToken: 'ai-refresh-token',
            });
            row.expires_at = new Date('2030-01-01T00:00:00Z');
            const where = vi.fn();
            const builder = { where, first: vi.fn(async () => row) };
            where.mockReturnValue(builder);
            const database = vi.fn(() => builder) as unknown as Knex;
            const model = new UserWarehouseCredentialsModel({
                database,
                encryptionUtil: passthroughEncryption,
            });
            const result = await model.findAiCredentialWithSecrets(
                {
                    userUuid: 'user-1',
                    warehouseType: WarehouseTypes.SNOWFLAKE,
                },
                { strictPersonalOverlay: false },
            );
            expect(result?.uuid).toBe('ai-credential');
            expect(result?.expiresAt).toEqual(row.expires_at);
            expect(where).toHaveBeenCalledWith({
                user_uuid: 'user-1',
                warehouse_type: WarehouseTypes.SNOWFLAKE,
                purpose: UserWarehouseCredentialPurpose.AI,
            });
        });
        test('returns the preferred credential when it is valid', async () => {
            const model = createModel({
                preferredRow: makeRow('preferred', validBigqueryCredentials),
                fallbackRows: [
                    makeRow('preferred', validBigqueryCredentials),
                    makeRow('other', validBigqueryCredentials),
                ],
            });
            const result = await model.findForProjectWithSecrets(
                'project-1',
                'user-1',
                WarehouseTypes.BIGQUERY,
                { strictPersonalOverlay: false },
            );
            expect(result?.uuid).toEqual('preferred');
        });

        test('falls back to a valid credential when the preferred one is broken', async () => {
            const model = createModel({
                preferredRow: makeRow('broken', brokenBigqueryCredentials),
                fallbackRows: [
                    makeRow('broken', brokenBigqueryCredentials),
                    makeRow('valid', validBigqueryCredentials),
                ],
            });
            const result = await model.findForProjectWithSecrets(
                'project-1',
                'user-1',
                WarehouseTypes.BIGQUERY,
                { strictPersonalOverlay: false },
            );
            expect(result?.uuid).toEqual('valid');
        });

        test('throws the validation error when every credential is broken', async () => {
            const model = createModel({
                preferredRow: makeRow('broken', brokenBigqueryCredentials),
                fallbackRows: [makeRow('broken', brokenBigqueryCredentials)],
            });
            await expect(
                model.findForProjectWithSecrets(
                    'project-1',
                    'user-1',
                    WarehouseTypes.BIGQUERY,
                    { strictPersonalOverlay: false },
                ),
            ).rejects.toThrow(BigqueryTokenError);
        });

        test('falls back to a valid credential when the preferred one cannot be decrypted', async () => {
            const undecryptableRow = {
                ...makeRow('undecryptable', validBigqueryCredentials),
                encrypted_credentials: Buffer.from('not-json'),
            };
            const model = createModel({
                preferredRow: undecryptableRow,
                fallbackRows: [
                    undecryptableRow,
                    makeRow('valid', validBigqueryCredentials),
                ],
            });
            const result = await model.findForProjectWithSecrets(
                'project-1',
                'user-1',
                WarehouseTypes.BIGQUERY,
                { strictPersonalOverlay: false },
            );
            expect(result?.uuid).toEqual('valid');
        });

        test('returns undefined when every credential is undecryptable', async () => {
            const undecryptableRow = {
                ...makeRow('undecryptable', validBigqueryCredentials),
                encrypted_credentials: Buffer.from('not-json'),
            };
            const model = createModel({
                preferredRow: undecryptableRow,
                fallbackRows: [undecryptableRow],
            });
            await expect(
                model.findForProjectWithSecrets(
                    'project-1',
                    'user-1',
                    WarehouseTypes.BIGQUERY,
                    { strictPersonalOverlay: false },
                ),
            ).resolves.toBeUndefined();
        });

        test('returns undefined when the user has no credentials', async () => {
            const model = createModel({
                preferredRow: undefined,
                fallbackRows: [],
            });
            await expect(
                model.findForProjectWithSecrets(
                    'project-1',
                    'user-1',
                    WarehouseTypes.BIGQUERY,
                    { strictPersonalOverlay: false },
                ),
            ).resolves.toBeUndefined();
        });
    });
    describe('strict personal overlay (agent-identity on)', () => {
        const model = credentialModel;
        test('shape G: a decrypted row type must match its stored warehouse type', async () => {
            tracker.on.select('user_warehouse_credentials').response([
                {
                    ...makeRow('credential', {
                        type: WarehouseTypes.POSTGRES,
                        user: 'person',
                        password: '',
                    }),
                    warehouse_type: WarehouseTypes.BIGQUERY,
                },
            ]);
            await expect(
                model.getByUuidWithSecrets('credential', undefined, {
                    strictPersonalOverlay: true,
                }),
            ).rejects.toThrow('Reconnect your credentials');
        });
        test('strict direct read refuses an unreadable personal row with the reconnect error', async () => {
            tracker.on.select('user_warehouse_credentials').response([
                {
                    ...makeRow('credential', validBigqueryCredentials),
                    encrypted_credentials: Buffer.from('invalid-json'),
                },
            ]);
            await expect(
                model.getByUuidWithSecrets('credential', undefined, {
                    strictPersonalOverlay: true,
                }),
            ).rejects.toThrow('Reconnect your credentials');
        });
        test('flag-off update preserves the legacy write without reading the old type', async () => {
            tracker.on
                .update('user_warehouse_credentials')
                .response([{ user_warehouse_credentials_uuid: 'credential' }]);
            await model.update(
                'user-1',
                'credential',
                {
                    name: 'Legacy',
                    credentials: {
                        type: WarehouseTypes.POSTGRES,
                        user: 'person',
                        password: '',
                    },
                },
                { strictPersonalOverlay: false },
            );
            expect(tracker.history.select).toHaveLength(0);
            expect(tracker.history.update[0].bindings).toContain(
                WarehouseTypes.POSTGRES,
            );
        });
        test('shape G: type-changing update is refused', async () => {
            tracker.on
                .select('user_warehouse_credentials')
                .response([makeRow('credential', validBigqueryCredentials)]);
            await expect(
                model.update(
                    'user-1',
                    'credential',
                    {
                        name: 'Changed',
                        credentials: {
                            type: WarehouseTypes.POSTGRES,
                            user: 'person',
                            password: '',
                        },
                    },
                    { strictPersonalOverlay: true },
                ),
            ).rejects.toThrow('cannot change warehouse type');
            expect(tracker.history.update).toHaveLength(0);
        });
        test('strict re-auth can replace an invalid old identity without changing its warehouse type', async () => {
            tracker.on.select('user_warehouse_credentials').response([
                makeRow('credential', {
                    type: WarehouseTypes.SNOWFLAKE,
                    user: 'person',
                    authenticationType: SnowflakeAuthenticationType.SSO,
                    refreshToken: '',
                }),
            ]);
            tracker.on
                .update('user_warehouse_credentials')
                .response([{ user_warehouse_credentials_uuid: 'credential' }]);
            await expect(
                model.update(
                    'user-1',
                    'credential',
                    {
                        name: 'Personal',
                        credentials: {
                            type: WarehouseTypes.SNOWFLAKE,
                            user: 'person',
                            authenticationType: SnowflakeAuthenticationType.SSO,
                            refreshToken: 'new-refresh',
                        },
                    },
                    { strictPersonalOverlay: true },
                ),
            ).resolves.toBe('credential');
            const blob = tracker.history.update[0].bindings.find(
                Buffer.isBuffer,
            );
            expect(JSON.parse(blob!.toString())).toEqual({
                type: WarehouseTypes.SNOWFLAKE,
                user: 'person',
                authenticationType: SnowflakeAuthenticationType.SSO,
                refreshToken: 'new-refresh',
            });
        });
        test('strict update preserves the stored Athena secret before parsing', async () => {
            tracker.on.select('user_warehouse_credentials').response([
                {
                    ...makeRow('credential', {
                        type: WarehouseTypes.ATHENA,
                        accessKeyId: 'key',
                        secretAccessKey: 'stored-secret',
                    }),
                    warehouse_type: WarehouseTypes.ATHENA,
                },
            ]);
            tracker.on
                .update('user_warehouse_credentials')
                .response([{ user_warehouse_credentials_uuid: 'credential' }]);
            await model.update(
                'user-1',
                'credential',
                {
                    name: 'Personal',
                    credentials: {
                        type: WarehouseTypes.ATHENA,
                        accessKeyId: 'key',
                        secretAccessKey: '',
                    },
                },
                { strictPersonalOverlay: true },
            );
            const blob = tracker.history.update[0].bindings.find(
                Buffer.isBuffer,
            );
            expect(blob?.toString()).toContain('stored-secret');
        });
        test.each([true, false])(
            'agent sign-in saves identity separately from the client binding (%s)',
            async (enabled) => {
                tracker.on
                    .insert('user_warehouse_credentials')
                    .response([
                        { user_warehouse_credentials_uuid: 'credential' },
                    ]);
                const binding = {
                    organizationUuid: 'org',
                    clientVersion: 'version',
                };
                await model.upsertAiSnowflakeCredential(
                    'user-1',
                    'refresh',
                    null,
                    binding,
                    { strictPersonalOverlay: enabled },
                );
                const blob = tracker.history.insert[0].bindings.find(
                    Buffer.isBuffer,
                );
                expect(blob?.toString()).toBe(
                    JSON.stringify({
                        type: WarehouseTypes.SNOWFLAKE,
                        user: 'user-1',
                        authenticationType: SnowflakeAuthenticationType.SSO,
                        refreshToken: 'refresh',
                        aiClientBinding: binding,
                    }),
                );
            },
        );
    });
});

describe('refresh rotation expiry CAS', () => {
    let database: Knex;
    let tracker: ReturnType<typeof getTracker>;
    let model: UserWarehouseCredentialsModel;
    beforeAll(() => {
        database = knex({ client: MockClient, dialect: 'pg' });
        tracker = getTracker();
        model = new UserWarehouseCredentialsModel({
            database,
            encryptionUtil: passthroughEncryption,
        });
    });
    beforeEach(() => tracker.reset());
    afterAll(async () => database.destroy());
    test.each([new Date(0), new Date('2029-01-01')])(
        'preserves a concurrently extended deadline when the stale deadline was %s',
        async (staleDeadline) => {
            const row = {
                ...makeRow('credential', {
                    type: WarehouseTypes.SNOWFLAKE,
                    authenticationType: SnowflakeAuthenticationType.SSO,
                    refreshToken: 'T1',
                }),
                expires_at: staleDeadline,
            };
            tracker.on
                .select('user_warehouse_credentials')
                .response(() => [row]);
            tracker.on.update('user_warehouse_credentials').response(1);
            const extendedDeadline = new Date('2035-01-01');
            await model.rotateRefreshToken('credential', 'T1', 'T1', {
                kind: 'reported',
                expiresAt: extendedDeadline,
            });
            row.expires_at = extendedDeadline;
            await model.rotateRefreshToken('credential', 'T1', 'T2', {
                kind: 'unreported',
            });
            expect(tracker.history.update).toHaveLength(2);
            expect(tracker.history.update[1].sql).not.toContain('"expires_at"');
            expect(tracker.history.update[0].bindings).toContain(
                extendedDeadline,
            );
            expect(tracker.history.select[1].sql).toContain('"expires_at"');
            expect(tracker.history.select[1].sql).toContain('for update');
        },
    );
    test.each([new Date(0), new Date('2035-01-01'), null])(
        'uses the locked deadline for unreported expiry: %s',
        async (expiresAt) => {
            tracker.on.select('user_warehouse_credentials').response([
                {
                    ...makeRow('credential', {
                        type: WarehouseTypes.SNOWFLAKE,
                        authenticationType: SnowflakeAuthenticationType.SSO,
                        refreshToken: 'T1',
                    }),
                    expires_at: expiresAt,
                },
            ]);
            tracker.on.update('user_warehouse_credentials').response(1);
            await model.rotateRefreshToken('credential', 'T1', 'T2', {
                kind: 'unreported',
            });
            if (expiresAt && expiresAt.getTime() <= Date.now()) {
                expect(tracker.history.update[0].bindings).toContain(null);
            } else {
                expect(tracker.history.update[0].sql).not.toContain(
                    '"expires_at"',
                );
            }
        },
    );
    test.each([
        { stored: 'T1', next: 'T2', expiresAt: new Date('2030-01-01') },
        {
            stored: 'newer-token',
            next: 'T2',
            expiresAt: new Date('2030-01-01'),
        },
        { stored: 'T1', next: 'T1', expiresAt: new Date('2030-01-01') },
        { stored: 'T1', next: 'T2', expiresAt: null },
        { stored: 'T1', next: 'T2', expiresAt: undefined },
    ])(
        'guards token and expiry writes: %s',
        async ({ stored, next, expiresAt }) => {
            tracker.on.select('user_warehouse_credentials').response([
                {
                    ...makeRow('credential', {
                        type: WarehouseTypes.SNOWFLAKE,
                        authenticationType: SnowflakeAuthenticationType.SSO,
                        refreshToken: stored,
                    }),
                    warehouse_type: WarehouseTypes.SNOWFLAKE,
                    expires_at: new Date(0),
                },
            ]);
            tracker.on.update('user_warehouse_credentials').response(1);
            let expiry: Parameters<
                UserWarehouseCredentialsModel['rotateRefreshToken']
            >[3];
            if (expiresAt !== undefined)
                expiry =
                    expiresAt === null
                        ? { kind: 'unreported' }
                        : { kind: 'reported', expiresAt };
            expect(
                await model.rotateRefreshToken(
                    'credential',
                    'T1',
                    next,
                    expiry,
                ),
            ).toBe(stored === 'T1');
            expect(tracker.history.select[0].sql).toContain('for update');
            if (stored === 'T1') {
                if (expiresAt === undefined) {
                    expect(tracker.history.update[0].sql).not.toContain(
                        '"expires_at"',
                    );
                } else {
                    expect(tracker.history.update[0].sql).toContain(
                        '"expires_at"',
                    );
                    expect(tracker.history.update[0].bindings).toContain(
                        expiresAt,
                    );
                }
            } else expect(tracker.history.update).toHaveLength(0);
        },
    );
});

describe('strict personal credential writes', () => {
    const normalSaves = [
        { type: WarehouseTypes.POSTGRES, user: 'person', password: '' },
        { type: WarehouseTypes.TRINO, user: 'person', password: '' },
        { type: WarehouseTypes.CLICKHOUSE, user: 'person', password: '' },
        {
            type: WarehouseTypes.REDSHIFT,
            user: 'person',
            password: 'password',
            authenticationType: 'password',
        },
        {
            type: WarehouseTypes.SNOWFLAKE,
            user: 'person',
            password: 'password',
            authenticationType: 'password',
        },
        validBigqueryCredentials,
        {
            type: WarehouseTypes.DATABRICKS,
            authenticationType: 'personal_access_token',
            personalAccessToken: 'pat',
        },
        {
            type: WarehouseTypes.ATHENA,
            accessKeyId: 'access',
            secretAccessKey: 'secret',
        },
        { type: WarehouseTypes.DUCKDB, token: 'token' },
    ];
    const normalize = (credentials: object, strictPersonalOverlay = true) =>
        UserWarehouseCredentialsModel.normalizeCredentialsForPersistence(
            { name: 'Personal', credentials: credentials as never },
            { strictPersonalOverlay },
        );
    test('strict BigQuery writes name nested policy keys without exposing values', () => {
        const save = () =>
            normalize({
                ...validBigqueryCredentials,
                keyfileContents: {
                    ...validBigqueryCredentials.keyfileContents,
                    quota_project_id: 'private-billing-project',
                },
            });
        expect(save).toThrow(ParameterError);
        expect(save).toThrow('keyfileContents.quota_project_id');
        expect(save).not.toThrow('private-billing-project');
    });
    test.each([undefined, '', '   '])(
        'strict U2M writes reject an unbound host (%s)',
        (serverHostName) => {
            expect(() =>
                normalize({
                    type: WarehouseTypes.DATABRICKS,
                    authenticationType: 'oauth_u2m',
                    refreshToken: 'refresh',
                    serverHostName,
                }),
            ).toThrow(ParameterError);
        },
    );
    test('strict U2M writes trim the workspace host', () => {
        expect(
            normalize({
                type: WarehouseTypes.DATABRICKS,
                authenticationType: 'oauth_u2m',
                refreshToken: 'refresh',
                serverHostName: ' workspace.cloud.databricks.com ',
            }).credentials,
        ).toMatchObject({ serverHostName: 'workspace.cloud.databricks.com' });
    });
    test.each(normalSaves)(
        'strict write rejects non-allowlisted fields for $type',
        (credentials) => {
            expect(() =>
                normalize({ ...credentials, requireUserCredentials: false }),
            ).toThrow(ParameterError);
        },
    );
    test.each(normalSaves)(
        'strict write accepts the normal save shape for $type',
        (credentials) => {
            expect(normalize(credentials)).toEqual({
                name: 'Personal',
                credentials,
            });
        },
    );
    test.each(normalSaves)(
        'flag-off parity preserves the current normal save for $type',
        (credentials) => {
            expect(normalize(credentials, false)).toEqual({
                name: 'Personal',
                credentials,
            });
        },
    );
    test('flag-off parity preserves legacy extras and Athena projection', () => {
        expect(
            normalize(
                {
                    type: WarehouseTypes.POSTGRES,
                    user: 'person',
                    password: '',
                    host: 'legacy-host',
                },
                false,
            ),
        ).toEqual({
            name: 'Personal',
            credentials: {
                type: WarehouseTypes.POSTGRES,
                user: 'person',
                password: '',
                host: 'legacy-host',
            },
        });
        expect(
            normalize(
                {
                    type: WarehouseTypes.ATHENA,
                    accessKeyId: 'access',
                    secretAccessKey: 'secret',
                    region: 'legacy-region',
                },
                false,
            ),
        ).toEqual({
            name: 'Personal',
            credentials: {
                type: WarehouseTypes.ATHENA,
                accessKeyId: 'access',
                secretAccessKey: 'secret',
            },
        });
    });
    test.each([
        {
            type: WarehouseTypes.BIGQUERY,
            authenticationType: 'adc',
            keyfileContents: validBigqueryCredentials.keyfileContents,
        },
        {
            type: WarehouseTypes.BIGQUERY,
            authenticationType: 'private_key',
            keyfileContents: validBigqueryCredentials.keyfileContents,
        },
        {
            type: WarehouseTypes.BIGQUERY,
            keyfileContents: {
                type: 'service_account',
                refresh_token: 'refresh',
            },
        },
        {
            type: WarehouseTypes.BIGQUERY,
            keyfileContents: { type: 'authorized_user', refresh_token: '' },
        },
        {
            type: WarehouseTypes.DATABRICKS,
            authenticationType: 'oauth_m2m',
            personalAccessToken: 'pat',
        },
        {
            type: WarehouseTypes.DATABRICKS,
            authenticationType: 'oauth_u2m',
            refreshToken: '',
        },
        {
            type: WarehouseTypes.REDSHIFT,
            authenticationType: 'iam',
            assumeRoleArn: 'role',
        },
        {
            type: WarehouseTypes.ATHENA,
            accessKeyId: 'access',
            secretAccessKey: 'secret',
            authenticationType: 'access_key',
        },
    ])('strict write rejects invalid personal mode %#', (credentials) => {
        expect(() => normalize(credentials)).toThrow(ParameterError);
    });
    test.each([
        {
            type: WarehouseTypes.SNOWFLAKE,
            authenticationType: 'sso',
            user: 'person',
            refreshToken: 'refresh',
        },
        {
            type: WarehouseTypes.DATABRICKS,
            authenticationType: 'oauth_u2m',
            refreshToken: 'refresh',
            serverHostName: 'workspace.cloud.databricks.com',
            oauthClientId: 'client',
        },
        {
            type: WarehouseTypes.DATABRICKS,
            authenticationType: 'oauth_u2m',
            refreshToken: 'refresh',
            oauthClientId: 'client',
            serverHostName: 'workspace.cloud.databricks.com',
        },
        {
            type: WarehouseTypes.REDSHIFT,
            authenticationType: 'iam_browser',
            user: '',
            accessKeyId: 'access',
            secretAccessKey: 'secret',
            sessionToken: 'session',
        },
    ])('strict write accepts the current SSO save %#', (credentials) => {
        expect(normalize(credentials)).toEqual({
            name: 'Personal',
            credentials: Object.fromEntries(
                Object.entries(credentials).filter(([, value]) => value !== ''),
            ),
        });
    });
    test('strict write retains the Snowflake default and Athena same-key secret preservation', () => {
        expect(
            normalize({
                type: WarehouseTypes.SNOWFLAKE,
                user: 'person',
                password: 'password',
            }).credentials,
        ).toEqual({
            type: WarehouseTypes.SNOWFLAKE,
            user: 'person',
            password: 'password',
            authenticationType: 'password',
        });
        const merged = UserWarehouseCredentialsModel.mergeCredentialsForUpdate(
            {
                name: 'Personal',
                credentials: {
                    type: WarehouseTypes.ATHENA,
                    accessKeyId: 'access',
                    secretAccessKey: '',
                },
            },
            {
                type: WarehouseTypes.ATHENA,
                accessKeyId: 'access',
                secretAccessKey: 'secret',
            },
        );
        expect(normalize(merged.credentials).credentials).toEqual({
            type: WarehouseTypes.ATHENA,
            accessKeyId: 'access',
            secretAccessKey: 'secret',
        });
    });
    test('strict write accepts the Redshift password edit form AWS placeholders', () => {
        expect(() =>
            normalize({
                type: WarehouseTypes.REDSHIFT,
                user: 'person',
                password: 'password',
                authenticationType: 'password',
                accessKeyId: '',
                secretAccessKey: '',
                sessionToken: '',
            }),
        ).not.toThrow();
    });
});

describe('strict personal overlay (agent-identity on)', () => {
    const policy = { strictPersonalOverlay: true };
    test('shape F: preferred credential scoped to another project is ignored', async () => {
        const model = createModel({
            preferredRow: {
                ...makeRow('foreign', validBigqueryCredentials),
                project_uuid: 'other-project',
            },
            fallbackRows: [makeRow('mine', validBigqueryCredentials)],
        });
        expect(
            (
                await model.findForProjectWithSecrets(
                    'project',
                    'user-1',
                    WarehouseTypes.BIGQUERY,
                    policy,
                )
            )?.uuid,
        ).toBe('mine');
    });
    test('flag-off preferred-row lookup preserves the legacy project scope', async () => {
        const model = createModel({
            preferredRow: {
                ...makeRow('foreign', validBigqueryCredentials),
                project_uuid: 'other-project',
            },
            fallbackRows: [makeRow('mine', validBigqueryCredentials)],
        });
        expect(
            (
                await model.findForProjectWithSecrets(
                    'project',
                    'user-1',
                    WarehouseTypes.BIGQUERY,
                    { strictPersonalOverlay: false },
                )
            )?.uuid,
        ).toBe('foreign');
    });
    test('strict preferred-row lookup ignores a row owned by another user', async () => {
        const model = createModel({
            preferredRow: {
                ...makeRow('foreign', validBigqueryCredentials),
                user_uuid: 'other-user',
            },
            fallbackRows: [makeRow('mine', validBigqueryCredentials)],
        });
        expect(
            (
                await model.findForProjectWithSecrets(
                    'project',
                    'user-1',
                    WarehouseTypes.BIGQUERY,
                    policy,
                )
            )?.uuid,
        ).toBe('mine');
    });
    test('shape G: stale type preference is refused', async () => {
        const model = createModel({
            preferredRow: makeRow('stale', {
                type: WarehouseTypes.POSTGRES,
                user: 'person',
                password: '',
            }),
            fallbackRows: [makeRow('mine', validBigqueryCredentials)],
        });
        await expect(
            model.findForProjectWithSecrets(
                'project',
                'user-1',
                WarehouseTypes.BIGQUERY,
                policy,
            ),
        ).rejects.toThrow('Reconnect your credentials');
    });
    test('strict save names unknown keys without values', () => {
        expect(() =>
            UserWarehouseCredentialsModel.normalizeCredentialsForPersistence(
                {
                    name: 'Personal',
                    credentials: {
                        type: WarehouseTypes.POSTGRES,
                        user: 'person',
                        password: '',
                        host: 'secret-host',
                        port: 123,
                    },
                } as never,
                policy,
            ),
        ).toThrow(
            'Personal warehouse credentials cannot set: host, port. Only sign-in fields can be saved.',
        );
    });
    test('strict save explains the Redshift IAM key pair requirement', () => {
        expect(() =>
            UserWarehouseCredentialsModel.normalizeCredentialsForPersistence(
                {
                    name: 'Personal',
                    credentials: {
                        type: WarehouseTypes.REDSHIFT,
                        authenticationType: 'iam',
                        assumeRoleArn: 'private-role',
                    },
                } as never,
                policy,
            ),
        ).toThrow(
            'Redshift IAM credentials need your own AWS access key ID and secret access key.',
        );
    });
});
