import {
    SnowflakeAuthenticationType,
    SnowflakeTokenError,
    WarehouseTypes,
    type CreateSnowflakeCredentials,
    type CreateWarehouseCredentials,
} from '@lightdash/common';
import type { Knex } from 'knex';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { RefreshTokenRotation } from '../../models/RefreshTokenRotation/RefreshTokenRotation';
import { UserService } from '../UserService';
import {
    connectionContextFromUser,
    WarehouseCredentialKind,
} from '../WarehouseClientFactory/ConnectionContext';
import {
    preparedCredentials,
    type MaterializedCredentials,
    type PreparedCredentials,
} from '../WarehouseClientFactory/CredentialResolver';
import { ProjectService, type ProjectServiceArguments } from './ProjectService';
import { projectWithSensitiveFields } from './ProjectService.mock';

const credentials: CreateSnowflakeCredentials = {
    type: WarehouseTypes.SNOWFLAKE,
    authenticationType: SnowflakeAuthenticationType.SSO,
    account: 'account',
    user: 'person',
    database: 'database',
    warehouse: 'warehouse',
    schema: 'schema',
    token: 'stale-access',
    refreshToken: 'stored-refresh',
};
const actor = { userUuid: 'person', organizationUuid: 'org' };
const setup = (
    enabled: boolean,
    organizationCredentialUuid: string | null = null,
) => {
    const database = {
        transaction: vi.fn(
            async (callback: (trx: Knex.Transaction) => unknown) =>
                callback({
                    raw: vi.fn().mockResolvedValue(undefined),
                } as unknown as Knex.Transaction),
        ),
    } as unknown as Knex;
    const rotation = new RefreshTokenRotation({ database });
    const run = vi.spyOn(rotation, 'run');
    const project = {
        ...projectWithSensitiveFields,
        projectUuid: 'project',
        organizationUuid: 'org',
        organizationWarehouseCredentialsUuid: organizationCredentialUuid,
        warehouseConnection: { ...credentials },
    };
    const projectModel = {
        getSummary: vi.fn().mockResolvedValue(project),
        getOwnWarehouseCredentialsForProject: vi
            .fn()
            .mockResolvedValue(credentials),
        rotateRefreshToken: vi.fn().mockResolvedValue(true),
    };
    const organizationWarehouseCredentialsModel = {
        getByUuidWithSensitiveData: vi
            .fn()
            .mockResolvedValue({ organizationUuid: 'org', credentials }),
        rotateRefreshToken: vi.fn().mockResolvedValue(true),
    };
    const userOAuthGrantsModel = {
        getRefreshToken: vi.fn().mockResolvedValue('grant-refresh'),
    };
    const service = new ProjectService({
        lightdashConfig: lightdashConfigMock,
        refreshTokenRotation: rotation,
        projectModel,
        organizationWarehouseCredentialsModel,
        userOAuthGrantsModel,
        featureFlagModel: { get: vi.fn().mockResolvedValue({ enabled }) },
    } as unknown as ProjectServiceArguments);
    const probe = service as unknown as {
        _resolveWarehouseClientCredentials: (
            input: {
                warehouseConnection: CreateSnowflakeCredentials;
                organizationWarehouseCredentialsUuid?: string;
            },
            userUuid: string,
            organizationUuid: string,
            rotationMode: 'persist' | 'ignore',
        ) => Promise<{ warehouseConnection: MaterializedCredentials }>;
        prepareLegacyCompileCredentials: (
            input: typeof project,
            user: typeof actor,
        ) => Promise<MaterializedCredentials>;
        warehouseClientFactory: {
            credentialResolvers: {
                resolveCredentialSelection: (
                    input: unknown,
                    legacyResolve: () => Promise<CreateWarehouseCredentials>,
                ) => Promise<MaterializedCredentials>;
            };
        };
    };
    const exchange = vi
        .spyOn(UserService, 'generateSnowflakeAccessToken')
        .mockResolvedValue({
            accessToken: 'fresh-access',
            refreshToken: 'rotated-refresh',
        });
    return {
        probe,
        project,
        projectModel,
        organizationWarehouseCredentialsModel,
        userOAuthGrantsModel,
        exchange,
        run,
    };
};

afterEach(() => vi.restoreAllMocks());

