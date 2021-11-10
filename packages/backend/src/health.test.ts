import { LightdashInstallType, LightdashMode } from 'common';
import fetchMock from 'jest-fetch-mock';
import { lightdashConfig } from './config/lightdashConfig';
import { hasUsers } from './database/entities/users';
import { getHealthState } from './health';
import { BaseResponse, ImagesResponse } from './health.mock';
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
        process.env = {
            LIGHTDASH_INSTALL_TYPE: LightdashInstallType.UNKNOWN,
        };
        lightdashConfig.mode = LightdashMode.DEFAULT;
        fetchMock.mockResponse(async () => ({
            body: JSON.stringify(ImagesResponse),
        }));
        (hasUsers as jest.Mock).mockImplementation(async () => true);
        (projectService.hasProject as jest.Mock).mockImplementation(
            async () => true,
        );
    });

    it('Should get current and latest version', async () => {
        expect(await getHealthState(false)).toEqual(BaseResponse);
    });
    it('Should return last version as undefined when fails fetch', async () => {
        fetchMock.mockReject();

        expect(await getHealthState(false)).toEqual({
            ...BaseResponse,
            latest: { version: undefined },
        });
    });
    it('Should return needsSetup true if there are no users in DB', async () => {
        (hasUsers as jest.Mock).mockImplementation(async () => false);

        expect(await getHealthState(false)).toEqual({
            ...BaseResponse,
            needsSetup: true,
        });
    });
    it('Should return needsProject true if there are no projects in DB', async () => {
        (projectService.hasProject as jest.Mock).mockImplementation(
            async () => false,
        );

        expect(await getHealthState(false)).toEqual({
            ...BaseResponse,
            needsProject: true,
        });
    });
    it('Should return isAuthenticated true', async () => {
        expect(await getHealthState(true)).toEqual({
            ...BaseResponse,
            isAuthenticated: true,
        });
    });
    it('Should return localDbtEnabled false when in cloud beta mode', async () => {
        lightdashConfig.mode = LightdashMode.CLOUD_BETA;
        expect(await getHealthState(false)).toEqual({
            ...BaseResponse,
            mode: LightdashMode.CLOUD_BETA,
            localDbtEnabled: false,
        });
    });
    it('Should return localDbtEnabled false when install type is heroku', async () => {
        process.env.LIGHTDASH_INSTALL_TYPE = LightdashInstallType.HEROKU;
        expect(await getHealthState(false)).toEqual({
            ...BaseResponse,
            localDbtEnabled: false,
        });
    });
});
