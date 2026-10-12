import type { S3Client } from '@aws-sdk/client-s3';
import { MissingConfigError } from '@lightdash/common';
import { createS3ClientFromConfig } from '../../clients/Aws/S3BaseClient';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import type { LightdashConfig } from '../../config/parseConfig';
import type { OrganizationDesignModel } from '../../models/OrganizationDesignModel';
import { OrganizationDesignService } from './OrganizationDesignService';

vi.mock('../../clients/Aws/S3BaseClient', () => ({
    createS3ClientFromConfig: vi.fn(),
}));

type ServiceWithS3 = OrganizationDesignService & {
    getS3Client: () => { client: S3Client; bucket: string };
};

const buildService = (s3: LightdashConfig['appRuntime']['s3']): ServiceWithS3 =>
    new OrganizationDesignService({
        lightdashConfig: {
            ...lightdashConfigMock,
            appRuntime: { ...lightdashConfigMock.appRuntime, s3 },
        },
        organizationDesignModel: {} as OrganizationDesignModel,
    }) as ServiceWithS3;

describe('OrganizationDesignService S3 client', () => {
    beforeEach(() => {
        vi.mocked(createS3ClientFromConfig).mockReset();
    });

    it('builds the client through the shared factory so gcp_oauth gets its middleware', () => {
        const s3Config: NonNullable<LightdashConfig['appRuntime']['s3']> = {
            bucket: 'apps-bucket',
            region: 'auto',
            endpoint: 'https://storage.googleapis.com',
            forcePathStyle: true,
            authMode: 'gcp_oauth',
        };
        const client = { send: vi.fn() } as unknown as S3Client;
        vi.mocked(createS3ClientFromConfig).mockReturnValue(client);

        const result = buildService(s3Config).getS3Client();

        expect(createS3ClientFromConfig).toHaveBeenCalledTimes(1);
        expect(createS3ClientFromConfig).toHaveBeenCalledWith(s3Config);
        expect(result).toEqual({ client, bucket: 'apps-bucket' });
    });

    it('throws MissingConfigError when app runtime storage is not configured', () => {
        expect(() => buildService(null).getS3Client()).toThrow(
            MissingConfigError,
        );
        expect(createS3ClientFromConfig).not.toHaveBeenCalled();
    });
});