describe('ProjectService Snowflake resolver entry points', () => {
    test.each([true, false])(
        'organisation ignore policy with lock %s',
        async (enabled) => {
            const f = setup(enabled, 'org-row');
            const result = await f.probe._resolveWarehouseClientCredentials(
                {
                    warehouseConnection: credentials,
                    organizationWarehouseCredentialsUuid: 'org-row',
                },
                actor.userUuid,
                actor.organizationUuid,
                'ignore',
            );
            expect(result.warehouseConnection).toMatchObject({
                token: 'fresh-access',
                refreshToken: 'rotated-refresh',
            });
            expect(
                (result.warehouseConnection as PreparedCredentials)[
                    preparedCredentials
                ],
            ).toBe(true);
            expect(f.exchange).toHaveBeenCalledExactlyOnceWith(
                'stored-refresh',
                ...(enabled ? [30_000] : []),
            );
            expect(f.run).toHaveBeenCalledTimes(enabled ? 1 : 0);
            expect(
                f.organizationWarehouseCredentialsModel.rotateRefreshToken,
            ).toHaveBeenCalledTimes(enabled ? 1 : 0);
            if (enabled)
                expect(
                    f.organizationWarehouseCredentialsModel.rotateRefreshToken,
                ).toHaveBeenCalledWith(
                    'org-row',
                    'stored-refresh',
                    'rotated-refresh',
                    expect.objectContaining({ raw: expect.any(Function) }),
                );
        },
    );

    test.each([true, false])(
        'legacy organisation compile writes to the correct row with lock %s',
        async (enabled) => {
            const f = setup(enabled, 'org-row');
            const result = await f.probe.prepareLegacyCompileCredentials(
                f.project,
                actor,
            );
            expect(result).toMatchObject({
                token: 'fresh-access',
                refreshToken: 'rotated-refresh',
            });
            expect((result as PreparedCredentials)[preparedCredentials]).toBe(
                true,
            );
            expect(
                f.organizationWarehouseCredentialsModel.rotateRefreshToken,
            ).toHaveBeenCalledTimes(enabled ? 1 : 0);
            expect(f.projectModel.rotateRefreshToken).toHaveBeenCalledTimes(
                enabled ? 0 : 1,
            );
            expect(
                enabled
                    ? f.organizationWarehouseCredentialsModel.rotateRefreshToken
                    : f.projectModel.rotateRefreshToken,
            ).toHaveBeenCalledWith(
                enabled ? 'org-row' : 'project',
                'stored-refresh',
                'rotated-refresh',
                ...(enabled
                    ? [expect.objectContaining({ raw: expect.any(Function) })]
                    : []),
            );
        },
    );

    test.each([true, false])(
        'legacy compile retains raw exchange errors with lock %s',
        async (enabled) => {
            const f = setup(enabled);
            const error = {
                data: JSON.stringify({ message: 'invalid_grant' }),
            };
            f.exchange.mockRejectedValue(error);
            await expect(
                f.probe.prepareLegacyCompileCredentials(f.project, actor),
            ).rejects.toBe(error);
            expect(f.projectModel.rotateRefreshToken).not.toHaveBeenCalled();
        },
    );

    test('organisation resolution retains wrapped exchange errors', async () => {
        const f = setup(true, 'org-row');
        f.exchange.mockRejectedValue({
            data: JSON.stringify({ message: 'invalid_grant' }),
        });
        await expect(
            f.probe._resolveWarehouseClientCredentials(
                {
                    warehouseConnection: credentials,
                    organizationWarehouseCredentialsUuid: 'org-row',
                },
                actor.userUuid,
                actor.organizationUuid,
                'persist',
            ),
        ).rejects.toThrow(
            new SnowflakeTokenError(
                'Error refreshing snowflake token: invalid_grant',
            ),
        );
    });

    test.each(['save', 'legacy compile', 'legacy token only'] as const)(
        '%s prepares credentials for registry acquisition without a second exchange',
        async (mode) => {
            const f = setup(true);
            if (mode === 'legacy token only')
                f.project.warehouseConnection.refreshToken = undefined;
            const prepared =
                mode === 'save'
                    ? (
                          await f.probe._resolveWarehouseClientCredentials(
                              { warehouseConnection: credentials },
                              actor.userUuid,
                              actor.organizationUuid,
                              'ignore',
                          )
                      ).warehouseConnection
                    : await f.probe.prepareLegacyCompileCredentials(
                          f.project,
                          actor,
                      );
            const resolved =
                await f.probe.warehouseClientFactory.credentialResolvers.resolveCredentialSelection(
                    {
                        connection: { ...prepared },
                        stored: prepared,
                        owner: { kind: 'project', uuid: 'project' },
                        context: connectionContextFromUser(actor, {
                            organizationUuid: 'org',
                            queryContext: null,
                        }),
                        projectUuid: 'project',
                        warehouseConnectionUuid: null,
                        aiPlan: null,
                        credentialKind: WarehouseCredentialKind.SHARED,
                    },
                    vi.fn(),
                );
            expect(resolved).toMatchObject({
                token:
                    mode === 'legacy token only'
                        ? 'stale-access'
                        : 'fresh-access',
            });
            expect(f.exchange).toHaveBeenCalledTimes(
                mode === 'legacy token only' ? 0 : 1,
            );
            if (mode === 'save') {
                expect(resolved).toMatchObject({
                    refreshToken: 'grant-refresh',
                });
                expect(
                    f.projectModel.rotateRefreshToken,
                ).not.toHaveBeenCalled();
            }
        },
    );
});
