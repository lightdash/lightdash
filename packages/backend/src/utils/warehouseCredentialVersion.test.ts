import {
    assertUnreachable,
    BigqueryAuthenticationType,
    DatabricksAuthenticationType,
    UserWarehouseCredentialPurpose,
    WarehouseTypes,
    type CreateBigqueryCredentials,
    type CreateDatabricksCredentials,
    type CreateWarehouseCredentials,
} from '@lightdash/common';
import knex, { type Knex } from 'knex';
import { getTracker, MockClient } from 'knex-mock-client';
import { lightdashConfigMock } from '../config/lightdashConfig.mock';
import { OrganizationWarehouseCredentialsModel } from '../models/OrganizationWarehouseCredentialsModel';
import { ProjectModel } from '../models/ProjectModel/ProjectModel';
import { UserWarehouseCredentialsModel } from '../models/UserWarehouseCredentials/UserWarehouseCredentialsModel';
import { WarehouseConnectionModel } from '../models/WarehouseConnectionModel/WarehouseConnectionModel';
import {
    composePersonalWarehouseCredentials,
    projectPersonalWarehouseCredentials,
} from '../services/WarehouseClientFactory/personalCredentialOverlay';
import { type EncryptionUtil } from './EncryptionUtil/EncryptionUtil';
import { getWarehouseIdentityFingerprint } from './queryResultProducer';
import { warehouseCredentialsEqual } from './warehouseCredentialsEqual';
import {
    getWarehouseCredentialVersion,
    getWarehouseCredentialVersions,
    withWarehouseCredentialVersion,
    withWarehouseCredentialVersions,
} from './warehouseCredentialVersion';

const credentials: CreateWarehouseCredentials = {
    type: WarehouseTypes.DATABRICKS,
    authenticationType: DatabricksAuthenticationType.PERSONAL_ACCESS_TOKEN,
    serverHostName: 'warehouse',
    httpPath: 'path',
    database: 'db',
    personalAccessToken: 'private-token',
    refreshToken: 'old-refresh',
};
const encryption = {
    encrypt: (value: string) => Buffer.from(value),
    decrypt: (value: Buffer) => value.toString(),
} as EncryptionUtil;

const decode = (value: Buffer): CreateWarehouseCredentials => {
    try {
        return JSON.parse(value.toString()) as CreateWarehouseCredentials;
    } catch {
        throw new Error('Invalid test credentials');
    }
};

