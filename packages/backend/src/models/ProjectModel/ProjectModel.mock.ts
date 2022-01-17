import {
    CreateBigqueryCredentials,
    DbtCloudIDEProjectConfig,
    LightdashMode,
    Project,
    ProjectType,
    TablesConfiguration,
    TableSelectionType,
    WarehouseTypes,
} from 'common';
import { LightdashConfig } from '../../config/parseConfig';
import { ProjectTable } from '../../database/entities/projects';
import { EncryptionService } from '../../services/EncryptionService/EncryptionService';

export const lightdashConfigMock: LightdashConfig = {
    mode: LightdashMode.DEFAULT,
    version: '1.0',
    lightdashSecret: 'secret',
    secureCookies: true,
    trustProxy: true,
    rudder: {
        writeKey: '',
        dataPlaneUrl: '',
    },
    sentry: {
        dsn: '',
        release: '',
        environment: '',
    },
    auth: {
        google: {
            oauth2ClientId: undefined,
            oauth2ClientSecret: undefined,
            loginPath: '',
            callbackPath: '',
        },
    },
    chatwoot: {
        websiteToken: '',
        baseUrl: '',
    },
    cohere: {
        token: '',
    },
    smtp: undefined,
    projects: [],
    siteUrl: '',
    database: {
        connectionUri: undefined,
        maxConnections: undefined,
        minConnections: undefined,
    },
};

const dbtCloudIDEProjectConfigMock: DbtCloudIDEProjectConfig = {
    type: ProjectType.DBT_CLOUD_IDE,
    name: 'name',
    api_key: 'my api key',
    account_id: 'account_id',
    environment_id: 'environment_id',
    project_id: 'project_id',
};

const bigqueryCredentials: CreateBigqueryCredentials = {
    type: WarehouseTypes.BIGQUERY,
    project: 'name',
    dataset: 'name',
    threads: 1,
    timeoutSeconds: 1,
    priority: 'interactive',
    keyfileContents: {},
    retries: 1,
    location: 'name',
    maximumBytesBilled: 1,
};

export const encryptionServiceMock = {
    encrypt: jest.fn(() => Buffer.from('encrypted')),
    decrypt: jest.fn((encrypted: Buffer) => encrypted.toString()),
} as any as EncryptionService;

export const projectUuid = 'project uuid';

export const projectMock = {
    name: 'my project',
    dbt_connection: Buffer.from(JSON.stringify(dbtCloudIDEProjectConfigMock)),
    encrypted_credentials: Buffer.from(JSON.stringify(bigqueryCredentials)),
    warehouse_type: WarehouseTypes.BIGQUERY,
};

export const tableSelectionMock: Pick<
    ProjectTable['base'],
    'table_selection_type' | 'table_selection_value'
> = {
    table_selection_type: TableSelectionType.ALL,
    table_selection_value: null,
};

export const updateTableSelectionMock: TablesConfiguration = {
    tableSelection: {
        type: TableSelectionType.WITH_NAMES,
        value: ['test'],
    },
};

export const expectedTablesConfiguration: TablesConfiguration = {
    tableSelection: {
        type: TableSelectionType.ALL,
        value: null,
    },
};

export const expectedProject: Project = {
    projectUuid,
    name: 'my project',
    dbtConnection: {
        account_id: 'account_id',
        environment_id: 'environment_id',
        name: 'name',
        project_id: 'project_id',
        type: ProjectType.DBT_CLOUD_IDE,
    } as any as DbtCloudIDEProjectConfig,
    warehouseConnection: {
        dataset: 'name',
        location: 'name',
        maximumBytesBilled: 1,
        priority: 'interactive',
        project: 'name',
        retries: 1,
        threads: 1,
        timeoutSeconds: 1,
        type: WarehouseTypes.BIGQUERY,
    },
};
