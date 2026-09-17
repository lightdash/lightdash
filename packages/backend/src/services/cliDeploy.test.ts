import {
    AthenaAuthenticationType,
    DbtProjectType,
    WarehouseTypes,
    type CreateWarehouseCredentials,
    type Explore,
    type ProjectDbtSource,
} from '@lightdash/common';
import { prepareCliDeployExplores } from './cliDeploy';

const source: ProjectDbtSource = {
    projectDbtSourceUuid: 'source-uuid',
    projectUuid: 'project-uuid',
    connectionUuid: 'connection-uuid',
    namespacePrefix: '',
    name: 'analytics',
    isPrimary: true,
    precedence: 0,
    dbtConnection: { type: DbtProjectType.NONE },
    warehouseLocation: { database: 'analytics', schema: 'public' },
    hasCredentialError: false,
    createdAt: new Date(),
    updatedAt: new Date(),
};

const explore = {
    name: 'orders',
    baseTable: 'orders',
    tables: { orders: { name: 'orders' } },
} as unknown as Explore;

const prepare = (
    credentials: CreateWarehouseCredentials,
    target: { database: string; region?: string },
) =>
    prepareCliDeployExplores({
        projectModel: {
            getWarehouseCredentialsForProject: vi
                .fn()
                .mockResolvedValue(credentials),
        },
        projectDbtSourcesModel: {
            getSource: vi.fn().mockResolvedValue(source),
        },
        projectUuid: source.projectUuid,
        sourceUuid: source.projectDbtSourceUuid,
        target,
        explores: [explore],
    });

describe('prepareCliDeployExplores', () => {
    const postgres = (dbname: string) =>
        ({
            type: WarehouseTypes.POSTGRES,
            dbname,
            schema: 'public',
        }) as CreateWarehouseCredentials;

    it('accepts a matching target and stamps source identity', async () => {
        const [prepared] = await prepare(postgres('analytics'), {
            database: 'analytics',
        });
        expect(prepared.tables?.orders).toMatchObject({
            dbtSourceUuid: 'source-uuid',
            connectionUuid: 'connection-uuid',
        });
    });

    it('refuses a target database mismatch', async () => {
        await expect(
            prepare(postgres('reporting'), { database: 'analytics' }),
        ).rejects.toThrow(
            "The dbt target compiles against database analytics but the source's connection points at reporting.",
        );
    });

    it('refuses an Athena target region mismatch', async () => {
        const athena = {
            type: WarehouseTypes.ATHENA,
            database: 'AwsDataCatalog',
            schema: 'analytics',
            region: 'us-east-1',
            authenticationType: AthenaAuthenticationType.IAM_ROLE,
            s3StagingDir: 's3://results',
        } as CreateWarehouseCredentials;
        await expect(
            prepare(athena, {
                database: 'AwsDataCatalog',
                region: 'eu-west-1',
            }),
        ).rejects.toThrow(
            "The dbt target compiles against region eu-west-1 but the source's connection points at us-east-1.",
        );
    });
});
