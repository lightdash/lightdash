import {
    BigqueryAuthenticationType,
    BigqueryTokenError,
    ParameterError,
    SnowflakeAuthenticationType,
    WarehouseSignInRejection,
    WarehouseTypes,
} from '@lightdash/common';
import { Knex } from 'knex';
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
    needs_sign_in_at: null,
    needs_sign_in_reason: null,
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

describe('UserWarehouseCredentialsModel', () => {
    describe('needs sign-in mark', () => {
        const makeMarkModel = () => {
            const builder = {
                where: vi.fn(),
                whereNull: vi.fn(),
                whereNotNull: vi.fn(),
                update: vi.fn(async () => 0),
            };
            builder.where.mockReturnValue(builder);
            builder.whereNull.mockReturnValue(builder);
            builder.whereNotNull.mockReturnValue(builder);
            const database = vi.fn(() => builder) as unknown as Knex;
            return {
                model: new UserWarehouseCredentialsModel({
                    database,
                    encryptionUtil: passthroughEncryption,
                }),
                builder,
            };
        };

        test('sets the first rejection time only when no mark exists', async () => {
            const { model, builder } = makeMarkModel();
            await model.markNeedsSignIn(
                'credential-1',
                WarehouseSignInRejection.INVALID_GRANT,
            );
            expect(builder.whereNull).toHaveBeenCalledWith('needs_sign_in_at');
            expect(builder.update).toHaveBeenCalledWith({
                needs_sign_in_at: expect.any(Date),
                needs_sign_in_reason: WarehouseSignInRejection.INVALID_GRANT,
            });
        });

        test('clears only a marked credential', async () => {
            const { model, builder } = makeMarkModel();
            await model.clearNeedsSignIn('credential-1');
            expect(builder.whereNotNull).toHaveBeenCalledWith(
                'needs_sign_in_at',
            );
            expect(builder.update).toHaveBeenCalledWith({
                needs_sign_in_at: null,
                needs_sign_in_reason: null,
            });
        });
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
