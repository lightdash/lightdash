import {
    DbtProjectType,
    JobStatusType,
    SupportedDbtVersions,
    WarehouseTypes,
    type CreateWarehouseCredentials,
} from '@lightdash/common';
import type { MockedFunction } from 'vitest';
import { lightdashApi } from './dbt/apiClient';
import { getFinalJobState } from './dbt/refresh';
import {
    getWarehouseCredentialsSource,
    updateProjectWarehouseConnection,
} from './warehouseConnection';

vi.mock('./dbt/apiClient', () => ({
    lightdashApi: vi.fn(),
}));
vi.mock('./dbt/refresh', () => ({
    getFinalJobState: vi.fn(),
}));

const mockLightdashApi = lightdashApi as MockedFunction<typeof lightdashApi>;
const mockGetFinalJobState = getFinalJobState as MockedFunction<
    typeof getFinalJobState
>;

const PROJECT_UUID = '00000000-0000-0000-0000-000000000001';

const project = {
    projectUuid: PROJECT_UUID,
    name: 'my-preview',
    dbtConnection: { type: DbtProjectType.NONE as const },
    dbtVersion: SupportedDbtVersions.V1_10,
};

const credentials: CreateWarehouseCredentials = {
    type: WarehouseTypes.POSTGRES,
    host: 'localhost',
    user: 'refreshed-user',
    password: 'refreshed-password',
    port: 5432,
    dbname: 'db',
    schema: 'public',
};

describe('getWarehouseCredentialsSource', () => {
    it('loads from profiles by default', () => {
        expect(getWarehouseCredentialsSource({})).toEqual({
            source: 'profiles',
        });
        expect(
            getWarehouseCredentialsSource({ warehouseCredentials: true }),
        ).toEqual({ source: 'profiles' });
    });

    it('skips when --no-warehouse-credentials is set', () => {
        expect(
            getWarehouseCredentialsSource({ warehouseCredentials: false }),
        ).toEqual({ source: 'none' });
    });

    it('prefers organization credentials over profiles', () => {
        expect(
            getWarehouseCredentialsSource({
                organizationCredentials: 'shared-redshift',
                warehouseCredentials: false,
            }),
        ).toEqual({ source: 'organization', name: 'shared-redshift' });
    });
});

describe('updateProjectWarehouseConnection', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('patches the project with the new credentials and waits for the job', async () => {
        mockLightdashApi.mockResolvedValueOnce({ jobUuid: 'job-1' });
        mockGetFinalJobState.mockResolvedValueOnce({
            jobStatus: JobStatusType.DONE,
        } as Awaited<ReturnType<typeof getFinalJobState>>);

        await updateProjectWarehouseConnection(
            project,
            credentials,
            'Refreshing warehouse credentials',
        );

        expect(mockLightdashApi).toHaveBeenCalledTimes(1);
        const call = mockLightdashApi.mock.calls[0][0];
        expect(call.method).toBe('PATCH');
        expect(call.url).toBe(`/api/v1/projects/${PROJECT_UUID}`);
        expect(JSON.parse(call.body as string)).toEqual({
            name: 'my-preview',
            dbtConnection: { type: DbtProjectType.NONE },
            dbtVersion: SupportedDbtVersions.V1_10,
            warehouseConnection: credentials,
        });
        expect(mockGetFinalJobState).toHaveBeenCalledWith(
            'job-1',
            'Refreshing warehouse credentials',
        );
    });

    it('surfaces a failed adapter test', async () => {
        mockLightdashApi.mockResolvedValueOnce({ jobUuid: 'job-2' });
        mockGetFinalJobState.mockRejectedValueOnce(
            new Error('Your Redshift IAM AWS session has expired'),
        );

        await expect(
            updateProjectWarehouseConnection(project, credentials, 'label'),
        ).rejects.toThrow('session has expired');
    });
});
