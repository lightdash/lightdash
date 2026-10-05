import { SnowflakeAuthenticationType, WarehouseTypes } from '@lightdash/common';
import { beforeEach, expect, it, vi } from 'vitest';
import { UserWarehouseCredentialsModel } from '../../models/UserWarehouseCredentials/UserWarehouseCredentialsModel';
import { UserService } from '../UserService';
import { getSnowflakeLogin } from './snowflakeLogin';

const runQuery = vi.fn();
vi.mock('@lightdash/warehouses', () => ({
    SnowflakeWarehouseClient: class {
        runQuery = runQuery;
    },
}));
vi.mock('../UserService', () => ({
    UserService: { generateSnowflakeAccessToken: vi.fn() },
}));

const findForProjectWithSecrets = vi.fn();
const rotateRefreshToken = vi.fn();
const userWarehouseCredentialsModel = {
    findForProjectWithSecrets,
    rotateRefreshToken,
} as unknown as UserWarehouseCredentialsModel;
const projectCredentials = {
    type: WarehouseTypes.SNOWFLAKE as const,
    account: 'account',
    user: 'project',
    password: 'project-secret',
    database: 'DB',
    warehouse: 'WH',
    schema: 'SCHEMA',
    requireUserCredentials: true,
};

beforeEach(() => {
    vi.clearAllMocks();
});

it('reads the login using the personal Snowflake sign-in', async () => {
    findForProjectWithSecrets.mockResolvedValue({
        uuid: 'credential',
        credentials: {
            type: WarehouseTypes.SNOWFLAKE,
            user: 'person',
            authenticationType: SnowflakeAuthenticationType.SSO,
            refreshToken: 'old',
        },
    });
    vi.mocked(UserService.generateSnowflakeAccessToken).mockResolvedValue({
        accessToken: 'access',
        refreshToken: 'new',
    });
    runQuery.mockResolvedValue({ rows: [{ CURRENT_USER: 'PERSON' }] });
    await expect(
        getSnowflakeLogin({
            projectUuid: 'project',
            userUuid: 'user',
            projectCredentials,
            userWarehouseCredentialsModel,
        }),
    ).resolves.toBe('PERSON');
    expect(rotateRefreshToken).toHaveBeenCalledWith('credential', 'old', 'new');
    expect(runQuery).toHaveBeenCalledWith(
        'SELECT CURRENT_USER() AS CURRENT_USER',
    );
});

it('skips people without a saved credential', async () => {
    findForProjectWithSecrets.mockResolvedValue(undefined);
    await expect(
        getSnowflakeLogin({
            projectUuid: 'project',
            userUuid: 'user',
            projectCredentials,
            userWarehouseCredentialsModel,
        }),
    ).resolves.toBeNull();
    expect(runQuery).not.toHaveBeenCalled();
});
