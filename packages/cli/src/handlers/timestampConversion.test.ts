import {
    ForbiddenError,
    WarehouseTypes,
    type DbtSourceBindings,
    type Project,
} from '@lightdash/common';
import type { MockedFunction, MockInstance } from 'vitest';
import GlobalState from '../globalState';
import * as styles from '../styles';
import { lightdashApi } from './dbt/apiClient';
import {
    getDisableTimestampConversionFromProject,
    getProjectDeploySettings,
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

describe('getProjectDeploySettings source settings', () => {
    const sourceUuid = 'finance-source';
    const projectUrl = `/api/v1/projects/${PROJECT_UUID}`;
    const bindingsUrl = `${projectUrl}/warehouse-connections/dbt-sources/bindings`;
    const connectionUrl = `${projectUrl}/warehouse-connections/extra-connection`;
    const bindings: DbtSourceBindings = {
        connections: [
            {
                warehouseConnectionUuid: 'original-connection',
                name: 'Original',
                isOriginal: true,
            },
            {
                warehouseConnectionUuid: 'extra-connection',
                name: 'Finance',
                isOriginal: false,
            },
        ],
        sources: [
            {
                projectDbtSourceUuid: sourceUuid,
                warehouseConnectionUuid: 'extra-connection',
            },
        ],
    };
    const getRequest = (url: string) => ({
        method: 'GET',
        url,
        body: undefined,
    });
    const mockProject = (connectionRoute: Project['connectionRoute']) => {
        mockLightdashApi.mockResolvedValueOnce({
            projectUuid: PROJECT_UUID,
            warehouseConnection: snowflakeConnection(false),
            connectionRoute,
        } as Project);
    };

    beforeEach(() => {
        mockLightdashApi.mockReset();
        vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.spyOn(GlobalState, 'debug').mockImplementation(() => {});
    });

    afterEach(() => {
        mockLightdashApi.mockReset();
        vi.restoreAllMocks();
    });

    it('reads the extra Snowflake connection setting without writing', async () => {
        mockProject('multi');
        mockLightdashApi.mockResolvedValueOnce(bindings).mockResolvedValueOnce({
            name: 'Finance',
            warehouseConnection: snowflakeConnection(true),
        });

        await expect(
            getProjectDeploySettings(undefined, PROJECT_UUID, sourceUuid),
        ).resolves.toEqual({
            disableTimestampConversion: true,
            connectionRoute: 'multi',
        });
        expect(mockLightdashApi.mock.calls).toEqual([
            [getRequest(projectUrl)],
            [getRequest(bindingsUrl)],
            [getRequest(connectionUrl)],
        ]);
        expect(GlobalState.debug).toHaveBeenCalledWith(
            '> Using disable-timestamp-conversion=true from connection "Finance"',
        );
    });

    it.each([
        {
            binding: 'null',
            sources: [
                {
                    projectDbtSourceUuid: sourceUuid,
                    warehouseConnectionUuid: null,
                },
            ],
        },
        { binding: 'missing', sources: [] },
        {
            binding: 'original',
            sources: [
                {
                    projectDbtSourceUuid: sourceUuid,
                    warehouseConnectionUuid: 'original-connection',
                },
            ],
        },
    ])(
        'uses the primary setting for a $binding source binding',
        async ({ sources }) => {
            mockProject('multi');
            mockLightdashApi.mockResolvedValueOnce({ ...bindings, sources });

            await expect(
                getProjectDeploySettings(undefined, PROJECT_UUID, sourceUuid),
            ).resolves.toEqual({
                disableTimestampConversion: false,
                connectionRoute: 'multi',
            });
            expect(mockLightdashApi.mock.calls).toEqual([
                [getRequest(projectUrl)],
                [getRequest(bindingsUrl)],
            ]);
        },
    );

    it.each([
        { connectionRoute: 'multi' as const, source: undefined },
        { connectionRoute: 'single' as const, source: sourceUuid },
        { connectionRoute: undefined, source: sourceUuid },
    ])(
        'only reads the project for route=$connectionRoute and source=$source',
        async ({ connectionRoute, source }) => {
            mockProject(connectionRoute);

            await expect(
                getProjectDeploySettings(undefined, PROJECT_UUID, source),
            ).resolves.toEqual({
                disableTimestampConversion: false,
                connectionRoute,
            });
            expect(mockLightdashApi.mock.calls).toEqual([
                [getRequest(projectUrl)],
            ]);
        },
    );

    it.each(['bindings', 'connection'])(
        'warns and uses the primary setting when the %s request returns 403',
        async (requestType) => {
            mockProject('multi');
            if (requestType === 'connection')
                mockLightdashApi.mockResolvedValueOnce(bindings);
            mockLightdashApi.mockRejectedValueOnce(new ForbiddenError());

            await expect(
                getProjectDeploySettings(undefined, PROJECT_UUID, sourceUuid),
            ).resolves.toEqual({
                disableTimestampConversion: false,
                connectionRoute: 'multi',
            });
            expect(mockLightdashApi.mock.calls).toEqual([
                [getRequest(projectUrl)],
                [getRequest(bindingsUrl)],
                ...(requestType === 'connection'
                    ? [[getRequest(connectionUrl)]]
                    : []),
            ]);
            expect(console.error).toHaveBeenCalledWith(
                styles.warning(
                    "Could not read the source's connection settings. Using the project setting for timestamp conversion.",
                ),
            );
        },
    );

    it.each(['bindings', 'connection'])(
        'stops deploy when the %s request fails without a 403',
        async (requestType) => {
            mockProject('multi');
            if (requestType === 'connection')
                mockLightdashApi.mockResolvedValueOnce(bindings);
            mockLightdashApi.mockRejectedValueOnce(new Error('network error'));

            await expect(
                getProjectDeploySettings(undefined, PROJECT_UUID, sourceUuid),
            ).rejects.toThrow(
                'Could not read project settings for deploy: network error',
            );
            expect(console.error).not.toHaveBeenCalled();
        },
    );
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

describe('getProjectDeploySettings', () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    it.each(['single', 'multi'] as const)(
        'reads the %s connection route from the same project request',
        async (connectionRoute) => {
            mockLightdashApi.mockResolvedValueOnce({
                projectUuid: PROJECT_UUID,
                warehouseConnection: snowflakeConnection(true),
                connectionRoute,
            } as never);

            await expect(
                getProjectDeploySettings(undefined, PROJECT_UUID, undefined),
            ).resolves.toEqual({
                disableTimestampConversion: true,
                connectionRoute,
            });
            expect(mockLightdashApi).toHaveBeenCalledTimes(1);
        },
    );

    it('stops deploy settings when the project fetch fails', async () => {
        mockLightdashApi.mockRejectedValueOnce(new Error('network error'));

        await expect(
            getProjectDeploySettings(undefined, PROJECT_UUID, undefined),
        ).rejects.toThrow('Could not read project settings for deploy');
    });
});
