import {
    AthenaAuthenticationType,
    WarehouseTypes,
    type CreateAthenaCredentials,
} from '@lightdash/common';
import knex from 'knex';
import { MockClient } from 'knex-mock-client';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { EncryptionUtil } from '../../utils/EncryptionUtil/EncryptionUtil';
import { AwsWebIdentityAudienceModel } from '../AwsWebIdentityAudienceModel';
import { ProjectModel } from './ProjectModel';

const ORG_A = '00000000-0000-4000-8000-00000000000a';
const ORG_B = '00000000-0000-4000-8000-00000000000b';

const credentials: CreateAthenaCredentials = {
    type: WarehouseTypes.ATHENA,
    region: 'eu-west-1',
    database: 'AwsDataCatalog',
    schema: 'analytics',
    s3StagingDir: 's3://bucket/results/',
    authenticationType: AthenaAuthenticationType.WEB_IDENTITY,
    assumeRoleArn: 'arn:aws:iam::123456789012:role/lightdash',
    webIdentityAudience: 'lightdash-audience-a',
};

const buildModel = (enabled: boolean) =>
    new ProjectModel({
        database: knex({ client: MockClient, dialect: 'pg' }),
        lightdashConfig: {
            ...lightdashConfigMock,
            athenaWarehouseWebIdentityAuth: { enabled },
        },
        encryptionUtil: new EncryptionUtil({
            lightdashConfig: lightdashConfigMock,
        }),
    });

describe('ProjectModel.getWarehouseClientIdentityOptions', () => {
    const getOrganizationUuid = vi.spyOn(
        AwsWebIdentityAudienceModel.prototype,
        'getOrganizationUuid',
    );

    beforeEach(() => {
        getOrganizationUuid.mockReset();
        getOrganizationUuid.mockImplementation(async (audience) =>
            audience === 'lightdash-audience-a' ? ORG_A : null,
        );
    });

    test('uses an audience that belongs to the connection organization', async () => {
        await expect(
            buildModel(true).getWarehouseClientIdentityOptions(
                credentials,
                ORG_A,
            ),
        ).resolves.toEqual({
            awsWebIdentity: {
                audience: 'lightdash-audience-a',
                roleSessionName: `lightdash-${ORG_A}`,
            },
        });
    });

    test("refuses another organization's audience", async () => {
        const options = await buildModel(
            true,
        ).getWarehouseClientIdentityOptions(credentials, ORG_B);

        expect(options.awsWebIdentity).toBeUndefined();
        expect(options.awsWebIdentityUnavailableReason).toMatch(
            /no valid audience/,
        );
    });

    test('refuses an audience Lightdash did not generate', async () => {
        const options = await buildModel(
            true,
        ).getWarehouseClientIdentityOptions(
            { ...credentials, webIdentityAudience: 'made-up' },
            ORG_A,
        );

        expect(options.awsWebIdentity).toBeUndefined();
    });

    test('refuses a missing audience without a lookup', async () => {
        const options = await buildModel(
            true,
        ).getWarehouseClientIdentityOptions(
            { ...credentials, webIdentityAudience: undefined },
            ORG_A,
        );

        expect(options.awsWebIdentity).toBeUndefined();
        expect(getOrganizationUuid).not.toHaveBeenCalled();
    });

    test('refuses everything when the instance has not enabled it', async () => {
        const options = await buildModel(
            false,
        ).getWarehouseClientIdentityOptions(credentials, ORG_A);

        expect(options.awsWebIdentity).toBeUndefined();
        expect(options.awsWebIdentityUnavailableReason).toMatch(/not enabled/);
        expect(getOrganizationUuid).not.toHaveBeenCalled();
    });

    test('returns nothing for other authentication types', async () => {
        await expect(
            buildModel(true).getWarehouseClientIdentityOptions(
                {
                    ...credentials,
                    authenticationType: AthenaAuthenticationType.ACCESS_KEY,
                },
                ORG_A,
            ),
        ).resolves.toEqual({});
    });
});
