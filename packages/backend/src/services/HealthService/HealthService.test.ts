import { LightdashInstallType, LightdashMode } from '@lightdash/common';
import { createHmac } from 'crypto';
import { getDockerHubVersion } from '../../clients/DockerHub/DockerHub';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { MigrationModel } from '../../models/MigrationModel/MigrationModel';
import { OrganizationModel } from '../../models/OrganizationModel';
import { HealthService } from './HealthService';
import { BaseResponse, userMock } from './HealthService.mock';

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
        lightdashConfig: lightdashConfigMock,
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
                ...lightdashConfigMock,
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

    describe('getPylonVerificationHash', () => {
        const testEmail = 'test@example.com';
        // Valid hex string (32 bytes = 64 hex chars)
        const testSecret =
            'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';

        it('Should return undefined verificationHash when no pylon secret is configured', async () => {
            const userWithEmail = { ...userMock, email: testEmail };
            const result = await healthService.getHealthState(userWithEmail);
            expect(result.pylon.verificationHash).toBeUndefined();
        });

        it('Should return undefined verificationHash when user has no email', async () => {
            const service = new HealthService({
                organizationModel:
                    organizationModel as unknown as OrganizationModel,
                lightdashConfig: {
                    ...lightdashConfigMock,
                    pylon: {
                        ...lightdashConfigMock.pylon,
                        identityVerificationSecret: testSecret,
                    },
                },
                migrationModel: migrationModel as unknown as MigrationModel,
            });

            const result = await service.getHealthState(userMock);
            expect(result.pylon.verificationHash).toBeUndefined();
        });

        it('Should return correct HMAC hash when pylon secret and email are present', async () => {
            const service = new HealthService({
                organizationModel:
                    organizationModel as unknown as OrganizationModel,
                lightdashConfig: {
                    ...lightdashConfigMock,
                    pylon: {
                        ...lightdashConfigMock.pylon,
                        identityVerificationSecret: testSecret,
                    },
                },
                migrationModel: migrationModel as unknown as MigrationModel,
            });

            const userWithEmail = { ...userMock, email: testEmail };
            const result = await service.getHealthState(userWithEmail);

            // Calculate expected hash
            const secretBytes = Buffer.from(testSecret, 'hex');
            const expectedHash = createHmac('sha256', secretBytes)
                .update(testEmail)
                .digest('hex');

            expect(result.pylon.verificationHash).toBe(expectedHash);
        });
    });
});
