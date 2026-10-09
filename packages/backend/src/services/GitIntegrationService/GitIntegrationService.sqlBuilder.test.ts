import {
    CreateDatabricksCredentials,
    CreateSnowflakeCredentials,
    CreateWarehouseCredentials,
    DatabricksAuthenticationType,
    SnowflakeAuthenticationType,
    WarehouseSqlBuilder,
    WarehouseTypes,
    WeekDay,
} from '@lightdash/common';
import {
    DatabricksSqlBuilder,
    DatabricksWarehouseClient,
    exchangeDatabricksOAuthCredentials,
    refreshDatabricksOAuthToken,
    SnowflakeSqlBuilder,
    SnowflakeWarehouseClient,
    SshTunnel,
    warehouseClientFromCredentials,
    warehouseSqlBuilderFromType,
} from '@lightdash/warehouses';
import { analyticsMock } from '../../analytics/LightdashAnalytics.mock';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import type { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { UserService } from '../UserService';
import { WarehouseClientFactory } from '../WarehouseClientFactory/WarehouseClientFactory';
import { GitIntegrationService } from './GitIntegrationService';

vi.mock(
    '@lightdash/warehouses/warehouseClients/SnowflakeWarehouseClient',
    async (importOriginal) => ({
        ...(await importOriginal<typeof import('@lightdash/warehouses')>()),
        SnowflakeWarehouseClient: vi.fn(),
    }),
);

vi.mock(
    '@lightdash/warehouses/warehouseClients/DatabricksWarehouseClient',
    async (importOriginal) => ({
        ...(await importOriginal<typeof import('@lightdash/warehouses')>()),
        DatabricksWarehouseClient: vi.fn(),
        exchangeDatabricksOAuthCredentials: vi.fn(),
        refreshDatabricksOAuthToken: vi.fn(),
    }),
);

vi.mock('@lightdash/warehouses/warehouseClientFromCredentials');
vi.mock('@lightdash/warehouses/ssh/sshTunnel');
vi.mock('../WarehouseClientFactory/WarehouseClientFactory', () => ({
    WarehouseClientFactory: vi.fn(),
}));
vi.mock('../UserService', () => ({
    UserService: { generateSnowflakeAccessToken: vi.fn() },
}));

type SqlBuilderProbe = {
    getWarehouseSqlBuilder(projectUuid: string): Promise<WarehouseSqlBuilder>;
};

type ServiceArguments = ConstructorParameters<typeof GitIntegrationService>[0];

const snowflakeCredentials: CreateSnowflakeCredentials = {
    type: WarehouseTypes.SNOWFLAKE,
    authenticationType: SnowflakeAuthenticationType.SSO,
    account: 'stored-account',
    user: 'stored-user',
    database: 'stored-database',
    warehouse: 'stored-warehouse',
    schema: 'stored-schema',
    refreshToken: 'stored-snowflake-refresh-token',
    startOfWeek: WeekDay.SUNDAY,
};

const databricksCredentials: CreateDatabricksCredentials = {
    type: WarehouseTypes.DATABRICKS,
    database: 'stored-schema',
    serverHostName: 'stored.databricks.example',
    httpPath: '/sql/1.0/warehouses/stored-warehouse',
    oauthClientId: 'stored-client-id',
    startOfWeek: WeekDay.MONDAY,
};

const credentialCases: {
    name: string;
    credentials: CreateWarehouseCredentials;
    builderClass: typeof SnowflakeSqlBuilder | typeof DatabricksSqlBuilder;
}[] = [
    {
        name: 'Snowflake SSO',
        credentials: snowflakeCredentials,
        builderClass: SnowflakeSqlBuilder,
    },
    {
        name: 'Databricks M2M',
        credentials: {
            ...databricksCredentials,
            authenticationType: DatabricksAuthenticationType.OAUTH_M2M,
            oauthClientSecret: 'stored-client-secret',
        },
        builderClass: DatabricksSqlBuilder,
    },
    {
        name: 'Databricks U2M',
        credentials: {
            ...databricksCredentials,
            authenticationType: DatabricksAuthenticationType.OAUTH_U2M,
            refreshToken: 'stored-databricks-refresh-token',
        },
        builderClass: DatabricksSqlBuilder,
    },
    {
        name: 'organisation Snowflake SSO',
        credentials: {
            ...snowflakeCredentials,
            organizationWarehouseCredentialsUuid: 'organisation-credentials',
            account: 'organisation-account',
            refreshToken: 'organisation-snowflake-refresh-token',
            startOfWeek: WeekDay.WEDNESDAY,
        },
        builderClass: SnowflakeSqlBuilder,
    },
];

describe('GitIntegrationService SQL builder without warehouse network access', () => {
    const getWarehouseCredentialsForBinding =
        vi.fn<ProjectModel['getWarehouseCredentialsForBinding']>();
    const service = new GitIntegrationService({
        lightdashConfig: lightdashConfigMock,
        analytics: analyticsMock,
        projectModel: {
            getWarehouseCredentialsForBinding,
        } as unknown as ProjectModel,
        savedChartModel: {} as ServiceArguments['savedChartModel'],
        projectDbtSourcesModel:
            {} as ServiceArguments['projectDbtSourcesModel'],
        spaceModel: {} as ServiceArguments['spaceModel'],
        githubAppInstallationsModel:
            {} as ServiceArguments['githubAppInstallationsModel'],
        githubAppService: {} as ServiceArguments['githubAppService'],
        pullRequestsModel: {} as ServiceArguments['pullRequestsModel'],
    }) as unknown as SqlBuilderProbe;

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe.each(credentialCases)('$name', ({ credentials, builderClass }) => {
        it.each(['missing', 'expired'] as const)(
            'builds the real dialect when the access token is %s without connecting',
            async (tokenState) => {
                const storedCredentials = {
                    ...credentials,
                    ...(tokenState === 'expired'
                        ? { token: 'expired-stored-access-token' }
                        : {}),
                };
                getWarehouseCredentialsForBinding.mockResolvedValue(
                    storedCredentials,
                );

                const builder = await service.getWarehouseSqlBuilder('project');

                expect(vi.isMockFunction(warehouseSqlBuilderFromType)).toBe(
                    false,
                );
                expect(getWarehouseCredentialsForBinding).toHaveBeenCalledTimes(
                    1,
                );
                expect(getWarehouseCredentialsForBinding).toHaveBeenCalledWith(
                    'project',
                    { kind: 'original' },
                );
                expect(builder).toBeInstanceOf(builderClass);
                expect(builder.constructor).toBe(builderClass);
                expect(builder.getStartOfWeek()).toBe(credentials.startOfWeek);
                expect(SnowflakeWarehouseClient).not.toHaveBeenCalled();
                expect(DatabricksWarehouseClient).not.toHaveBeenCalled();
                expect(warehouseClientFromCredentials).not.toHaveBeenCalled();
                expect(WarehouseClientFactory).not.toHaveBeenCalled();
                expect(
                    UserService.generateSnowflakeAccessToken,
                ).not.toHaveBeenCalled();
                expect(refreshDatabricksOAuthToken).not.toHaveBeenCalled();
                expect(
                    exchangeDatabricksOAuthCredentials,
                ).not.toHaveBeenCalled();
                expect(SshTunnel).not.toHaveBeenCalled();
            },
        );
    });
});
