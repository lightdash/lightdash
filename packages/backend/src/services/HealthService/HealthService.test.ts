import { LightdashInstallType, LightdashMode } from 'common';
import { getDockerHubVersion } from '../../clients/DockerHub/DockerHub';
import { projectModel, userModel } from '../../models/models';
import { HealthService } from './HealthService';
import { BaseResponse, Config, user } from './HealthService.mock';

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

jest.mock('../../clients/DockerHub/DockerHub', () => ({
    getDockerHubVersion: jest.fn(() => '0.2.7'),
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
    });

    it('Should get current and latest version', async () => {
        expect(await healthService.getHealthState(undefined)).toEqual(
            BaseResponse,
        );
    });
    it('Should get current and latest version', async () => {
        expect(await healthService.getHealthState(undefined)).toEqual(
            BaseResponse,
        );
    });
    it('Should return last version as undefined when fails fetch', async () => {
        (getDockerHubVersion as jest.Mock).mockImplementationOnce(
            () => undefined,
        );

        expect(await healthService.getHealthState(undefined)).toEqual({
            ...BaseResponse,
            latest: { version: undefined },
        });
    });

    it('Should return needsProject false if there are projects in DB', async () => {
        (projectModel.hasProjects as jest.Mock).mockImplementationOnce(
            async () => true,
        );

        expect(await healthService.getHealthState(user)).toEqual({
            ...BaseResponse,
            needsProject: false,
            isAuthenticated: true,
        });
    });
    it('Should return isAuthenticated true', async () => {
        (projectModel.hasProjects as jest.Mock).mockImplementationOnce(
            async () => false,
        );

        expect(await healthService.getHealthState(user)).toEqual({
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
        expect(await service.getHealthState(undefined)).toEqual({
            ...BaseResponse,
            mode: LightdashMode.CLOUD_BETA,
            localDbtEnabled: false,
        });
    });
    it('Should return localDbtEnabled false when install type is heroku', async () => {
        process.env.LIGHTDASH_INSTALL_TYPE = LightdashInstallType.HEROKU;
        expect(await healthService.getHealthState(undefined)).toEqual({
            ...BaseResponse,
            localDbtEnabled: false,
        });
    });
});
