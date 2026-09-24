import {
    AthenaAuthenticationType,
    BigqueryAuthenticationType,
    ConflictError,
    DatabricksAuthenticationType,
    DbtProjectType,
    DefaultSupportedDbtVersion,
    DuckdbConnectionType,
    ForbiddenError,
    MissingWarehouseCredentialsError,
    NotFoundError,
    RedshiftAuthenticationType,
    SnowflakeAuthenticationType,
    WarehouseTypes,
    type CreateWarehouseCredentials,
} from '@lightdash/common';
import { type Knex } from 'knex';
import { lightdashConfigMock } from '../../../config/lightdashConfig.mock';
import { OrganizationWarehouseCredentialsModel } from '../../../models/OrganizationWarehouseCredentialsModel';
import {
    ORIGINAL_TYPE_LOCKED_MESSAGE,
    ProjectModel,
} from '../../../models/ProjectModel/ProjectModel';
import { UserWarehouseCredentialsModel } from '../../../models/UserWarehouseCredentials/UserWarehouseCredentialsModel';
import { WarehouseConnectionModel } from '../../../models/WarehouseConnectionModel/WarehouseConnectionModel';
import { type ConnectionBinding } from '../../../models/WarehouseConnectionRouter/WarehouseConnectionRouter';
import { ProjectService } from '../../../services/ProjectService/ProjectService';
import { EXTRA_CONNECTION_SELECT_CREDENTIALS_MESSAGE } from '../../../services/WarehouseConnectionService/extraConnectionUserCredentials';
import { EncryptionUtil } from '../../../utils/EncryptionUtil/EncryptionUtil';
import {
    createMigratedTestDatabase,
    type MigratedTestDatabase,
} from './migratedTestDatabase';

const SECRET = 'warehouse-connection-credentials-test-secret';

type CredentialCall = {
    projectUuid: string;
    userId: string;
    isRegisteredUser: boolean;
    isServiceAccount?: boolean;
};

type CredentialsResult = CreateWarehouseCredentials & {
    userWarehouseCredentialsUuid: string | undefined;
};

type ProjectServiceCredentials = {
    getWarehouseCredentials: (
        args: CredentialCall & { binding: ConnectionBinding },
    ) => Promise<CredentialsResult>;
    getExtraConnectionWarehouseCredentials: (
        args: CredentialCall & { warehouseConnectionUuid: string },
    ) => Promise<CredentialsResult>;
    refreshCredentials: (
        args: CreateWarehouseCredentials,
        userUuid: string,
    ) => Promise<CreateWarehouseCredentials>;
};

type Outcome =
    | { ok: CredentialsResult }
    | { error: { name: string; message: string } };

type ParityCase = {
    name: string;
    project: CreateWarehouseCredentials;
    personal: Record<string, unknown> | null;
    organizationCredential?: boolean;
    caller?: 'registered' | 'serviceAccount' | 'embed';
};

const withRequire = (
    credentials: CreateWarehouseCredentials,
    requireUserCredentials: boolean,
) => ({ ...credentials, requireUserCredentials }) as CreateWarehouseCredentials;

const postgres: CreateWarehouseCredentials = {
    type: WarehouseTypes.POSTGRES,
    host: 'project-host',
    user: 'project-user',
    password: 'project-secret-password',
    port: 5432,
    dbname: 'project-db',
    schema: 'public',
};

const trino: CreateWarehouseCredentials = {
    type: WarehouseTypes.TRINO,
    host: 'project-host',
    user: 'project-user',
    password: 'project-secret-password',
    port: 443,
    dbname: 'project-catalog',
    schema: 'public',
    http_scheme: 'https',
};

const clickhouse: CreateWarehouseCredentials = {
    type: WarehouseTypes.CLICKHOUSE,
    host: 'project-host',
    user: 'project-user',
    password: 'project-secret-password',
    port: 8443,
    schema: 'default',
    secure: true,
};

const redshiftPassword: CreateWarehouseCredentials = {
    type: WarehouseTypes.REDSHIFT,
    host: 'project-host',
    user: 'project-user',
    password: 'project-secret-password',
    port: 5439,
    dbname: 'project-db',
    schema: 'public',
    authenticationType: RedshiftAuthenticationType.PASSWORD,
    assumeRoleArn: 'arn:aws:iam::111111111111:role/project-role',
};

const redshiftIam: CreateWarehouseCredentials = {
    type: WarehouseTypes.REDSHIFT,
    host: 'project-host',
    user: 'project-user',
    password: '',
    port: 5439,
    dbname: 'project-db',
    schema: 'public',
    authenticationType: RedshiftAuthenticationType.IAM,
    accessKeyId: 'project-access-key-id',
    secretAccessKey: 'project-secret-access-key',
    sessionToken: 'project-session-token',
    assumeRoleArn: 'arn:aws:iam::111111111111:role/project-role',
    assumeRoleExternalId: 'project-external-id',
};

const athenaAccessKey: CreateWarehouseCredentials = {
    type: WarehouseTypes.ATHENA,
    region: 'us-east-1',
    database: 'AwsDataCatalog',
    schema: 'project-schema',
    s3StagingDir: 's3://bucket/staging/',
    authenticationType: AthenaAuthenticationType.ACCESS_KEY,
    accessKeyId: 'project-access-key-id',
    secretAccessKey: 'project-secret-access-key',
};

const athenaAssumeRole: CreateWarehouseCredentials = {
    ...athenaAccessKey,
    assumeRoleArn: 'arn:aws:iam::111111111111:role/project-role',
    assumeRoleExternalId: 'project-external-id',
};

