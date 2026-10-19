import {
    DatabricksAuthenticationType,
    SnowflakeAuthenticationType,
    WarehouseTypes,
} from '@lightdash/common';
import knex, { type Knex } from 'knex';
import { getTracker, MockClient } from 'knex-mock-client';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { type OrganizationWarehouseCredentialsModel } from '../OrganizationWarehouseCredentialsModel';
import { ProjectModel } from '../ProjectModel/ProjectModel';
import { encryptionUtilMock } from '../ProjectModel/ProjectModel.mock';
import { WarehouseConnectionModel } from '../WarehouseConnectionModel/WarehouseConnectionModel';
import { RefreshTokenSourceChangedError } from './RefreshTokenRotation';

const trx = knex({ client: MockClient, dialect: 'pg' });
const tracker = getTracker();
afterEach(() => {
    tracker.reset();
    vi.clearAllMocks();
});
afterAll(async () => trx.destroy());

describe.each([
    {
        type: WarehouseTypes.SNOWFLAKE,
        authenticationType: SnowflakeAuthenticationType.SSO,
        account: 'account',
        database: 'database',
        warehouse: 'warehouse',
        schema: 'schema',
        refreshToken: 'original',
    },
    {
        type: WarehouseTypes.DATABRICKS,
        authenticationType: DatabricksAuthenticationType.OAUTH_U2M,
        serverHostName: 'workspace.databricks.test',
        httpPath: '/sql/warehouse',
        catalog: 'catalog',
        database: 'schema',
        oauthClientId: 'client',
        refreshToken: 'original',
    },
])('$type refresh sources', (credentials) => {
    const project = {
        projectUuid: 'project',
        organizationUuid: 'organization',
        connectionMode: 'multi' as const,
        originalWarehouseType: credentials.type,
    };
    const database = vi.fn(() => {
        throw new Error('Must use the lock transaction');
    }) as unknown as Knex;
    const organizationWarehouseCredentialsModel = {
        getByUuidWithSensitiveData: vi.fn(),
    } as unknown as OrganizationWarehouseCredentialsModel;
    const projectModel = new ProjectModel({
        database,
        lightdashConfig: lightdashConfigMock,
        encryptionUtil: encryptionUtilMock,
    });
    const connectionModel = new WarehouseConnectionModel({
        database,
        encryptionUtil: encryptionUtilMock,
        organizationWarehouseCredentialsModel,
    });
    const row = {
        encrypted_credentials: Buffer.from(JSON.stringify(credentials)),
        organization_warehouse_credentials_uuid: null,
        playground_bundle_version: null,
        is_original: false,
    };

    describe.each(['project', 'warehouseConnection'] as const)(
        '%s exact refresh source',
        (kind) => {
            const read = () =>
                kind === 'project'
                    ? projectModel.getOwnWarehouseCredentialsForProject(
                          'project',
                          trx,
                      )
                    : connectionModel.getOwnCredentials(
                          project,
                          'connection',
                          trx,
                      );
            test('reads its own encrypted token on the held connection', async () => {
                tracker.on.select(/.*/).response([row]);
                await expect(read()).resolves.toMatchObject(credentials);
                expect(
                    organizationWarehouseCredentialsModel.getByUuidWithSensitiveData,
                ).not.toHaveBeenCalled();
                expect(tracker.history.select[0].bindings).toEqual(
                    kind === 'project'
                        ? ['project', 1]
                        : ['project', 'connection', 1],
                );
            });
            test.each(['linked', 'deleted'] as const)(
                'refuses a source that was %s while waiting',
                async (change) => {
                    tracker.on.select(/.*/).response(
                        change === 'deleted'
                            ? []
                            : [
                                  {
                                      ...row,
                                      organization_warehouse_credentials_uuid:
                                          'new-organization-source',
                                  },
                              ],
                    );
                    await expect(read()).rejects.toBeInstanceOf(
                        RefreshTokenSourceChangedError,
                    );
                    expect(
                        organizationWarehouseCredentialsModel.getByUuidWithSensitiveData,
                    ).not.toHaveBeenCalled();
                },
            );
        },
    );

    describe('ProjectModel refresh token rotation', () => {
        test.each([true, false])(
            'keeps the guarded write on the supplied transaction with a matching token %s',
            async (matches) => {
                tracker.on.select(/warehouse_credentials/).response([
                    {
                        project_id: 1,
                        encrypted_credentials: row.encrypted_credentials,
                    },
                ]);
                tracker.on.update(/warehouse_credentials/).response(1);
                await expect(
                    projectModel.rotateRefreshToken(
                        'project',
                        matches ? 'original' : 'stale',
                        'rotated',
                        trx,
                    ),
                ).resolves.toBe(matches);
                expect(tracker.history.update).toHaveLength(matches ? 1 : 0);
                if (matches)
                    expect(encryptionUtilMock.encrypt).toHaveBeenCalledWith(
                        JSON.stringify({
                            ...credentials,
                            refreshToken: 'rotated',
                        }),
                    );
            },
        );
    });
});
