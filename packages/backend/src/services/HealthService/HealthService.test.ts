import { LightdashInstallType, LightdashMode } from 'common';
import fetchMock from 'jest-fetch-mock';
import { projectModel, userModel } from '../../models/models';
import { HealthService } from './HealthService';
import { BaseResponse, Config, ImagesResponse } from './HealthService.mock';

jest.mock('../../models/models', () => ({
    projectModel: {
        hasProjects: jest.fn(async () => true),
    },
    userModel: {
        hasUsers: jest.fn(async () => true),
    },
}));

jest.mock('../../version', () => ({
    VERSION: '0.1.0',
}));

jest.mock('../../database/database', () => ({
    getMigrationStatus: jest.fn(() => ({
        isComplete: true,
        currentVersion: 'example',
    })),
}));

describe('health', () => {
    const healthService = new HealthService({
        userModel,
        projectModel,
        lightdashConfig: Config,
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    beforeEach(() => {
        process.env = {
            LIGHTDASH_INSTALL_TYPE: LightdashInstallType.UNKNOWN,
        };
        fetchMock.mockResponse(async () => ({
            body: JSON.stringify(ImagesResponse),
        }));
    });

    it('Should get current and latest version', async () => {
        expect(await healthService.getHealthState(false)).toEqual(BaseResponse);
    });
    it('Should return last version as undefined when fails fetch', async () => {
        fetchMock.mockReject();

        expect(await healthService.getHealthState(false)).toEqual({
            ...BaseResponse,
            latest: { version: undefined },
        });
    });
    it('Should return needsSetup true if there are no users in DB', async () => {
        (userModel.hasUsers as jest.Mock).mockImplementationOnce(
            async () => false,
        );

        expect(await healthService.getHealthState(false)).toEqual({
            ...BaseResponse,
            needsSetup: true,
        });
    });
    it('Should return needsProject true if there are no projects in DB', async () => {
        (projectModel.hasProjects as jest.Mock).mockImplementationOnce(
            async () => false,
        );

        expect(await healthService.getHealthState(false)).toEqual({
            ...BaseResponse,
            needsProject: true,
        });
    });
    it('Should return isAuthenticated true', async () => {
        expect(await healthService.getHealthState(true)).toEqual({
            ...BaseResponse,
            isAuthenticated: true,
        });
    });
    it('Should return localDbtEnabled false when in cloud beta mode', async () => {
        const service = new HealthService({
            userModel,
            projectModel,
            lightdashConfig: {
                ...Config,
                mode: LightdashMode.CLOUD_BETA,
            },
        });
        expect(await service.getHealthState(false)).toEqual({
            ...BaseResponse,
            mode: LightdashMode.CLOUD_BETA,
            localDbtEnabled: false,
        });
    });
    it('Should return localDbtEnabled false when install type is heroku', async () => {
        process.env.LIGHTDASH_INSTALL_TYPE = LightdashInstallType.HEROKU;
        expect(await healthService.getHealthState(false)).toEqual({
            ...BaseResponse,
            localDbtEnabled: false,
        });
    });
});
