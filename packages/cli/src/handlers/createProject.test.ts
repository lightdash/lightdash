import {
    HealthState,
    SnowflakeAuthenticationType,
    WarehouseTypes,
    type CreateSnowflakeCredentials,
} from '@lightdash/common';
import { applySnowflakeSsoHandling } from './createProject';
import { lightdashApi } from './dbt/apiClient';
import { createProgramaticallySnowflakePat } from './dbt/getWarehouseClient';

vi.mock('./dbt/apiClient', () => ({
    lightdashApi: vi.fn(),
    checkProjectCreationPermission: vi.fn(),
}));
vi.mock('./dbt/getWarehouseClient', () => ({
    default: vi.fn(),
    createProgramaticallySnowflakePat: vi.fn(),
}));

const oauthCredentials: CreateSnowflakeCredentials = {
    type: WarehouseTypes.SNOWFLAKE,
    account: 'abc123',
    user: '',
    authenticationType: SnowflakeAuthenticationType.SSO,
    token: 'access-token',
    database: 'DB',
    warehouse: 'WH',
    schema: 'jaffle',
};

const mockSnowflakeSsoEnabled = (enabled: boolean) =>
    vi.mocked(lightdashApi<HealthState>).mockResolvedValue({
        auth: { snowflake: { enabled } },
    } as HealthState);

describe('applySnowflakeSsoHandling', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    test('should leave password credentials untouched without calling the server', async () => {
        const credentials: CreateSnowflakeCredentials = {
            ...oauthCredentials,
            user: 'someone',
            authenticationType: SnowflakeAuthenticationType.PASSWORD,
            token: undefined,
            password: 'secret',
        };
        expect(await applySnowflakeSsoHandling(credentials)).toBe(credentials);
        expect(lightdashApi).not.toHaveBeenCalled();
    });

    test('should require user credentials and drop the token when the server has Snowflake OAuth', async () => {
        mockSnowflakeSsoEnabled(true);
        expect(await applySnowflakeSsoHandling(oauthCredentials)).toEqual({
            ...oauthCredentials,
            token: undefined,
            authenticationType: SnowflakeAuthenticationType.EXTERNAL_BROWSER,
            requireUserCredentials: true,
        });
    });

    test('should skip storing credentials when the server has no Snowflake OAuth', async () => {
        mockSnowflakeSsoEnabled(false);
        expect(await applySnowflakeSsoHandling(oauthCredentials)).toBeNull();
        expect(createProgramaticallySnowflakePat).not.toHaveBeenCalled();
    });
});
