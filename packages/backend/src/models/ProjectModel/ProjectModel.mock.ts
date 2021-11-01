import {
    CreateBigqueryCredentials,
    DbtCloudIDEProjectConfig,
    LightdashMode,
    Project,
    ProjectType,
    WarehouseTypes,
} from 'common';
import { LightdashConfig } from '../../config/parseConfig';
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
    projects: [],
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

export const projectMock = {
    projectUuid: 'project uuid',
    name: 'my project',
    dbt_connection: Buffer.from(JSON.stringify(dbtCloudIDEProjectConfigMock)),
    encrypted_credentials: Buffer.from(JSON.stringify(bigqueryCredentials)),
    warehouse_type: WarehouseTypes.BIGQUERY,
};

export const expectedProject: Project = {
    projectUuid: 'project uuid',
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
