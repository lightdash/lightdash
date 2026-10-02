import {
    BigqueryAuthenticationType,
    ProjectType,
    SnowflakeAuthenticationType,
    SupportedDbtVersions,
    WarehouseTypes,
} from '@lightdash/common';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { getDbtContext } from '../dbt/context';
import { createProject } from './createProject';
import { checkProjectCreationPermission, lightdashApi } from './dbt/apiClient';
import getDbtProfileTargetName from './dbt/getDbtProfileTargetName';
import { tryGetDbtVersion } from './dbt/getDbtVersion';
import getWarehouseClient, {
    createProgramaticallySnowflakePat,
} from './dbt/getWarehouseClient';

vi.mock('../dbt/context', () => ({ getDbtContext: vi.fn() }));
vi.mock('./dbt/apiClient', () => ({
    checkProjectCreationPermission: vi.fn(),
    lightdashApi: vi.fn(),
}));
vi.mock('./dbt/getDbtProfileTargetName', () => ({ default: vi.fn() }));
vi.mock('./dbt/getDbtVersion', () => ({ tryGetDbtVersion: vi.fn() }));
vi.mock('./dbt/getWarehouseClient', () => ({
    default: vi.fn(),
    createProgramaticallySnowflakePat: vi.fn(),
}));

const options = {
    name: 'Project',
    projectDir: '/tmp/project',
    profilesDir: '/tmp/profiles',
    target: undefined,
    profile: undefined,
    type: ProjectType.DEFAULT,
    assumeYes: true,
};

describe('createProject credential payload', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(checkProjectCreationPermission).mockResolvedValue(undefined);
        vi.mocked(getDbtContext).mockResolvedValue({
            profileName: 'default',
        } as never);
        vi.mocked(getDbtProfileTargetName).mockResolvedValue('dev');
        vi.mocked(tryGetDbtVersion).mockResolvedValue({
            success: true,
            version: {
                isDbtCloudCLI: false,
                versionOption: SupportedDbtVersions.V1_10,
            },
        } as never);
        vi.mocked(lightdashApi).mockResolvedValue({ project: {} } as never);
    });

    test('sends the BigQuery person token for server-side import', async () => {
        vi.mocked(getWarehouseClient).mockResolvedValue({
            credentials: {
                type: WarehouseTypes.BIGQUERY,
                authenticationType: BigqueryAuthenticationType.SSO,
                project: 'analytics',
                dataset: 'marts',
                keyfileContents: {
                    type: 'authorized_user',
                    refresh_token: 'cli-person-token',
                },
            },
        } as never);
        await createProject(options);
        const payload = JSON.parse(
            vi.mocked(lightdashApi).mock.calls.at(-1)![0].body as string,
        );
        expect(payload.warehouseConnection.keyfileContents.refresh_token).toBe(
            'cli-person-token',
        );
        expect(
            payload.snowflakeExternalBrowserTemporaryPassword,
        ).toBeUndefined();
    });

    test('marks a Snowflake external-browser temporary token as personal', async () => {
        vi.mocked(getWarehouseClient).mockResolvedValue({
            credentials: {
                type: WarehouseTypes.SNOWFLAKE,
                authenticationType:
                    SnowflakeAuthenticationType.EXTERNAL_BROWSER,
                account: 'account',
                user: 'developer',
                database: 'database',
                warehouse: 'warehouse',
                schema: 'public',
            },
        } as never);
        vi.mocked(lightdashApi).mockResolvedValueOnce({
            auth: { snowflake: { enabled: false } },
        } as never);
        vi.mocked(createProgramaticallySnowflakePat).mockResolvedValue(
            'temporary-person-token',
        );
        await createProject(options);
        const payload = JSON.parse(
            vi.mocked(lightdashApi).mock.calls.at(-1)![0].body as string,
        );
        expect(payload.warehouseConnection).toMatchObject({
            authenticationType: SnowflakeAuthenticationType.PASSWORD,
            password: 'temporary-person-token',
        });
        expect(payload.snowflakeExternalBrowserTemporaryPassword).toBe(true);
    });
});