describe('persisted opaque credential versions', () => {
    const database = knex({ client: MockClient, dialect: 'pg' });
    const tracker = getTracker();
    const organizationModel = new OrganizationWarehouseCredentialsModel({
        database,
        encryptionUtil: encryption,
    });
    const projectModel = new ProjectModel({
        database,
        encryptionUtil: encryption,
        lightdashConfig: lightdashConfigMock,
    });
    const personalModel = new UserWarehouseCredentialsModel({
        database,
        encryptionUtil: encryption,
    });
    const connectionModel = new WarehouseConnectionModel({
        database,
        encryptionUtil: encryption,
        organizationWarehouseCredentialsModel: organizationModel,
    });
    const project = {
        projectUuid: 'project',
        organizationUuid: 'org',
        connectionMode: 'multi' as const,
        originalWarehouseType: WarehouseTypes.DATABRICKS,
    };
    beforeEach(() => tracker.reset());
    afterAll(async () => database.destroy());

    test.each([null, 'saved-version'])(
        'strict personal reads and composition retain version %s',
        async (version) => {
            const connection =
                withWarehouseCredentialVersion<CreateWarehouseCredentials>(
                    {
                        type: WarehouseTypes.POSTGRES,
                        host: 'warehouse',
                        port: 5432,
                        dbname: 'analytics',
                        schema: 'public',
                        user: 'shared',
                        password: 'shared-secret',
                    },
                    'connection-version',
                );
            tracker.on.select('user_warehouse_credentials').response([
                {
                    user_warehouse_credentials_uuid: 'personal',
                    warehouse_type: WarehouseTypes.POSTGRES,
                    purpose: UserWarehouseCredentialPurpose.DEFAULT,
                    expires_at: null,
                    encrypted_credentials: encryption.encrypt(
                        JSON.stringify({
                            type: WarehouseTypes.POSTGRES,
                            user: 'person',
                            password: 'personal-secret',
                            host: 'discarded-host',
                            ...(version === null
                                ? {}
                                : { resultIdentityVersion: version }),
                        }),
                    ),
                },
            ]);
            const { credentials: personal } =
                await personalModel.getByUuidWithSecrets(
                    'personal',
                    undefined,
                    { strictPersonalOverlay: true },
                );
            expect(personal).not.toHaveProperty('host');
            expect(personal).not.toHaveProperty('resultIdentityVersion');
            expect(getWarehouseCredentialVersions(personal)).toEqual([
                version ?? 'personal:personal',
            ]);
            const composed = composePersonalWarehouseCredentials(
                connection,
                projectPersonalWarehouseCredentials(personal),
            );
            expect(composed).toMatchObject({
                host: 'warehouse',
                user: 'person',
            });
            expect(getWarehouseCredentialVersions(composed)).toEqual([
                'connection-version',
                version ?? 'personal:personal',
            ]);
            expect(getWarehouseIdentityFingerprint(composed)).not.toBeNull();
        },
    );

    test.each(['project', 'organization', 'extra', 'personal'] as const)(
        '%s edits change the version while refresh rotation preserves it',
        async (kind) => {
            let stored: CreateWarehouseCredentials = credentials;
            const row = () => ({
                project_id: 1,
                warehouse_credentials_id: 9,
                warehouse_connection_uuid: 'connection',
                organization_warehouse_credentials_uuid:
                    kind === 'organization' ? 'organization' : null,
                user_warehouse_credentials_uuid: 'personal',
                organization_uuid: 'org',
                name: 'Credentials',
                warehouse_type: stored.type,
                warehouse_connection: Buffer.from(JSON.stringify(stored)),
                encrypted_credentials: Buffer.from(JSON.stringify(stored)),
                created_at: new Date(0),
                updated_at: new Date(),
                expires_at: null,
                is_original: false,
                playground_bundle_version: null,
                purpose: UserWarehouseCredentialPurpose.DEFAULT,
            });
            const table = {
                project: 'warehouse_credentials',
                organization: 'organization_warehouse_credentials',
                extra: 'warehouse_connections',
                personal: 'user_warehouse_credentials',
            }[kind];
            const persist = ({ bindings }: { bindings: unknown[] }) => {
                const encrypted = bindings.find(Buffer.isBuffer);
                if (encrypted) stored = decode(encrypted);
                return [row()];
            };
            tracker.on.select(table).response(() => [row()]);
            tracker.on.update(table).response(persist);
            tracker.on.insert(table).response(persist);
            const save = (
                incoming: CreateDatabricksCredentials = credentials,
            ) => {
                switch (kind) {
                    case 'project':
                        return projectModel['upsertWarehouseConnection'](
                            database as Knex.Transaction,
                            1,
                            incoming,
                            { actorUserUuid: null, inheritFromProjectId: null },
                        );
                    case 'organization':
                        return organizationModel.update('organization', {
                            credentials: incoming,
                        });
                    case 'extra':
                        return connectionModel.updateExtraCredentials(
                            project,
                            'connection',
                            { kind: 'project', credentials: incoming },
                        );
                    case 'personal':
                        return personalModel.update(
                            'user',
                            'personal',
                            {
                                name: 'Credentials',
                                credentials: incoming,
                            },
                            { strictPersonalOverlay: false },
                        );
                    default:
                        return assertUnreachable(kind, 'Unknown test kind');
                }
            };
            const load = async () => {
                switch (kind) {
                    case 'project':
                        return projectModel.getWarehouseCredentialsForProjectUncached(
                            'project',
                        );
                    case 'organization':
                        return (
                            await organizationModel.getByUuidWithSensitiveData(
                                'organization',
                            )
                        ).credentials;
                    case 'extra':
                        return (
                            await connectionModel.getExtraCredentialSource(
                                project,
                                'connection',
                            )
                        ).credentials;
                    case 'personal':
                        return (
                            await personalModel.getByUuidWithSecrets(
                                'personal',
                                undefined,
                                { strictPersonalOverlay: false },
                            )
                        ).credentials;
                    default:
                        return assertUnreachable(kind, 'Unknown test kind');
                }
            };
            const rotate = () => {
                switch (kind) {
                    case 'project':
                        return projectModel.rotateRefreshToken(
                            'project',
                            'old-refresh',
                            'new-refresh',
                        );
                    case 'organization':
                        return organizationModel.rotateRefreshToken(
                            'organization',
                            'old-refresh',
                            'new-refresh',
                        );
                    case 'extra':
                        return connectionModel.rotateRefreshToken(
                            project,
                            'connection',
                            'old-refresh',
                            'new-refresh',
                        );
                    case 'personal':
                        return personalModel.rotateRefreshToken(
                            'personal',
                            'old-refresh',
                            'new-refresh',
                        );
                    default:
                        return assertUnreachable(kind, 'Unknown test kind');
                }
            };
            const initialCredentials = await load();
            expect(initialCredentials).not.toHaveProperty(
                'resultIdentityVersion',
            );
            const initialFingerprint = getWarehouseIdentityFingerprint(
                initialCredentials as CreateWarehouseCredentials,
            );
            await save(credentials);
            expect(
                getWarehouseIdentityFingerprint(
                    (await load()) as CreateWarehouseCredentials,
                ),
            ).toBe(initialFingerprint);
            expect(await load()).toEqual(initialCredentials);
            if (kind === 'organization') {
                expect(
                    (await organizationModel.getByUuid('organization'))
                        .credentials,
                ).not.toHaveProperty('resultIdentityVersion');
            }
            const legacyVersion = getWarehouseCredentialVersion(await load());
            expect(legacyVersion).not.toBeNull();
            const legacyFingerprint = getWarehouseIdentityFingerprint(
                (await load()) as CreateWarehouseCredentials,
            );
            await expect(rotate()).resolves.toBe(true);
            expect(
                getWarehouseIdentityFingerprint(
                    (await load()) as CreateWarehouseCredentials,
                ),
            ).toBe(legacyFingerprint);
            await save();
            const first = getWarehouseIdentityFingerprint(
                (await load()) as CreateWarehouseCredentials,
            );
            expect(getWarehouseCredentialVersion(stored)).not.toBe(
                legacyVersion,
            );
            expect(first).not.toBeNull();
            const version = getWarehouseCredentialVersion(stored);
            const refresh = rotate();
            await expect(refresh).resolves.toBe(true);
            expect(stored).toMatchObject({ refreshToken: 'new-refresh' });
            expect(getWarehouseCredentialVersion(stored)).toBe(version);
            expect(
                getWarehouseIdentityFingerprint(
                    (await load()) as CreateWarehouseCredentials,
                ),
            ).toBe(first);
            await save();
            expect(getWarehouseCredentialVersion(stored)).not.toBe(version);
            expect(
                getWarehouseIdentityFingerprint(
                    (await load()) as CreateWarehouseCredentials,
                ),
            ).not.toBe(first);
        },
    );

    describe.each([null, 'stored-version'])(
        'project refresh paths (%s)',
        (version) => {
            test.each(['preview', 'repair', 'reconnect'] as const)(
                '%s keeps unchanged credentials stable and handles a token change',
                async (kind) => {
                    const initial: CreateBigqueryCredentials = {
                        type: WarehouseTypes.BIGQUERY,
                        project: 'analytics',
                        dataset: 'marts',
                        authenticationType: BigqueryAuthenticationType.SSO,
                        timeoutSeconds: 300,
                        priority: 'interactive',
                        retries: 3,
                        location: undefined,
                        maximumBytesBilled: undefined,
                        keyfileContents: {
                            type: 'authorized_user',
                            client_id: 'client',
                            client_secret: 'private-secret',
                            refresh_token: 'old-token',
                        },
                    };
                    let stored: CreateWarehouseCredentials = {
                        ...initial,
                        ...(version === null
                            ? {}
                            : { resultIdentityVersion: version }),
                    };
                    const row = () => ({
                        project_id: 1,
                        project_uuid: 'preview',
                        warehouse_credentials_id: 9,
                        encrypted_credentials: Buffer.from(
                            JSON.stringify(stored),
                        ),
                        credential_subject_user_uuid: 'user',
                        organization_warehouse_credentials_uuid: null,
                        upstream_project_id: null,
                    });
                    tracker.on
                        .select('warehouse_credentials')
                        .response(() => [row()]);
                    tracker.on
                        .update('warehouse_credentials')
                        .response(({ bindings }) => {
                            const encrypted = bindings.find(Buffer.isBuffer);
                            if (encrypted) stored = decode(encrypted);
                            return [row()];
                        });
                    const identity = () =>
                        getWarehouseIdentityFingerprint(
                            withWarehouseCredentialVersion(
                                stored,
                                'warehouse_credentials:9',
                            ),
                        );
                    const save = async (refreshToken: string) => {
                        const keyfileContents = {
                            ...initial.keyfileContents,
                            refresh_token: refreshToken,
                        };
                        const update = (
                            current: CreateWarehouseCredentials,
                        ) => {
                            expect(current).not.toHaveProperty(
                                'resultIdentityVersion',
                            );
                            return {
                                ...current,
                                keyfileContents,
                            } as CreateBigqueryCredentials;
                        };
                        switch (kind) {
                            case 'preview':
                                return projectModel[
                                    'rewritePreviewWarehouseCredentials'
                                ](
                                    database as Knex.Transaction,
                                    'upstream',
                                    { signIn: null, subjectUserUuid: null },
                                    update,
                                );
                            case 'repair':
                                return projectModel.updateWarehouseCredentialsIf(
                                    'preview',
                                    update,
                                );
                            case 'reconnect':
                                return projectModel.reconnectSharedSignIn(
                                    'preview',
                                    'old-token',
                                    'user',
                                    keyfileContents,
                                    'user',
                                    null,
                                );
                            default:
                                return assertUnreachable(
                                    kind,
                                    'Unknown refresh path',
                                );
                        }
                    };
                    const before = identity();
                    await save('old-token');
                    expect(identity()).toBe(before);
                    await save('new-token');
                    if (kind === 'repair') expect(identity()).toBe(before);
                    else expect(identity()).not.toBe(before);
                },
            );
        },
    );
});

