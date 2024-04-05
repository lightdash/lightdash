import { LightdashInstallType, LightdashMode } from '@lightdash/common';
import { getDockerHubVersion } from '../../clients/DockerHub/DockerHub';
import { MigrationModel } from '../../models/MigrationModel/MigrationModel';
import { OrganizationModel } from '../../models/OrganizationModel';
import { HealthService } from './HealthService';
import { BaseResponse, Config, userMock } from './HealthService.mock';

jest.mock('../../version', () => ({
    VERSION: '0.1.0',
}));

const organizationModel = {
    hasOrgs: jest.fn(async () => true),
};
jest.mock('../../clients/DockerHub/DockerHub', () => ({
    getDockerHubVersion: jest.fn(() => '0.2.7'),
}));

const migrationModel = {
    getMigrationStatus: jest.fn(() => ({
        isComplete: true,
        currentVersion: 'example',
    })),
};

describe('health', () => {
    const healthService = new HealthService({
        organizationModel: organizationModel as unknown as OrganizationModel,
        lightdashConfig: Config,
        migrationModel: migrationModel as unknown as MigrationModel,
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
    it('Should return last version as undefined when fails fetch', async () => {
        (getDockerHubVersion as jest.Mock).mockImplementationOnce(
            () => undefined,
        );

        expect(await healthService.getHealthState(undefined)).toEqual({
            ...BaseResponse,
            latest: { version: undefined },
        });
    });

    it('Should return isAuthenticated true', async () => {
        expect(await healthService.getHealthState(userMock)).toEqual({
            ...BaseResponse,
            isAuthenticated: true,
        });
    });
    it('Should return localDbtEnabled false when in cloud beta mode', async () => {
        const service = new HealthService({
            organizationModel:
                organizationModel as unknown as OrganizationModel,
            lightdashConfig: {
                ...Config,
                mode: LightdashMode.CLOUD_BETA,
            },
            migrationModel: migrationModel as unknown as MigrationModel,
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
    it('Should return requiresOrgRegistration true if there are no orgs in DB', async () => {
        (organizationModel.hasOrgs as jest.Mock).mockImplementationOnce(
            async () => false,
        );

        expect(await healthService.getHealthState(undefined)).toEqual({
            ...BaseResponse,
            requiresOrgRegistration: true,
        });
    });
});