const snowflake: CreateWarehouseCredentials = {
    type: WarehouseTypes.SNOWFLAKE,
    account: 'acct',
    user: 'project-user',
    database: 'db',
    warehouse: 'wh',
    schema: 'schema',
    authenticationType: SnowflakeAuthenticationType.PASSWORD,
    password: 'project-secret-password',
    privateKey: 'project-secret-private-key',
    privateKeyPass: 'project-secret-private-key-pass',
};

const snowflakeKey: CreateWarehouseCredentials = {
    type: WarehouseTypes.SNOWFLAKE,
    account: 'acct',
    user: 'project-user',
    database: 'db',
    warehouse: 'wh',
    schema: 'schema',
    authenticationType: SnowflakeAuthenticationType.PRIVATE_KEY,
    privateKey: 'project-secret-private-key',
    privateKeyPass: 'project-secret-private-key-pass',
};

const bigquery: CreateWarehouseCredentials = {
    type: WarehouseTypes.BIGQUERY,
    project: 'project-gcp-project',
    dataset: 'project-dataset',
    timeoutSeconds: undefined,
    priority: undefined,
    keyfileContents: { private_key: 'project-secret-key' },
    authenticationType: BigqueryAuthenticationType.PRIVATE_KEY,
    retries: undefined,
    location: undefined,
    maximumBytesBilled: undefined,
};

const databricksM2m: CreateWarehouseCredentials = {
    type: WarehouseTypes.DATABRICKS,
    database: 'project-schema',
    serverHostName: 'project-host.cloud.databricks.com',
    httpPath: '/sql/1.0/warehouses/project',
    authenticationType: DatabricksAuthenticationType.OAUTH_M2M,
    oauthClientId: 'project-oauth-client',
    oauthClientSecret: 'project-oauth-secret',
};

const databricksPat: CreateWarehouseCredentials = {
    type: WarehouseTypes.DATABRICKS,
    database: 'project-schema',
    serverHostName: 'project-host.cloud.databricks.com',
    httpPath: '/sql/1.0/warehouses/project',
    authenticationType: DatabricksAuthenticationType.PERSONAL_ACCESS_TOKEN,
    personalAccessToken: 'project-secret-token',
};

const motherduck: CreateWarehouseCredentials = {
    type: WarehouseTypes.DUCKDB,
    connectionType: DuckdbConnectionType.MOTHERDUCK,
    database: 'project-database',
    schema: 'project-schema',
    token: 'project-secret-token',
};

const passwordPersonal = (type: WarehouseTypes) => ({
    type,
    user: 'personal-user',
    password: 'personal-secret-password',
});

const baseCases: ParityCase[] = [
    {
        name: 'Postgres password',
        project: postgres,
        personal: passwordPersonal(WarehouseTypes.POSTGRES),
    },
    {
        name: 'Trino password',
        project: trino,
        personal: passwordPersonal(WarehouseTypes.TRINO),
    },
    {
        name: 'ClickHouse password',
        project: clickhouse,
        personal: passwordPersonal(WarehouseTypes.CLICKHOUSE),
    },
    {
        name: 'Redshift password with an assume-role ARN',
        project: redshiftPassword,
        personal: passwordPersonal(WarehouseTypes.REDSHIFT),
    },
    {
        name: 'Redshift IAM with session token, ARN and external ID',
        project: redshiftIam,
        personal: {
            type: WarehouseTypes.REDSHIFT,
            user: 'personal-user',
            authenticationType: RedshiftAuthenticationType.IAM,
            accessKeyId: 'personal-access-key-id',
            secretAccessKey: 'personal-secret-access-key',
            sessionToken: 'personal-session-token',
            assumeRoleArn: 'arn:aws:iam::222222222222:role/personal-role',
        },
    },
    {
        name: 'Athena access key',
        project: athenaAccessKey,
        personal: {
            type: WarehouseTypes.ATHENA,
            accessKeyId: 'personal-access-key-id',
            secretAccessKey: 'personal-secret-access-key',
        },
    },
    {
        name: 'Athena assume-role',
        project: athenaAssumeRole,
        personal: {
            type: WarehouseTypes.ATHENA,
            accessKeyId: 'personal-access-key-id',
            secretAccessKey: 'personal-secret-access-key',
        },
    },
    {
        name: 'Snowflake password',
        project: snowflake,
        personal: {
            type: WarehouseTypes.SNOWFLAKE,
            user: 'personal-user',
            authenticationType: SnowflakeAuthenticationType.PASSWORD,
            password: 'personal-secret-password',
        },
    },
    {
        name: 'Snowflake key and passphrase',
        project: snowflakeKey,
        personal: {
            type: WarehouseTypes.SNOWFLAKE,
            user: 'personal-user',
            authenticationType: SnowflakeAuthenticationType.PRIVATE_KEY,
            privateKey: 'personal-secret-key',
            privateKeyPass: 'personal-secret-key-pass',
        },
    },
    {
        name: 'BigQuery keyfile',
        project: bigquery,
        personal: {
            type: WarehouseTypes.BIGQUERY,
            authenticationType: BigqueryAuthenticationType.SSO,
            keyfileContents: {
                client_email: 'personal-secret-email',
                refresh_token: 'personal-refresh-token',
            },
        },
    },
    {
        name: 'BigQuery keyfile with no refresh token',
        project: bigquery,
        personal: {
            type: WarehouseTypes.BIGQUERY,
            authenticationType: BigqueryAuthenticationType.SSO,
            keyfileContents: { client_email: 'personal-secret-email' },
        },
    },
    {
        name: 'Databricks M2M secrets under a personal access token',
        project: databricksM2m,
        personal: {
            type: WarehouseTypes.DATABRICKS,
            authenticationType:
                DatabricksAuthenticationType.PERSONAL_ACCESS_TOKEN,
            personalAccessToken: 'personal-secret-token',
        },
    },
    {
        name: 'Databricks personal access token',
        project: databricksPat,
        personal: {
            type: WarehouseTypes.DATABRICKS,
            authenticationType:
                DatabricksAuthenticationType.PERSONAL_ACCESS_TOKEN,
            personalAccessToken: 'personal-secret-token',
            serverHostName: 'project-host.cloud.databricks.com',
        },
    },
    {
        name: 'Databricks personal token for another host',
        project: databricksPat,
        personal: {
            type: WarehouseTypes.DATABRICKS,
            authenticationType:
                DatabricksAuthenticationType.PERSONAL_ACCESS_TOKEN,
            personalAccessToken: 'personal-secret-token',
            serverHostName: 'other-host.cloud.databricks.com',
        },
    },
    {
        name: 'MotherDuck token',
        project: motherduck,
        personal: { type: WarehouseTypes.DUCKDB, token: 'personal-token' },
    },
    {
        name: 'Postgres with no personal credential',
        project: postgres,
        personal: null,
    },
    {
        name: 'Databricks with no personal credential',
        project: databricksM2m,
        personal: null,
    },
    {
        name: 'Postgres on an organisation credential',
        project: postgres,
        personal: passwordPersonal(WarehouseTypes.POSTGRES),
        organizationCredential: true,
    },
    {
        name: 'Snowflake on an organisation credential',
        project: snowflake,
        personal: null,
        organizationCredential: true,
    },
    {
        name: 'Postgres for a service account',
        project: postgres,
        personal: passwordPersonal(WarehouseTypes.POSTGRES),
        caller: 'serviceAccount',
    },
    {
        name: 'Postgres for an embedded user',
        project: postgres,
        personal: passwordPersonal(WarehouseTypes.POSTGRES),
        caller: 'embed',
    },
];

