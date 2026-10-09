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
    credentials: object,
): DbUserWarehouseCredentials & {
    project_name: string | null;
    project_type: null;
} => ({
    user_warehouse_credentials_uuid: uuid,
    user_uuid: 'user-1',
    name: 'Default',
    warehouse_type: WarehouseTypes.BIGQUERY,
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

    describe('hasOrganizationAiSnowflakeCredential', () => {
        test.each([true, false])(
            'returns %s for matching activation evidence without reading secrets',
            async (exists) => {
                tracker.on.select('user_warehouse_credentials').response(
                    exists
                        ? [
                              {
                                  user_warehouse_credentials_uuid: 'credential',
                              },
                          ]
                        : [],
                );
                await expect(
                    credentialModel.hasOrganizationAiSnowflakeCredential('org'),
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
                expect(query.sql).not.toContain('encrypted_credentials');
                expect(query.bindings).toEqual([
                    'org',
                    WarehouseTypes.SNOWFLAKE,
                    UserWarehouseCredentialPurpose.AI,
                    1,
                ]);
            },
        );
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
            UserWarehouseCredentialsModel.normalizeCredentialsForPersistence({
                name: 'Default',
                credentials: credentials as never,
            });

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
            );
            const second = await model.upsertAiSnowflakeCredential(
                'user-1',
                'second-token',
                null,
            );
            expect(builder.insert.mock.calls[0][0].expires_at).toEqual(
                new Date('2030-01-01T00:00:00Z'),
            );
            expect(merge.mock.calls[0][0].expires_at).toEqual(
                new Date('2030-01-01T00:00:00Z'),
            );
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
            const result = await model.findAiCredentialWithSecrets({
                userUuid: 'user-1',
                warehouseType: WarehouseTypes.SNOWFLAKE,
            });
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
                ),
            ).resolves.toBeUndefined();
        });
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
