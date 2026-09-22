import {
    BigqueryAuthenticationType,
    BigqueryTokenError,
    ParameterError,
    SnowflakeAuthenticationType,
    WarehouseTypes,
} from '@lightdash/common';
import { Knex } from 'knex';
import { ProjectTableName } from '../../database/entities/projects';
import {
    DbUserWarehouseCredentials,
    ProjectUserWarehouseCredentialPreferenceTableName,
} from '../../database/entities/userWarehouseCredentials';
import { WarehouseCredentialTableName } from '../../database/entities/warehouseCredentials';
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
        client_id: 'client-id',
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
    project_uuid: null,
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
}: {
    preferredRow: object | undefined;
    fallbackRows: object[];
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
            builder[method] = vi.fn(() => builder);
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

type PreferenceQueryBuilder = Record<
    | 'first'
    | 'forUpdate'
    | 'ignore'
    | 'innerJoin'
    | 'insert'
    | 'limit'
    | 'onConflict'
    | 'returning'
    | 'select'
    | 'update'
    | 'where'
    | 'whereNull',
    ReturnType<typeof vi.fn>
>;

const createPreferenceQueryBuilder = (): PreferenceQueryBuilder => {
    const builder = {
        first: vi.fn(),
        forUpdate: vi.fn(),
        ignore: vi.fn(),
        innerJoin: vi.fn(),
        insert: vi.fn(),
        limit: vi.fn(),
        onConflict: vi.fn(),
        returning: vi.fn(),
        select: vi.fn(),
        update: vi.fn(),
        where: vi.fn(),
        whereNull: vi.fn(),
    };

    vi.mocked(builder.innerJoin).mockReturnValue(builder);
    vi.mocked(builder.forUpdate).mockReturnValue(builder);
    vi.mocked(builder.ignore).mockReturnValue(builder);
    vi.mocked(builder.insert).mockReturnValue(builder);
    vi.mocked(builder.onConflict).mockReturnValue(builder);
    vi.mocked(builder.select).mockReturnValue(builder);
    vi.mocked(builder.update).mockReturnValue(builder);
    vi.mocked(builder.where).mockReturnValue(builder);
    vi.mocked(builder.whereNull).mockReturnValue(builder);

    return builder;
};

const createPreferenceModel = (
    queryBuilders: PreferenceQueryBuilder[],
    hasConnectionUuid: boolean,
) => {
    const projectQuery = createPreferenceQueryBuilder();
    vi.mocked(projectQuery.first).mockResolvedValue({
        project_id: 1,
    } as never);
    queryBuilders.unshift(projectQuery);
    const databaseMock = vi.fn(
        () => queryBuilders.shift() as unknown as Knex.QueryBuilder,
    );
    const database = databaseMock as unknown as Knex;
    Object.defineProperty(database, 'schema', {
        value: {
            hasColumn: vi.fn().mockResolvedValue(hasConnectionUuid),
        },
    });
    Object.defineProperty(database, 'raw', {
        value: vi.fn().mockResolvedValue(undefined),
    });
    Object.defineProperty(database, 'transaction', {
        value: vi.fn(async (callback) => callback(database)),
    });

    return {
        database,
        databaseMock,
        model: new UserWarehouseCredentialsModel({
            database,
            encryptionUtil: passthroughEncryption,
        }),
    };
};

describe('UserWarehouseCredentialsModel', () => {
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

    describe('upsertUserCredentialsPreference', () => {
        test('updates the legacy preference when connection scope is unavailable', async () => {
            const updateQuery = createPreferenceQueryBuilder();
            vi.mocked(updateQuery.returning).mockResolvedValueOnce([
                { user_uuid: 'user-1' },
            ] as never);
            const { database, databaseMock, model } = createPreferenceModel(
                [updateQuery],
                false,
            );

            await model.upsertUserCredentialsPreference(
                'user-1',
                'project-1',
                'credentials-1',
            );

            expect(vi.mocked(database.schema.hasColumn)).toHaveBeenCalledWith(
                ProjectUserWarehouseCredentialPreferenceTableName,
                'connection_uuid',
            );
            expect(databaseMock).toHaveBeenNthCalledWith(1, ProjectTableName);
            expect(databaseMock).toHaveBeenNthCalledWith(
                2,
                ProjectUserWarehouseCredentialPreferenceTableName,
            );
            expect(vi.mocked(updateQuery.where)).toHaveBeenCalledWith({
                user_uuid: 'user-1',
                project_uuid: 'project-1',
            });
            expect(vi.mocked(updateQuery.update)).toHaveBeenCalledWith({
                user_warehouse_credentials_uuid: 'credentials-1',
            });
        });

        test('locks the preference table against the scoping migration before probing', async () => {
            const updateQuery = createPreferenceQueryBuilder();
            vi.mocked(updateQuery.returning).mockResolvedValueOnce([
                { user_uuid: 'user-1' },
            ] as never);
            const { database, model } = createPreferenceModel(
                [updateQuery],
                false,
            );

            await model.upsertUserCredentialsPreference(
                'user-1',
                'project-1',
                'credentials-1',
            );

            expect(vi.mocked(database.raw)).toHaveBeenCalledWith(
                'LOCK TABLE ?? IN ACCESS SHARE MODE',
                [ProjectUserWarehouseCredentialPreferenceTableName],
            );
            expect(
                vi.mocked(database.raw).mock.invocationCallOrder[0],
            ).toBeLessThan(
                vi.mocked(database.schema.hasColumn).mock
                    .invocationCallOrder[0],
            );
        });

        test('inserts a legacy preference when no row exists', async () => {
            const updateQuery = createPreferenceQueryBuilder();
            const insertQuery = createPreferenceQueryBuilder();
            vi.mocked(updateQuery.returning).mockResolvedValueOnce([] as never);
            vi.mocked(insertQuery.returning).mockResolvedValueOnce([
                { user_uuid: 'user-1' },
            ] as never);
            const { model } = createPreferenceModel(
                [updateQuery, insertQuery],
                false,
            );

            await model.upsertUserCredentialsPreference(
                'user-1',
                'project-1',
                'credentials-1',
            );

            expect(vi.mocked(insertQuery.insert)).toHaveBeenCalledWith({
                user_uuid: 'user-1',
                user_warehouse_credentials_uuid: 'credentials-1',
                project_uuid: 'project-1',
            });
        });

        test('updates a concurrent legacy insert without naming its constraint', async () => {
            const initialUpdateQuery = createPreferenceQueryBuilder();
            const insertQuery = createPreferenceQueryBuilder();
            const concurrentUpdateQuery = createPreferenceQueryBuilder();
            vi.mocked(initialUpdateQuery.returning).mockResolvedValueOnce(
                [] as never,
            );
            vi.mocked(insertQuery.returning).mockResolvedValueOnce([] as never);
            vi.mocked(concurrentUpdateQuery.returning).mockResolvedValueOnce([
                { user_uuid: 'user-1' },
            ] as never);
            const { model } = createPreferenceModel(
                [initialUpdateQuery, insertQuery, concurrentUpdateQuery],
                false,
            );

            await model.upsertUserCredentialsPreference(
                'user-1',
                'project-1',
                'credentials-1',
            );

            expect(vi.mocked(insertQuery.onConflict)).toHaveBeenCalledWith();
            expect(vi.mocked(insertQuery.ignore)).toHaveBeenCalledWith();
            expect(
                vi.mocked(concurrentUpdateQuery.update),
            ).toHaveBeenCalledWith({
                user_warehouse_credentials_uuid: 'credentials-1',
            });
        });

        test('scopes a migrated preference to the sole active connection', async () => {
            const connectionQuery = createPreferenceQueryBuilder();
            const updateQuery = createPreferenceQueryBuilder();
            vi.mocked(connectionQuery.limit).mockResolvedValueOnce([
                { warehouse_credentials_uuid: 'connection-1' },
            ] as never);
            vi.mocked(updateQuery.returning).mockResolvedValueOnce([
                { user_uuid: 'user-1' },
            ] as never);
            const { databaseMock, model } = createPreferenceModel(
                [connectionQuery, updateQuery],
                true,
            );

            await model.upsertUserCredentialsPreference(
                'user-1',
                'project-1',
                'credentials-1',
            );

            expect(databaseMock).toHaveBeenNthCalledWith(
                2,
                WarehouseCredentialTableName,
            );
            expect(vi.mocked(connectionQuery.whereNull)).toHaveBeenCalledWith(
                'superseded_at',
            );
            expect(vi.mocked(connectionQuery.limit)).toHaveBeenCalledWith(2);
            expect(vi.mocked(updateQuery.update)).toHaveBeenCalledWith({
                user_warehouse_credentials_uuid: 'credentials-1',
                connection_uuid: 'connection-1',
            });
        });

        test('inserts a migrated preference with the sole active connection', async () => {
            const connectionQuery = createPreferenceQueryBuilder();
            const updateQuery = createPreferenceQueryBuilder();
            const insertQuery = createPreferenceQueryBuilder();
            vi.mocked(connectionQuery.limit).mockResolvedValueOnce([
                { warehouse_credentials_uuid: 'connection-1' },
            ] as never);
            vi.mocked(updateQuery.returning).mockResolvedValueOnce([] as never);
            vi.mocked(insertQuery.returning).mockResolvedValueOnce([
                { user_uuid: 'user-1' },
            ] as never);
            const { model } = createPreferenceModel(
                [connectionQuery, updateQuery, insertQuery],
                true,
            );

            await model.upsertUserCredentialsPreference(
                'user-1',
                'project-1',
                'credentials-1',
            );

            expect(vi.mocked(insertQuery.insert)).toHaveBeenCalledWith({
                user_uuid: 'user-1',
                user_warehouse_credentials_uuid: 'credentials-1',
                project_uuid: 'project-1',
                connection_uuid: 'connection-1',
            });
        });

        test('refuses a migrated preference when active connections are ambiguous', async () => {
            const connectionQuery = createPreferenceQueryBuilder();
            vi.mocked(connectionQuery.limit).mockResolvedValueOnce([
                { warehouse_credentials_uuid: 'connection-1' },
                { warehouse_credentials_uuid: 'connection-2' },
            ] as never);
            const { databaseMock, model } = createPreferenceModel(
                [connectionQuery],
                true,
            );

            await expect(
                model.upsertUserCredentialsPreference(
                    'user-1',
                    'project-1',
                    'credentials-1',
                ),
            ).rejects.toThrow('exactly one active connection');
            expect(databaseMock).toHaveBeenCalledTimes(2);
        });
    });
});
