import {
    AthenaAuthenticationType,
    CreateWarehouseCredentials,
    ParameterError,
    WarehouseTypes,
} from '@lightdash/common';
import type {
    DbtTargetPolicy,
    DbtTargetResult,
} from '../../services/WarehouseClientFactory/CredentialResolver';
import {
    ambientIdentityTarget,
    DEFAULT_THREADS,
    envVar,
    envVarReference,
} from './helpers';

export const athenaTarget = (
    credentials: Extract<
        CreateWarehouseCredentials,
        { type: WarehouseTypes.ATHENA }
    >,
    policy: DbtTargetPolicy,
): DbtTargetResult => {
    if (
        policy.explicitCredentials &&
        (credentials.authenticationType === AthenaAuthenticationType.IAM_ROLE ||
            credentials.authenticationType ===
                AthenaAuthenticationType.WEB_IDENTITY)
    )
        return ambientIdentityTarget(
            credentials.authenticationType === AthenaAuthenticationType.IAM_ROLE
                ? 'Athena IAM_ROLE'
                : 'Athena WEB_IDENTITY',
        );
    const athenaAuthenticationType =
        credentials.authenticationType ?? AthenaAuthenticationType.ACCESS_KEY;

    const { accessKeyId, secretAccessKey } = credentials;

    if (
        athenaAuthenticationType === AthenaAuthenticationType.ACCESS_KEY &&
        (!accessKeyId || !secretAccessKey)
    ) {
        throw new ParameterError(
            'Athena access key authentication requires accessKeyId and secretAccessKey',
        );
    }

    return {
        kind: 'target',
        target: {
            type: WarehouseTypes.ATHENA,
            region_name: credentials.region,
            database: credentials.database,
            schema: credentials.schema,
            s3_staging_dir: credentials.s3StagingDir,
            s3_data_dir: credentials.s3DataDir || undefined,
            work_group: credentials.workGroup || undefined,
            threads: credentials.threads || DEFAULT_THREADS,
            num_retries: credentials.numRetries || undefined,
            // dbt only parses and lists here, so it never connects.
            // Web identity credentials are resolved by the warehouse
            // client, not passed to dbt.
            ...(athenaAuthenticationType ===
            AthenaAuthenticationType.WEB_IDENTITY
                ? {}
                : {
                      aws_assume_role_arn:
                          credentials.assumeRoleArn || undefined,
                      aws_assume_role_external_id:
                          credentials.assumeRoleExternalId || undefined,
                  }),
            ...(athenaAuthenticationType === AthenaAuthenticationType.ACCESS_KEY
                ? {
                      aws_access_key_id: envVarReference('accessKeyId'),
                      aws_secret_access_key: envVarReference('secretAccessKey'),
                  }
                : {}),
        },
        environment:
            athenaAuthenticationType === AthenaAuthenticationType.ACCESS_KEY
                ? {
                      [envVar('accessKeyId')]: accessKeyId!,
                      [envVar('secretAccessKey')]: secretAccessKey!,
                  }
                : {},
    };
};