describe('cloned credential version envelopes', () => {
    test('reattaches every source version without exposing or mutating the list', () => {
        const sourceVersions = ['project-version', 'personal-version'];
        const envelope = structuredClone({ credentials, sourceVersions });
        const loaded = withWarehouseCredentialVersions(
            envelope.credentials,
            envelope.sourceVersions,
        );
        envelope.sourceVersions.push('later');
        expect(getWarehouseCredentialVersions(loaded)).toEqual(sourceVersions);
        expect(loaded).toEqual(credentials);
        expect(loaded).not.toHaveProperty('resultIdentityVersion');
    });

    test('an empty envelope does not create a credential version', () => {
        const loaded = withWarehouseCredentialVersions({ ...credentials }, []);
        expect(getWarehouseCredentialVersions(loaded)).toEqual([]);
        expect(getWarehouseIdentityFingerprint(loaded)).toBeNull();
    });
});

describe('credential binding equality', () => {
    test('result version metadata does not change the warehouse binding', () => {
        const stored = {
            ...credentials,
            resultIdentityVersion: 'stored-version',
        };
        const next = { ...credentials, resultIdentityVersion: 'next-version' };
        expect(warehouseCredentialsEqual(stored, next)).toBe(true);
        expect(warehouseCredentialsEqual(stored, credentials)).toBe(true);
        expect(
            warehouseCredentialsEqual(stored, {
                ...next,
                personalAccessToken: 'replacement-token',
            }),
        ).toBe(false);
    });

    test('OAuth token refresh keeps the binding while a host change replaces it', () => {
        const stored: CreateDatabricksCredentials = {
            ...credentials,
            authenticationType: DatabricksAuthenticationType.OAUTH_U2M,
            token: 'old-token',
        };
        const next = {
            ...stored,
            token: 'new-token',
            resultIdentityVersion: 'new-version',
        };
        expect(warehouseCredentialsEqual(stored, next)).toBe(true);
        expect(
            warehouseCredentialsEqual(stored, {
                ...next,
                serverHostName: 'replacement-host',
            }),
        ).toBe(false);
    });
});
