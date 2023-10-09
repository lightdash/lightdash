import { LightdashInstallType, LightdashMode } from '@lightdash/common';
import { getDockerHubVersion } from '../../clients/DockerHub/DockerHub';
import { organizationModel } from '../../models/models';
import { HealthService } from './HealthService';
import { BaseResponse, Config } from './HealthService.mock';

jest.mock('../../version', () => ({
    VERSION: '0.1.0',
}));

jest.mock('../../models/models', () => ({
    organizationModel: {
        hasOrgs: jest.fn(async () => true),
    },
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
        organizationModel,
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
        expect(await healthService.getHealthState(false)).toEqual(BaseResponse);
    });
    it('Should return last version as undefined when fails fetch', async () => {
        (getDockerHubVersion as jest.Mock).mockImplementationOnce(
            () => undefined,
        );

        expect(await healthService.getHealthState(false)).toEqual({
            ...BaseResponse,
            latest: { version: undefined },
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
            organizationModel,
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
    it('Should return requiresOrgRegistration true if there are no orgs in DB', async () => {
        (organizationModel.hasOrgs as jest.Mock).mockImplementationOnce(
            async () => false,
        );

        expect(await healthService.getHealthState(false)).toEqual({
            ...BaseResponse,
            requiresOrgRegistration: true,
        });
    });
});
