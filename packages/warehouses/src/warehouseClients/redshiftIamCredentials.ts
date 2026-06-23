import {
    GetClusterCredentialsCommand,
    RedshiftClient,
    type RedshiftClientConfig,
} from '@aws-sdk/client-redshift';
import {
    GetCredentialsCommand,
    RedshiftServerlessClient,
} from '@aws-sdk/client-redshift-serverless';
import { fromTemporaryCredentials } from '@aws-sdk/credential-providers';
import {
    CreateRedshiftCredentials,
    getErrorMessage,
    WarehouseConnectionError,
} from '@lightdash/common';

// Temporary AWS credentials are valid for at most 1 hour for provisioned
// clusters. We request the max so a single warehouse client can run a long
// session without re-minting.
const CREDENTIALS_DURATION_SECONDS = 3600;

const ROLE_SESSION_NAME = 'lightdash-redshift-session';

export type RedshiftIamDbCredentials = {
    dbUser: string;
    dbPassword: string;
    expiration: Date | undefined;
};

type AwsCredentialsConfig = RedshiftClientConfig['credentials'];

/**
 * Build the AWS identity used to call the Redshift credential APIs.
 * Precedence: explicit session credentials → assume-role layered over static
 * keys (or the default chain) → static keys → ambient default chain.
 *
 * Returning `undefined` lets the AWS SDK fall back to its default credential
 * chain (instance role / IRSA / env) — only meaningful for self-hosted
 * deployments whose host has an attached AWS role.
 */
export const getRedshiftAwsCredentials = (
    credentials: CreateRedshiftCredentials,
): AwsCredentialsConfig => {
    const {
        accessKeyId,
        secretAccessKey,
        sessionToken,
        assumeRoleArn,
        assumeRoleExternalId,
    } = credentials;

    const staticCredentials =
        accessKeyId && secretAccessKey
            ? {
                  accessKeyId,
                  secretAccessKey,
                  sessionToken: sessionToken || undefined,
              }
            : undefined;

    // A pre-resolved session token means the role was already assumed
    // upstream — use the temporary credentials directly, do not re-assume.
    if (assumeRoleArn && !sessionToken) {
        return fromTemporaryCredentials({
            masterCredentials: staticCredentials,
            params: {
                RoleArn: assumeRoleArn,
                RoleSessionName: ROLE_SESSION_NAME,
                ExternalId: assumeRoleExternalId || undefined,
            },
        });
    }

    return staticCredentials;
};

/**
 * Mint a short-lived Redshift database user + password from AWS IAM, for either
 * a provisioned cluster (GetClusterCredentials) or a serverless workgroup
 * (GetCredentials). The returned credentials are used with the normal pg
 * driver to connect.
 */
export const mintRedshiftIamCredentials = async (
    credentials: CreateRedshiftCredentials,
): Promise<RedshiftIamDbCredentials> => {
    if (!credentials.region) {
        throw new WarehouseConnectionError(
            'Redshift IAM authentication requires an AWS region',
        );
    }

    const awsCredentials = getRedshiftAwsCredentials(credentials);

    try {
        if (credentials.isServerless) {
            if (!credentials.workgroupName) {
                throw new WarehouseConnectionError(
                    'Redshift serverless IAM authentication requires a workgroup name',
                );
            }
            const client = new RedshiftServerlessClient({
                region: credentials.region,
                credentials: awsCredentials,
            });
            const response = await client.send(
                new GetCredentialsCommand({
                    workgroupName: credentials.workgroupName,
                    dbName: credentials.dbname,
                    durationSeconds: CREDENTIALS_DURATION_SECONDS,
                }),
            );
            if (!response.dbUser || !response.dbPassword) {
                throw new WarehouseConnectionError(
                    'Redshift serverless did not return temporary credentials',
                );
            }
            return {
                dbUser: response.dbUser,
                dbPassword: response.dbPassword,
                expiration: response.expiration,
            };
        }

        if (!credentials.clusterIdentifier) {
            throw new WarehouseConnectionError(
                'Redshift IAM authentication requires a cluster identifier',
            );
        }
        if (!credentials.user) {
            throw new WarehouseConnectionError(
                'Redshift IAM authentication requires a database user',
            );
        }
        const client = new RedshiftClient({
            region: credentials.region,
            credentials: awsCredentials,
        });
        const response = await client.send(
            new GetClusterCredentialsCommand({
                ClusterIdentifier: credentials.clusterIdentifier,
                DbUser: credentials.user,
                DbName: credentials.dbname,
                DurationSeconds: CREDENTIALS_DURATION_SECONDS,
                AutoCreate: credentials.autoCreate ?? false,
                DbGroups:
                    credentials.dbGroups && credentials.dbGroups.length > 0
                        ? credentials.dbGroups
                        : undefined,
            }),
        );
        if (!response.DbUser || !response.DbPassword) {
            throw new WarehouseConnectionError(
                'Redshift did not return temporary credentials',
            );
        }
        return {
            dbUser: response.DbUser,
            dbPassword: response.DbPassword,
            expiration: response.Expiration,
        };
    } catch (e) {
        if (e instanceof WarehouseConnectionError) {
            throw e;
        }
        throw new WarehouseConnectionError(
            `Failed to mint Redshift IAM credentials: ${getErrorMessage(e)}`,
        );
    }
};
