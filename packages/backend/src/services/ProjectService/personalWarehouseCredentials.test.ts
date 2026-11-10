import {
    AthenaAuthenticationType,
    WarehouseTypes,
    type CreateAthenaCredentials,
    type UserWarehouseCredentialsWithSecrets,
} from '@lightdash/common';
import { mergePersonalWarehouseCredentials } from './personalWarehouseCredentials';

const projectCredentials: CreateAthenaCredentials = {
    type: WarehouseTypes.ATHENA,
    region: 'eu-west-1',
    database: 'AwsDataCatalog',
    schema: 'analytics',
    s3StagingDir: 's3://bucket/results/',
    authenticationType: AthenaAuthenticationType.WEB_IDENTITY,
    assumeRoleArn: 'arn:aws:iam::123456789012:role/project',
    webIdentityAudience: 'lightdash-project-audience',
    requireUserCredentials: true,
};

const personal = (
    credentials: Record<string, unknown>,
): Pick<UserWarehouseCredentialsWithSecrets, 'credentials'> => ({
    credentials: {
        type: WarehouseTypes.ATHENA,
        ...credentials,
    } as UserWarehouseCredentialsWithSecrets['credentials'],
});

describe('Athena personal credentials', () => {
    test("use the user's keys instead of the project's web identity role", () => {
        expect(
            mergePersonalWarehouseCredentials(
                projectCredentials,
                personal({ accessKeyId: 'AKIA', secretAccessKey: 'secret' }),
            ),
        ).toEqual({
            type: WarehouseTypes.ATHENA,
            region: 'eu-west-1',
            database: 'AwsDataCatalog',
            schema: 'analytics',
            s3StagingDir: 's3://bucket/results/',
            authenticationType: AthenaAuthenticationType.ACCESS_KEY,
            accessKeyId: 'AKIA',
            secretAccessKey: 'secret',
            requireUserCredentials: true,
        });
    });

    test("can't switch the connection to web identity or another role", () => {
        const merged = mergePersonalWarehouseCredentials(
            {
                ...projectCredentials,
                authenticationType: AthenaAuthenticationType.ACCESS_KEY,
                assumeRoleArn: undefined,
                webIdentityAudience: undefined,
            },
            personal({
                accessKeyId: 'AKIA',
                secretAccessKey: 'secret',
                authenticationType: AthenaAuthenticationType.WEB_IDENTITY,
                assumeRoleArn: 'arn:aws:iam::123456789012:role/other',
                webIdentityAudience: 'lightdash-other-audience',
                region: 'us-east-1',
                s3StagingDir: 's3://other/',
            }),
        );

        expect(merged).toMatchObject({
            authenticationType: AthenaAuthenticationType.ACCESS_KEY,
            region: 'eu-west-1',
            s3StagingDir: 's3://bucket/results/',
        });
        expect(merged).not.toHaveProperty('webIdentityAudience');
        expect(
            merged.type === WarehouseTypes.ATHENA && merged.assumeRoleArn,
        ).toBeFalsy();
    });

    test("keep an access key project's assume role for the user's keys", () => {
        const merged = mergePersonalWarehouseCredentials(
            {
                ...projectCredentials,
                authenticationType: AthenaAuthenticationType.ACCESS_KEY,
                webIdentityAudience: undefined,
            },
            personal({ accessKeyId: 'AKIA', secretAccessKey: 'secret' }),
        );

        expect(merged).toMatchObject({
            authenticationType: AthenaAuthenticationType.ACCESS_KEY,
            assumeRoleArn: 'arn:aws:iam::123456789012:role/project',
            accessKeyId: 'AKIA',
        });
    });
});
