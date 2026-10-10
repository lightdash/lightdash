import {
    CreateWarehouseCredentials,
    ParameterError,
    RedshiftAuthenticationType,
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

export const redshiftTarget = (
    credentials: Extract<
        CreateWarehouseCredentials,
        { type: WarehouseTypes.REDSHIFT }
    >,
    policy: DbtTargetPolicy,
): DbtTargetResult => {
    if (
        policy.explicitCredentials &&
        (credentials.authenticationType === RedshiftAuthenticationType.IAM ||
            credentials.authenticationType ===
                RedshiftAuthenticationType.IAM_BROWSER) &&
        !(credentials.accessKeyId && credentials.secretAccessKey)
    )
        return ambientIdentityTarget(
            credentials.authenticationType ===
                RedshiftAuthenticationType.IAM_BROWSER
                ? 'Redshift IAM_BROWSER'
                : 'Redshift IAM',
        );
    const redshiftSharedTarget = {
        type: credentials.type,
        host: credentials.host,
        port: credentials.port,
        dbname: credentials.dbname,
        schema: credentials.schema,
        threads: DEFAULT_THREADS,
        keepalives_idle: credentials.keepalivesIdle,
        sslmode: credentials.sslmode,
        sslrootcert:
            require.resolve('@lightdash/warehouses/dist/warehouseClients/ca-bundle-aws-redshift.crt'),
        ra3_node: credentials.ra3Node || true,
    };

    if (
        credentials.authenticationType === RedshiftAuthenticationType.IAM ||
        credentials.authenticationType ===
            RedshiftAuthenticationType.IAM_BROWSER
    ) {
        if (!credentials.region) {
            throw new ParameterError(
                'Redshift IAM authentication requires an AWS region',
            );
        }
        // dbt-redshift's connector cannot assume a role from the
        // profile, so an assume-role ARN without pre-resolved session
        // credentials would silently authenticate as the wrong (base)
        // identity. Reject it until STS pre-resolution is wired up.
        if (credentials.assumeRoleArn && !credentials.sessionToken) {
            throw new ParameterError(
                'Redshift IAM assume-role is not yet supported for dbt compilation. Use static AWS credentials, the host IAM role, or remove the assume-role ARN.',
            );
        }
        // dbt-redshift's connector (boto3) reads AWS credentials from
        // the standard env vars. When neither static keys nor a
        // pre-resolved session token are present we set nothing, so
        // boto3 falls back to its default credential chain.
        const awsEnvironment: Record<string, string> = {};
        if (credentials.accessKeyId && credentials.secretAccessKey) {
            awsEnvironment.AWS_ACCESS_KEY_ID = credentials.accessKeyId;
            awsEnvironment.AWS_SECRET_ACCESS_KEY = credentials.secretAccessKey;
            if (credentials.sessionToken) {
                awsEnvironment.AWS_SESSION_TOKEN = credentials.sessionToken;
            }
        }
        return {
            kind: 'target',
            target: {
                ...redshiftSharedTarget,
                method: 'iam',
                region: credentials.region,
                // Provisioned clusters need a cluster_id; serverless
                // workgroups are detected from the host endpoint.
                ...(credentials.isServerless
                    ? {}
                    : { cluster_id: credentials.clusterIdentifier }),
                // dbt-redshift requires `user` in the profile even for
                // serverless (where it is ignored at runtime), so fall
                // back to a placeholder when none is provided.
                user: credentials.user || 'iam',
                autocreate: credentials.autoCreate || undefined,
                db_groups:
                    credentials.dbGroups && credentials.dbGroups.length > 0
                        ? credentials.dbGroups
                        : undefined,
            },
            environment: awsEnvironment,
        };
    }

    return {
        kind: 'target',
        target: {
            ...redshiftSharedTarget,
            user: envVarReference('user'),
            password: envVarReference('password'),
        },
        environment: {
            [envVar('user')]: credentials.user ?? '',
            [envVar('password')]: credentials.password ?? '',
        },
    };
};