const parityCases = baseCases.flatMap((parityCase) =>
    [true, false].map((requireUserCredentials) => ({
        ...parityCase,
        requireUserCredentials,
        project: withRequire(parityCase.project, requireUserCredentials),
    })),
);

describe('Extra connection credentials on the real schema', () => {
    let migrated: MigratedTestDatabase;
    let database: Knex;
    let encryptionUtil: EncryptionUtil;
    let service: ProjectService;
    let credentialsApi: ProjectServiceCredentials;

    const encrypt = (value: unknown) =>
        encryptionUtil.encrypt(JSON.stringify(value));

    const decryptConnection = async (warehouseConnectionUuid: string) => {
        const row = await database('warehouse_connections')
            .where('warehouse_connection_uuid', warehouseConnectionUuid)
            .first('encrypted_credentials');
        return JSON.parse(encryptionUtil.decrypt(row.encrypted_credentials));
    };

    const createOrganization = async () => {
        const [organization] = await database('organizations')
            .insert({ organization_name: 'Credentials test' })
            .returning(['organization_id', 'organization_uuid']);
        const [user] = await database('users')
            .insert({ first_name: 'Test', last_name: 'User' } as never)
            .returning('user_uuid');
        return {
            organizationId: organization.organization_id as number,
            organizationUuid: organization.organization_uuid as string,
            userUuid: user.user_uuid as string,
        };
    };

    type Organization = Awaited<ReturnType<typeof createOrganization>>;

    const createOrganizationCredential = async (
        organization: Organization,
        credentials: CreateWarehouseCredentials,
    ) =>
        (
            await database('organization_warehouse_credentials')
                .insert({
                    organization_uuid: organization.organizationUuid,
                    name: `Shared ${Math.random()}`,
                    warehouse_type: credentials.type,
                    warehouse_connection: encrypt(credentials),
                } as never)
                .returning('organization_warehouse_credentials_uuid')
        )[0].organization_warehouse_credentials_uuid as string;

    const createProject = async (
        organization: Organization,
        {
            mode,
            credentials,
            organizationWarehouseCredentialsUuid = null,
        }: {
            mode: 'single' | 'multi';
            credentials: CreateWarehouseCredentials;
            organizationWarehouseCredentialsUuid?: string | null;
        },
    ) => {
        const [project] = await database('projects')
            .insert({
                name: 'Credentials project',
                organization_id: organization.organizationId,
                connection_mode: mode,
                organization_warehouse_credentials_uuid:
                    organizationWarehouseCredentialsUuid,
            } as never)
            .returning(['project_id', 'project_uuid']);
        await database('warehouse_credentials').insert({
            project_id: project.project_id,
            warehouse_type: credentials.type,
            encrypted_credentials: encrypt(credentials),
        } as never);
        if (mode === 'multi') {
            await database('warehouse_connections').insert({
                project_uuid: project.project_uuid,
                is_original: true,
                name: 'Original',
            });
        }
        return project.project_uuid as string;
    };

    const createExtra = async (
        projectUuid: string,
        {
            credentials,
            organizationWarehouseCredentialsUuid = null,
            name = 'Extra',
        }: {
            credentials: CreateWarehouseCredentials;
            organizationWarehouseCredentialsUuid?: string | null;
            name?: string;
        },
    ) =>
        (
            await database('warehouse_connections')
                .insert({
                    project_uuid: projectUuid,
                    is_original: false,
                    name,
                    warehouse_type: credentials.type,
                    encrypted_credentials:
                        organizationWarehouseCredentialsUuid === null
                            ? encrypt(credentials)
                            : null,
                    organization_warehouse_credentials_uuid:
                        organizationWarehouseCredentialsUuid,
                })
                .returning('warehouse_connection_uuid')
        )[0].warehouse_connection_uuid as string;

    const createPersonal = async (
        userUuid: string,
        credentials: Record<string, unknown>,
        projectUuid: string | null = null,
    ) =>
        (
            await database('user_warehouse_credentials')
                .insert({
                    user_uuid: userUuid,
                    name: `Personal ${Math.random()}`,
                    warehouse_type: credentials.type,
                    encrypted_credentials: encrypt(credentials),
                    project_uuid: projectUuid,
                } as never)
                .returning('user_warehouse_credentials_uuid')
        )[0].user_warehouse_credentials_uuid as string;

    const preferForProject = (
        userUuid: string,
        projectUuid: string,
        userWarehouseCredentialsUuid: string,
    ) =>
        database('project_user_warehouse_credentials_preference').insert({
            user_uuid: userUuid,
            project_uuid: projectUuid,
            user_warehouse_credentials_uuid: userWarehouseCredentialsUuid,
        });

    const preferForConnection = (
        userUuid: string,
        warehouseConnectionUuid: string,
        userWarehouseCredentialsUuid: string,
    ) =>
        database('warehouse_connection_user_credentials_preference').insert({
            user_uuid: userUuid,
            warehouse_connection_uuid: warehouseConnectionUuid,
            user_warehouse_credentials_uuid: userWarehouseCredentialsUuid,
        });

    const connectionPreference = async (
        userUuid: string,
        warehouseConnectionUuid: string,
    ) =>
        (
            await database('warehouse_connection_user_credentials_preference')
                .where('user_uuid', userUuid)
                .where('warehouse_connection_uuid', warehouseConnectionUuid)
                .first('user_warehouse_credentials_uuid')
        )?.user_warehouse_credentials_uuid ?? null;

    const outcome = (run: Promise<CredentialsResult>): Promise<Outcome> =>
        run.then(
            (ok) => ({ ok }),
            (error: Error) => ({
                error: { name: error.name, message: error.message },
            }),
        );

    const callerArgs = (userUuid: string, caller: ParityCase['caller']) => ({
        userId: userUuid,
        isRegisteredUser: caller !== 'embed',
        isServiceAccount: caller === 'serviceAccount',
    });

    const extraCredentials = (
        projectUuid: string,
        warehouseConnectionUuid: string,
        userUuid: string,
        caller: ParityCase['caller'] = 'registered',
    ) =>
        credentialsApi.getExtraConnectionWarehouseCredentials({
            projectUuid,
            warehouseConnectionUuid,
            ...callerArgs(userUuid, caller),
        });

    beforeAll(async () => {
        migrated = await createMigratedTestDatabase(
            'warehouse_connection_credentials',
        );
        database = migrated.database;
        encryptionUtil = new EncryptionUtil({
            lightdashConfig: {
                lightdashSecret: SECRET,
                lightdashSecrets: {
                    active: SECRET,
                    fallbacks: [],
                    all: [SECRET],
                },
            },
        } as never);
        const organizationWarehouseCredentialsModel =
            new OrganizationWarehouseCredentialsModel({
                database,
                encryptionUtil,
            });
        service = new ProjectService({
            lightdashConfig: lightdashConfigMock,
            projectModel: new ProjectModel({
                database,
                lightdashConfig: lightdashConfigMock,
                encryptionUtil,
            }),
            userWarehouseCredentialsModel: new UserWarehouseCredentialsModel({
                database,
                encryptionUtil,
            }),
            organizationWarehouseCredentialsModel,
            warehouseConnectionModel: new WarehouseConnectionModel({
                database,
                encryptionUtil,
                organizationWarehouseCredentialsModel,
            }),
        } as never);
        credentialsApi = service as unknown as ProjectServiceCredentials;
    }, 600000);

    afterAll(async () => {
        await migrated?.destroy();
    });

    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(credentialsApi, 'refreshCredentials').mockImplementation(
            async (args) => args,
        );
    });

    describe('parity with the original connection on the same stored blob', () => {
        test.each(parityCases)(
            '$name, requireUserCredentials $requireUserCredentials',
            async ({ project, personal, organizationCredential, caller }) => {
                const organization = await createOrganization();
                const organizationCredentialUuid = organizationCredential
                    ? await createOrganizationCredential(organization, project)
                    : null;
                const singleProject = await createProject(organization, {
                    mode: 'single',
                    credentials: project,
                    organizationWarehouseCredentialsUuid:
                        organizationCredentialUuid,
                });
                const multiProject = await createProject(organization, {
                    mode: 'multi',
                    credentials: project,
                    organizationWarehouseCredentialsUuid:
                        organizationCredentialUuid,
                });
                const extra = await createExtra(multiProject, {
                    credentials: project,
                    organizationWarehouseCredentialsUuid:
                        organizationCredentialUuid,
                });
                const personalUuid = personal
                    ? await createPersonal(organization.userUuid, personal)
                    : null;
                if (personalUuid) {
                    await preferForProject(
                        organization.userUuid,
                        singleProject,
                        personalUuid,
                    );
                    await preferForConnection(
                        organization.userUuid,
                        extra,
                        personalUuid,
                    );
                }

                const main = await outcome(
                    credentialsApi.getWarehouseCredentials({
                        projectUuid: singleProject,
                        ...callerArgs(organization.userUuid, caller),
                        binding: { kind: 'original' },
                    }),
                );
                const extraOutcome = await outcome(
                    extraCredentials(
                        multiProject,
                        extra,
                        organization.userUuid,
                        caller,
                    ),
                );

                expect(extraOutcome).toEqual(main);
            },
        );

        test('the matrix covers merged, unmerged and refused outcomes', async () => {
            const organization = await createOrganization();
            const project = withRequire(athenaAssumeRole, true);
            const multiProject = await createProject(organization, {
                mode: 'multi',
                credentials: project,
            });
            const extra = await createExtra(multiProject, {
                credentials: project,
            });
            const personalUuid = await createPersonal(organization.userUuid, {
                type: WarehouseTypes.ATHENA,
                accessKeyId: 'personal-access-key-id',
                secretAccessKey: 'personal-secret-access-key',
            });
            await preferForConnection(
                organization.userUuid,
                extra,
                personalUuid,
            );

            const result = await extraCredentials(
                multiProject,
                extra,
                organization.userUuid,
            );

            expect(result).toEqual({
                ...project,
                accessKeyId: 'personal-access-key-id',
                secretAccessKey: 'personal-secret-access-key',
                assumeRoleArn: 'arn:aws:iam::111111111111:role/project-role',
                assumeRoleExternalId: 'project-external-id',
                requireUserCredentials: true,
                userWarehouseCredentialsUuid: personalUuid,
            });
        });
    });

    describe('D5: require user credentials comes from the original', () => {
        test('an extra connection requires personal credentials when the original does, whatever its own blob says', async () => {
            const organization = await createOrganization();
            const multiProject = await createProject(organization, {
                mode: 'multi',
                credentials: withRequire(postgres, true),
            });
            const extra = await createExtra(multiProject, {
                credentials: withRequire(postgres, false),
            });

            await expect(
                extraCredentials(multiProject, extra, organization.userUuid),
            ).rejects.toBeInstanceOf(MissingWarehouseCredentialsError);
        });

        test('an extra connection does not require personal credentials when the original does not, whatever its own blob says', async () => {
            const organization = await createOrganization();
            const multiProject = await createProject(organization, {
                mode: 'multi',
                credentials: withRequire(postgres, false),
            });
            const extra = await createExtra(multiProject, {
                credentials: withRequire(
                    { ...postgres, host: 'extra-host' },
                    true,
                ),
            });
            const personalUuid = await createPersonal(
                organization.userUuid,
                passwordPersonal(WarehouseTypes.POSTGRES),
            );
            await preferForConnection(
                organization.userUuid,
                extra,
                personalUuid,
            );

            const result = await extraCredentials(
                multiProject,
                extra,
                organization.userUuid,
            );

            expect(result).toMatchObject({
                host: 'extra-host',
                user: 'project-user',
                password: 'project-secret-password',
                requireUserCredentials: false,
                userWarehouseCredentialsUuid: undefined,
            });
        });
    });

    describe('D13: an organisation credential that requires personal credentials', () => {
        test('requires them on the extra connection even when the original does not', async () => {
            const organization = await createOrganization();
            const organizationCredential = await createOrganizationCredential(
                organization,
                withRequire({ ...postgres, host: 'shared-host' }, true),
            );
            const multiProject = await createProject(organization, {
                mode: 'multi',
                credentials: withRequire(postgres, false),
            });
            const extra = await createExtra(multiProject, {
                credentials: postgres,
                organizationWarehouseCredentialsUuid: organizationCredential,
            });

            await expect(
                extraCredentials(multiProject, extra, organization.userUuid),
            ).rejects.toBeInstanceOf(MissingWarehouseCredentialsError);

            const personalUuid = await createPersonal(
                organization.userUuid,
                passwordPersonal(WarehouseTypes.POSTGRES),
            );
            await preferForConnection(
                organization.userUuid,
                extra,
                personalUuid,
            );
            expect(
                await extraCredentials(
                    multiProject,
                    extra,
                    organization.userUuid,
                ),
            ).toMatchObject({
                host: 'shared-host',
                user: 'personal-user',
                password: 'personal-secret-password',
                requireUserCredentials: true,
                userWarehouseCredentialsUuid: personalUuid,
            });
        });

        test('an organisation credential that does not require them keeps the original value', async () => {
            const organization = await createOrganization();
            const organizationCredential = await createOrganizationCredential(
                organization,
                withRequire({ ...postgres, host: 'shared-host' }, false),
            );
            const multiProject = await createProject(organization, {
                mode: 'multi',
                credentials: withRequire(postgres, false),
            });
            const extra = await createExtra(multiProject, {
                credentials: postgres,
                organizationWarehouseCredentialsUuid: organizationCredential,
            });

            expect(
                await extraCredentials(
                    multiProject,
                    extra,
                    organization.userUuid,
                ),
            ).toMatchObject({
                host: 'shared-host',
                user: 'project-user',
                requireUserCredentials: false,
                userWarehouseCredentialsUuid: undefined,
            });
        });
    });

    describe('D6: personal credential with no choice made', () => {
        const requiredExtra = async () => {
            const organization = await createOrganization();
            const multiProject = await createProject(organization, {
                mode: 'multi',
                credentials: withRequire(postgres, true),
            });
            const extra = await createExtra(multiProject, {
                credentials: postgres,
            });
            return { organization, multiProject, extra };
        };

        test('selects the only fitting credential and saves the choice', async () => {
            const { organization, multiProject, extra } = await requiredExtra();
            const personalUuid = await createPersonal(
                organization.userUuid,
                passwordPersonal(WarehouseTypes.POSTGRES),
            );
            await createPersonal(organization.userUuid, {
                type: WarehouseTypes.SNOWFLAKE,
                user: 'other-type',
                password: 'other-type',
            });

            const result = await extraCredentials(
                multiProject,
                extra,
                organization.userUuid,
            );

            expect(result).toMatchObject({
                user: 'personal-user',
                password: 'personal-secret-password',
                userWarehouseCredentialsUuid: personalUuid,
            });
            expect(
                await connectionPreference(organization.userUuid, extra),
            ).toBe(personalUuid);
        });

        test('asks the user to choose when two credentials fit, and saves nothing', async () => {
            const { organization, multiProject, extra } = await requiredExtra();
            await createPersonal(
                organization.userUuid,
                passwordPersonal(WarehouseTypes.POSTGRES),
            );
            await createPersonal(
                organization.userUuid,
                passwordPersonal(WarehouseTypes.POSTGRES),
            );

            await expect(
                extraCredentials(multiProject, extra, organization.userUuid),
            ).rejects.toThrow(EXTRA_CONNECTION_SELECT_CREDENTIALS_MESSAGE);
            expect(
                await connectionPreference(organization.userUuid, extra),
            ).toBeNull();
        });

        test('selects the one fitting credential that no other connection claims', async () => {
            const { organization, multiProject, extra } = await requiredExtra();
            const claimedByOriginal = await createPersonal(
                organization.userUuid,
                passwordPersonal(WarehouseTypes.POSTGRES),
            );
            await preferForProject(
                organization.userUuid,
                multiProject,
                claimedByOriginal,
            );
            const unclaimed = await createPersonal(organization.userUuid, {
                ...passwordPersonal(WarehouseTypes.POSTGRES),
                user: 'unclaimed-user',
            });

            expect(
                await extraCredentials(
                    multiProject,
                    extra,
                    organization.userUuid,
                ),
            ).toMatchObject({
                user: 'unclaimed-user',
                userWarehouseCredentialsUuid: unclaimed,
            });
        });

        test('ignores a credential assigned to another project', async () => {
            const { organization, multiProject, extra } = await requiredExtra();
            const otherProject = await createProject(organization, {
                mode: 'single',
                credentials: postgres,
            });
            await createPersonal(
                organization.userUuid,
                passwordPersonal(WarehouseTypes.POSTGRES),
                otherProject,
            );

            await expect(
                extraCredentials(multiProject, extra, organization.userUuid),
            ).rejects.toBeInstanceOf(MissingWarehouseCredentialsError);
        });

        test('a saved choice wins over the only fitting credential', async () => {
            const { organization, multiProject, extra } = await requiredExtra();
            const chosen = await createPersonal(organization.userUuid, {
                ...passwordPersonal(WarehouseTypes.POSTGRES),
                user: 'chosen-user',
            });
            await createPersonal(
                organization.userUuid,
                passwordPersonal(WarehouseTypes.POSTGRES),
            );
            await preferForConnection(organization.userUuid, extra, chosen);

            expect(
                await extraCredentials(
                    multiProject,
                    extra,
                    organization.userUuid,
                ),
            ).toMatchObject({
                user: 'chosen-user',
                userWarehouseCredentialsUuid: chosen,
            });
        });
    });

    describe('P6 guard: never the newest credential of the type', () => {
        test('a saved choice whose credential was edited to another warehouse type is not merged, and the user is asked again', async () => {
            const organization = await createOrganization();
            const project = await createProject(organization, {
                mode: 'multi',
                credentials: withRequire(postgres, true),
            });
            const extra = await createExtra(project, { credentials: postgres });
            const personal = await createPersonal(organization.userUuid, {
                type: WarehouseTypes.POSTGRES,
                user: 'personal-user',
                password: 'personal-password',
            });
            await preferForConnection(organization.userUuid, extra, personal);
            await new UserWarehouseCredentialsModel({
                database,
                encryptionUtil,
            }).update(organization.userUuid, personal, {
                name: 'Personal',
                credentials: {
                    type: WarehouseTypes.SNOWFLAKE,
                    user: 'snowflake-user',
                    password: 'snowflake-password',
                },
            } as never);

            await expect(
                extraCredentials(project, extra, organization.userUuid),
            ).rejects.toBeInstanceOf(MissingWarehouseCredentialsError);
            await expect(
                credentialsApi.getWarehouseCredentials({
                    projectUuid: project,
                    userId: organization.userUuid,
                    isRegisteredUser: true,
                    binding: {
                        kind: 'connection',
                        warehouseConnectionUuid: extra,
                    },
                }),
            ).rejects.toBeInstanceOf(MissingWarehouseCredentialsError);
        });

        test('a credential chosen for project A is not used for an extra connection in project B', async () => {
            const organization = await createOrganization();
            const projectA = await createProject(organization, {
                mode: 'single',
                credentials: withRequire(postgres, true),
            });
            const projectB = await createProject(organization, {
                mode: 'multi',
                credentials: withRequire(postgres, true),
            });
            const extra = await createExtra(projectB, {
                credentials: postgres,
            });
            const chosenForA = await createPersonal(
                organization.userUuid,
                passwordPersonal(WarehouseTypes.POSTGRES),
            );
            await preferForProject(organization.userUuid, projectA, chosenForA);

            await expect(
                extraCredentials(projectB, extra, organization.userUuid),
            ).rejects.toThrow(EXTRA_CONNECTION_SELECT_CREDENTIALS_MESSAGE);
            expect(
                await connectionPreference(organization.userUuid, extra),
            ).toBeNull();
        });

        test('a credential chosen for an extra connection in project A is not used in project B', async () => {
            const organization = await createOrganization();
            const projectA = await createProject(organization, {
                mode: 'multi',
                credentials: withRequire(postgres, true),
            });
            const extraA = await createExtra(projectA, {
                credentials: postgres,
            });
            const projectB = await createProject(organization, {
                mode: 'multi',
                credentials: withRequire(postgres, true),
            });
            const extraB = await createExtra(projectB, {
                credentials: postgres,
            });
            const chosenForA = await createPersonal(
                organization.userUuid,
                passwordPersonal(WarehouseTypes.POSTGRES),
            );
            await preferForConnection(
                organization.userUuid,
                extraA,
                chosenForA,
            );

            await expect(
                extraCredentials(projectB, extraB, organization.userUuid),
            ).rejects.toThrow(EXTRA_CONNECTION_SELECT_CREDENTIALS_MESSAGE);
        });

        test('optional personal credentials are used only when chosen for the connection, while main keeps its newest-credential fallback', async () => {
            const organization = await createOrganization();
            const project = withRequire(databricksM2m, false);
            const singleProject = await createProject(organization, {
                mode: 'single',
                credentials: project,
            });
            const multiProject = await createProject(organization, {
                mode: 'multi',
                credentials: project,
            });
            const extra = await createExtra(multiProject, {
                credentials: project,
            });
            const personalUuid = await createPersonal(organization.userUuid, {
                type: WarehouseTypes.DATABRICKS,
                authenticationType:
                    DatabricksAuthenticationType.PERSONAL_ACCESS_TOKEN,
                personalAccessToken: 'personal-secret-token',
            });

            expect(
                await credentialsApi.getWarehouseCredentials({
                    projectUuid: singleProject,
                    userId: organization.userUuid,
                    isRegisteredUser: true,
                    binding: { kind: 'original' },
                }),
            ).toMatchObject({ userWarehouseCredentialsUuid: personalUuid });
            expect(
                await extraCredentials(
                    multiProject,
                    extra,
                    organization.userUuid,
                ),
            ).toMatchObject({
                authenticationType: DatabricksAuthenticationType.OAUTH_M2M,
                userWarehouseCredentialsUuid: undefined,
            });
        });
    });

    describe('tenancy (K11)', () => {
        test('refuses an extra connection from another project', async () => {
            const organization = await createOrganization();
            const owner = await createProject(organization, {
                mode: 'multi',
                credentials: postgres,
            });
            const extra = await createExtra(owner, { credentials: postgres });
            const other = await createProject(organization, {
                mode: 'multi',
                credentials: postgres,
            });

            await expect(
                extraCredentials(other, extra, organization.userUuid),
            ).rejects.toBeInstanceOf(NotFoundError);
        });

        test('refuses the original connection uuid', async () => {
            const organization = await createOrganization();
            const project = await createProject(organization, {
                mode: 'multi',
                credentials: postgres,
            });
            const original = (
                await database('warehouse_connections')
                    .where('project_uuid', project)
                    .where('is_original', true)
                    .first('warehouse_connection_uuid')
            ).warehouse_connection_uuid;

            await expect(
                extraCredentials(project, original, organization.userUuid),
            ).rejects.toThrow('keeps its credentials in the project settings');
        });
    });

    describe('the warehouseConnection rotation sink', () => {
        test('a rotated refresh token is written to the extra connection, not to the original', async () => {
            const organization = await createOrganization();
            const original = {
                ...snowflake,
                authenticationType: SnowflakeAuthenticationType.SSO,
                refreshToken: 'original-refresh-token',
            } as CreateWarehouseCredentials;
            const multiProject = await createProject(organization, {
                mode: 'multi',
                credentials: original,
            });
            const extra = await createExtra(multiProject, {
                credentials: {
                    ...original,
                    refreshToken: 'old-refresh-token',
                } as CreateWarehouseCredentials,
            });
            vi.spyOn(credentialsApi, 'refreshCredentials').mockImplementation(
                async (args) =>
                    ({
                        ...args,
                        refreshToken: 'new-refresh-token',
                    }) as CreateWarehouseCredentials,
            );

            const result = await extraCredentials(
                multiProject,
                extra,
                organization.userUuid,
            );

            expect(result).toMatchObject({
                refreshToken: 'new-refresh-token',
            });
            expect(await decryptConnection(extra)).toMatchObject({
                refreshToken: 'new-refresh-token',
            });
            const originalRow = await database('warehouse_credentials')
                .innerJoin(
                    'projects',
                    'projects.project_id',
                    'warehouse_credentials.project_id',
                )
                .where('projects.project_uuid', multiProject)
                .first<{ encrypted_credentials: Buffer }>(
                    'encrypted_credentials',
                );
            expect(
                JSON.parse(
                    encryptionUtil.decrypt(originalRow.encrypted_credentials),
                ),
            ).toMatchObject({ refreshToken: 'original-refresh-token' });
        });

        test('a rotated organisation credential token is written to the organisation credential', async () => {
            const organization = await createOrganization();
            const credentials = {
                ...snowflake,
                authenticationType: SnowflakeAuthenticationType.SSO,
                refreshToken: 'old-refresh-token',
            } as CreateWarehouseCredentials;
            const organizationCredential = await createOrganizationCredential(
                organization,
                credentials,
            );
            const multiProject = await createProject(organization, {
                mode: 'multi',
                credentials: withRequire(postgres, false),
            });
            const extra = await createExtra(multiProject, {
                credentials,
                organizationWarehouseCredentialsUuid: organizationCredential,
            });
            vi.spyOn(credentialsApi, 'refreshCredentials').mockImplementation(
                async (args) =>
                    ({
                        ...args,
                        refreshToken: 'new-refresh-token',
                    }) as CreateWarehouseCredentials,
            );

            await extraCredentials(multiProject, extra, organization.userUuid);

            const row = await database('organization_warehouse_credentials')
                .where(
                    'organization_warehouse_credentials_uuid',
                    organizationCredential,
                )
                .first<{ warehouse_connection: Buffer }>(
                    'warehouse_connection',
                );
            expect(
                JSON.parse(encryptionUtil.decrypt(row.warehouse_connection)),
            ).toMatchObject({ refreshToken: 'new-refresh-token' });
        });

        test('a stale expected token leaves the stored token unchanged', async () => {
            const organization = await createOrganization();
            const credentials = {
                ...snowflake,
                authenticationType: SnowflakeAuthenticationType.SSO,
                refreshToken: 'stored-refresh-token',
            } as CreateWarehouseCredentials;
            const multiProject = await createProject(organization, {
                mode: 'multi',
                credentials,
            });
            const extra = await createExtra(multiProject, { credentials });
            const model = (
                service as unknown as {
                    warehouseConnectionModel: WarehouseConnectionModel;
                }
            ).warehouseConnectionModel;
            const project = await model.getProject(multiProject);

            expect(
                await model.rotateRefreshToken(
                    project,
                    extra,
                    'stale-refresh-token',
                    'new-refresh-token',
                ),
            ).toBe(false);
            expect(await decryptConnection(extra)).toMatchObject({
                refreshToken: 'stored-refresh-token',
            });
        });
    });

    describe('A-5: the original warehouse type while extra connections exist', () => {
        const projectModel = () =>
            (service as unknown as { projectModel: ProjectModel }).projectModel;

        const saveOriginal = (
            projectUuid: string,
            warehouseConnection: CreateWarehouseCredentials,
        ) =>
            projectModel().update(projectUuid, {
                name: 'Credentials project',
                dbtConnection: { type: DbtProjectType.NONE },
                dbtVersion: DefaultSupportedDbtVersion,
                warehouseConnection,
                organizationWarehouseCredentialsUuid: null,
            } as never);

        const storedOriginalType = async (projectUuid: string) =>
            (
                await database('warehouse_credentials')
                    .innerJoin(
                        'projects',
                        'projects.project_id',
                        'warehouse_credentials.project_id',
                    )
                    .where('projects.project_uuid', projectUuid)
                    .first<{ warehouse_type: string }>(
                        'warehouse_credentials.warehouse_type',
                    )
            ).warehouse_type;

        test('refuses a settings save that changes the original to another type while a Postgres extra exists', async () => {
            const organization = await createOrganization();
            const project = await createProject(organization, {
                mode: 'multi',
                credentials: postgres,
            });
            await createExtra(project, { credentials: postgres });

            await expect(saveOriginal(project, snowflake)).rejects.toEqual(
                new ConflictError(ORIGINAL_TYPE_LOCKED_MESSAGE),
            );
            expect(await storedOriginalType(project)).toBe(
                WarehouseTypes.POSTGRES,
            );
        });

        test('keeps main behaviour: same-type saves with extras, and type changes without extras', async () => {
            const organization = await createOrganization();
            const withExtra = await createProject(organization, {
                mode: 'multi',
                credentials: postgres,
            });
            await createExtra(withExtra, { credentials: postgres });
            const multiWithoutExtra = await createProject(organization, {
                mode: 'multi',
                credentials: postgres,
            });
            const single = await createProject(organization, {
                mode: 'single',
                credentials: postgres,
            });

            await saveOriginal(withExtra, { ...postgres, host: 'new-host' });
            await saveOriginal(multiWithoutExtra, snowflake);
            await saveOriginal(single, snowflake);

            expect(await storedOriginalType(withExtra)).toBe(
                WarehouseTypes.POSTGRES,
            );
            expect(await storedOriginalType(multiWithoutExtra)).toBe(
                WarehouseTypes.SNOWFLAKE,
            );
            expect(await storedOriginalType(single)).toBe(
                WarehouseTypes.SNOWFLAKE,
            );
        });
    });

    describe('an organisation credential used by an extra connection keeps its warehouse type', () => {
        const organizationModel = () =>
            (
                service as unknown as {
                    organizationWarehouseCredentialsModel: OrganizationWarehouseCredentialsModel;
                }
            ).organizationWarehouseCredentialsModel;

        const storedType = async (organizationCredential: string) =>
            (
                await database('organization_warehouse_credentials')
                    .where(
                        'organization_warehouse_credentials_uuid',
                        organizationCredential,
                    )
                    .first<{ warehouse_type: string }>('warehouse_type')
            ).warehouse_type;

        test('refuses a type change and names the projects and connections that use it', async () => {
            const organization = await createOrganization();
            const organizationCredential = await createOrganizationCredential(
                organization,
                postgres,
            );
            const project = await createProject(organization, {
                mode: 'multi',
                credentials: postgres,
            });
            await createExtra(project, {
                credentials: postgres,
                organizationWarehouseCredentialsUuid: organizationCredential,
                name: 'Finance',
            });

            await expect(
                organizationModel().update(organizationCredential, {
                    credentials: snowflake,
                }),
            ).rejects.toEqual(
                new ConflictError(
                    'The warehouse type of these credentials cannot change while extra connections use them: Credentials project / Finance.',
                ),
            );
            expect(await storedType(organizationCredential)).toBe(
                WarehouseTypes.POSTGRES,
            );
        });

        test('keeps main behaviour: same-type updates with extras, and type changes that only originals use', async () => {
            const organization = await createOrganization();
            const usedByExtra = await createOrganizationCredential(
                organization,
                postgres,
            );
            const withExtra = await createProject(organization, {
                mode: 'multi',
                credentials: postgres,
            });
            await createExtra(withExtra, {
                credentials: postgres,
                organizationWarehouseCredentialsUuid: usedByExtra,
            });
            const usedByOriginal = await createOrganizationCredential(
                organization,
                postgres,
            );
            await createProject(organization, {
                mode: 'multi',
                credentials: postgres,
                organizationWarehouseCredentialsUuid: usedByOriginal,
            });

            await organizationModel().update(usedByExtra, {
                credentials: { ...postgres, host: 'new-host' },
            });
            await organizationModel().update(usedByOriginal, {
                credentials: snowflake,
            });

            expect(await storedType(usedByExtra)).toBe(WarehouseTypes.POSTGRES);
            expect(await storedType(usedByOriginal)).toBe(
                WarehouseTypes.SNOWFLAKE,
            );
        });
    });

    describe('callers that cannot use personal credentials', () => {
        test('a service account is refused when the original requires personal credentials', async () => {
            const organization = await createOrganization();
            const multiProject = await createProject(organization, {
                mode: 'multi',
                credentials: withRequire(postgres, true),
            });
            const extra = await createExtra(multiProject, {
                credentials: postgres,
            });

            await expect(
                extraCredentials(
                    multiProject,
                    extra,
                    organization.userUuid,
                    'serviceAccount',
                ),
            ).rejects.toBeInstanceOf(ForbiddenError);
        });
    });
});
