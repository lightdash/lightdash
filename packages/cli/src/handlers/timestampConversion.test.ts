import { WarehouseTypes, type Project } from '@lightdash/common';
import type { MockedFunction, MockInstance } from 'vitest';
import { lightdashApi } from './dbt/apiClient';
import {
    getDisableTimestampConversionFromProject,
    getProjectDisableTimestampConversion,
} from './timestampConversion';

vi.mock('./dbt/apiClient', () => ({
    lightdashApi: vi.fn(),
}));

const mockLightdashApi = lightdashApi as MockedFunction<typeof lightdashApi>;

const PROJECT_UUID = '00000000-0000-0000-0000-000000000001';

const snowflakeConnection = (disableTimestampConversion?: boolean) =>
    ({
        type: WarehouseTypes.SNOWFLAKE,
        ...(disableTimestampConversion !== undefined
            ? { disableTimestampConversion }
            : {}),
    }) as Project['warehouseConnection'];

const postgresConnection = {
    type: WarehouseTypes.POSTGRES,
} as Project['warehouseConnection'];

const mockProjectResponse = (
    warehouseConnection: Project['warehouseConnection'],
) => {
    mockLightdashApi.mockResolvedValueOnce({
        projectUuid: PROJECT_UUID,
        warehouseConnection,
    } as never);
};

describe('getDisableTimestampConversionFromProject', () => {
    it('returns the setting for snowflake connections', () => {
        expect(
            getDisableTimestampConversionFromProject(snowflakeConnection(true)),
        ).toBe(true);
        expect(
            getDisableTimestampConversionFromProject(
                snowflakeConnection(false),
            ),
        ).toBe(false);
    });

    it('returns undefined when the setting is not set', () => {
        expect(
            getDisableTimestampConversionFromProject(snowflakeConnection()),
        ).toBeUndefined();
    });

    it('returns undefined for non-snowflake connections', () => {
        expect(
            getDisableTimestampConversionFromProject(postgresConnection),
        ).toBeUndefined();
    });

    it('returns undefined when there is no warehouse connection', () => {
        expect(
            getDisableTimestampConversionFromProject(undefined),
        ).toBeUndefined();
    });
});

describe('getProjectDisableTimestampConversion', () => {
    let consoleErrorSpy: MockInstance;

    beforeEach(() => {
        consoleErrorSpy = vi
            .spyOn(console, 'error')
            .mockImplementation(() => {});
    });

    afterEach(() => {
        consoleErrorSpy.mockRestore();
        vi.clearAllMocks();
    });

    it('returns the project setting when the CLI flag is not provided', async () => {
        mockProjectResponse(snowflakeConnection(true));

        const result = await getProjectDisableTimestampConversion(
            undefined,
            PROJECT_UUID,
        );

        expect(result).toBe(true);
        expect(mockLightdashApi).toHaveBeenCalledTimes(1);
        expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('returns undefined when the snowflake project has no setting', async () => {
        mockProjectResponse(snowflakeConnection());

        const result = await getProjectDisableTimestampConversion(
            undefined,
            PROJECT_UUID,
        );

        expect(result).toBeUndefined();
    });

    it('returns undefined for non-snowflake projects', async () => {
        mockProjectResponse(postgresConnection);

        const result = await getProjectDisableTimestampConversion(
            undefined,
            PROJECT_UUID,
        );

        expect(result).toBeUndefined();
    });

    it('ignores the CLI flag, warns, and uses the project setting', async () => {
        mockProjectResponse(snowflakeConnection(true));

        const result = await getProjectDisableTimestampConversion(
            false,
            PROJECT_UUID,
        );

        expect(result).toBe(true);
        expect(mockLightdashApi).toHaveBeenCalledTimes(1);
        expect(consoleErrorSpy).toHaveBeenCalledWith(
            expect.stringContaining('Ignoring --disable-timestamp-conversion'),
        );
    });

    it('ignores a truthy CLI flag when the project has no setting', async () => {
        mockProjectResponse(snowflakeConnection());

        const result = await getProjectDisableTimestampConversion(
            true,
            PROJECT_UUID,
        );

        expect(result).toBeUndefined();
        expect(consoleErrorSpy).toHaveBeenCalledWith(
            expect.stringContaining('Ignoring --disable-timestamp-conversion'),
        );
    });

    it('returns undefined and does not throw when the project fetch fails', async () => {
        mockLightdashApi.mockRejectedValueOnce(new Error('network error'));

        const result = await getProjectDisableTimestampConversion(
            undefined,
            PROJECT_UUID,
        );

        expect(result).toBeUndefined();
    });
});
