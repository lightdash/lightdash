import fetchMock from 'jest-fetch-mock';
import { LightdashMode } from 'common';
import { getHealthState } from './health';
import { ImagesResponse, Image } from './health.mock';
import { hasUsers } from './database/entities/users';
import { projectService } from './services/services';

jest.mock('./version', () => ({
    VERSION: '0.1.0',
}));

jest.mock('./database/entities/users', () => ({
    hasUsers: jest.fn(),
}));

jest.mock('./services/services', () => ({
    projectService: {
        hasProject: jest.fn(() => true),
    },
}));

jest.mock('./config/lightdashConfig', () => ({
    lightdashConfig: {
        mode: LightdashMode.DEFAULT,
        projects: [
            {
                name: 'default',
                type: 'dbt',
                profiles_dir: '/',
                project_dir: '/',
            },
        ],
    },
}));

describe('health', () => {
    beforeEach(() => {
        fetchMock.mockResponse(async () => ({
            body: JSON.stringify(ImagesResponse),
        }));
        (hasUsers as jest.Mock).mockImplementation(async () => true);
        (projectService.hasProject as jest.Mock).mockImplementation(
            async () => true,
        );
    });

    it('Should get current and latest version', async () => {
        expect(await getHealthState(false)).toEqual({
            healthy: true,
            version: '0.1.0',
            rudder: undefined,
            mode: LightdashMode.DEFAULT,
            isAuthenticated: false,
            needsSetup: false,
            needsProject: false,
            defaultProject: undefined,
            latest: { version: Image.name },
        });
    });
    it('Should return last version as undefined when fails fetch', async () => {
        fetchMock.mockReject();

        expect(await getHealthState(false)).toEqual({
            healthy: true,
            version: '0.1.0',
            rudder: undefined,
            mode: LightdashMode.DEFAULT,
            isAuthenticated: false,
            needsSetup: false,
            needsProject: false,
            defaultProject: undefined,
            latest: { version: undefined },
        });
    });
    it('Should return needsSetup true if there are no users in DB', async () => {
        (hasUsers as jest.Mock).mockImplementation(async () => false);

        expect(await getHealthState(false)).toEqual({
            healthy: true,
            version: '0.1.0',
            rudder: undefined,
            mode: LightdashMode.DEFAULT,
            isAuthenticated: false,
            needsSetup: true,
            needsProject: false,
            defaultProject: undefined,
            latest: { version: Image.name },
        });
    });
    it('Should return needsProject true and defaultProject if there are no projects in DB', async () => {
        (projectService.hasProject as jest.Mock).mockImplementation(
            async () => false,
        );

        expect(await getHealthState(false)).toEqual({
            healthy: true,
            version: '0.1.0',
            rudder: undefined,
            mode: LightdashMode.DEFAULT,
            isAuthenticated: false,
            needsSetup: false,
            needsProject: true,
            defaultProject: {
                name: 'default',
                type: 'dbt',
                profiles_dir: '/',
                project_dir: '/',
            },
            latest: { version: Image.name },
        });
    });
    it('Should return isAuthenticated true', async () => {
        expect(await getHealthState(true)).toEqual({
            healthy: true,
            version: '0.1.0',
            rudder: undefined,
            mode: LightdashMode.DEFAULT,
            isAuthenticated: true,
            needsSetup: false,
            needsProject: false,
            defaultProject: undefined,
            latest: { version: Image.name },
        });
    });
});
