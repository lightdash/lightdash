import { fromIni, fromNodeProviderChain } from '@aws-sdk/credential-providers';
import {
    CreateRedshiftCredentials,
    getErrorMessage,
    ParseError,
    RedshiftAuthenticationType,
    WarehouseTypes,
} from '@lightdash/common';
import { JSONSchemaType } from 'ajv';
import betterAjvErrors from 'better-ajv-errors';
import { ajv } from '../../ajv';
import * as styles from '../../styles';
import { Target } from '../types';

export type RedshiftTarget = {
    type: 'redshift';
    host: string;
    user?: string;
    port: number;
    dbname?: string;
    database?: string;
    schema: string;
    threads?: number;
    pass?: string;
    password?: string;
    keepalives_idle?: number;
    connect_timeout?: number;
    search_path?: string;
    role?: string;
    sslmode?: string;
    method?: string;
    cluster_id?: string;
    region?: string;
    iam_profile?: string;
    autocreate?: boolean;
};

export const redshiftSchema: JSONSchemaType<RedshiftTarget> = {
    type: 'object',
    properties: {
        type: {
            type: 'string',
            enum: ['redshift'],
        },
        host: {
            type: 'string',
        },
        user: {
            type: 'string',
            nullable: true,
        },
        port: {
            type: 'integer',
        },
        dbname: {
            type: 'string',
            nullable: true,
        },
        database: {
            type: 'string',
            nullable: true,
        },
        schema: {
            type: 'string',
        },
        threads: {
            type: 'integer',
            nullable: true,
        },
        pass: {
            type: 'string',
            nullable: true,
        },
        password: {
            type: 'string',
            nullable: true,
        },
        keepalives_idle: {
            type: 'integer',
            nullable: true,
        },
        connect_timeout: {
            type: 'integer',
            nullable: true,
        },
        search_path: {
            type: 'string',
            nullable: true,
        },
        role: {
            type: 'string',
            nullable: true,
        },
        sslmode: {
            type: 'string',
            nullable: true,
        },
        method: {
            type: 'string',
            nullable: true,
        },
        cluster_id: {
            type: 'string',
            nullable: true,
        },
        region: {
            type: 'string',
            nullable: true,
        },
        iam_profile: {
            type: 'string',
            nullable: true,
        },
        autocreate: {
            type: 'boolean',
            nullable: true,
        },
    },
    required: ['type', 'host', 'port', 'schema'],
};

export const convertRedshiftSchema = async (
    target: Target,
): Promise<CreateRedshiftCredentials> => {
    const validate = ajv.compile<RedshiftTarget>(redshiftSchema);
    if (validate(target)) {
        const dbname = target.dbname || target.database;
        if (!dbname) {
            throw new ParseError(
                `Redshift target requires a database name: "database"`,
            );
        }

        // IAM authentication: dbt-redshift's connector mints temporary
        // credentials, so no password is present in the profile.
        if (target.method === 'iam') {
            if (!target.region) {
                throw new ParseError(
                    `Redshift IAM target requires a region: "region"`,
                );
            }
            // dbt-redshift resolves an AWS identity locally via boto3's
            // credential chain (env vars, a named profile via "iam_profile"
            // - including AWS SSO profiles - or an EC2/ECS/EKS role). None of
            // those local references (a profile name, an instance role) mean
            // anything on the Lightdash backend, so we resolve the chain here
            // and forward the concrete credentials it produces. For SSO or a
            // role these are short-lived session credentials, which is what a
            // "sign in with SSO, then lightdash preview" workflow wants. This
            // mirrors how the BigQuery "oauth" target resolves local ADC
            // before uploading a preview project's credentials.
            const credentialProvider = target.iam_profile
                ? fromIni({ profile: target.iam_profile })
                : fromNodeProviderChain();

            let awsCredentials: Awaited<ReturnType<typeof credentialProvider>>;
            try {
                awsCredentials = await credentialProvider();
            } catch (e) {
                const source = target.iam_profile
                    ? `AWS profile "${target.iam_profile}"`
                    : 'the default AWS credential chain (environment variables, the default profile, SSO, or an instance role)';
                throw new ParseError(
                    `Redshift IAM target ("method: iam") requires AWS credentials that "lightdash preview" can resolve locally and forward to the Lightdash backend, but none could be resolved from ${source}: ${getErrorMessage(
                        e,
                    )}. If you authenticate with AWS SSO, run "aws sso login${
                        target.iam_profile
                            ? ` --profile ${target.iam_profile}`
                            : ''
                    }" and try again, or set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY (plus AWS_SESSION_TOKEN for temporary credentials).`,
                );
            }
            const { accessKeyId, secretAccessKey, sessionToken, expiration } =
                awsCredentials;

            // SSO/role credentials are temporary. The preview project keeps
            // using these forwarded credentials to mint Redshift credentials
            // per query, so warn that queries will start failing once they
            // expire rather than letting it surface as an opaque runtime error.
            if (expiration) {
                console.warn(
                    styles.warning(
                        `Forwarding temporary AWS credentials for this Redshift IAM preview that expire at ${expiration.toISOString()}. Queries in the preview project will stop working after that - re-run "lightdash preview" (re-authenticating with AWS if needed) to refresh them.`,
                    ),
                );
            }

            // dbt-redshift represents serverless purely via the host endpoint
            // (no cluster_id); derive the workgroup from it so the connection
            // round-trips to the runtime client correctly.
            const isServerless = target.host.endsWith(
                '.redshift-serverless.amazonaws.com',
            );
            return {
                type: WarehouseTypes.REDSHIFT,
                host: target.host,
                user: target.user ?? '',
                port: target.port,
                dbname,
                schema: target.schema,
                keepalivesIdle: target.keepalives_idle,
                sslmode: target.sslmode,
                authenticationType: RedshiftAuthenticationType.IAM,
                region: target.region,
                isServerless,
                ...(isServerless
                    ? { workgroupName: target.host.split('.')[0] }
                    : { clusterIdentifier: target.cluster_id }),
                accessKeyId,
                secretAccessKey,
                ...(sessionToken ? { sessionToken } : {}),
                autoCreate: target.autocreate,
            };
        }

        const password = target.pass || target.password;
        if (!password) {
            throw new ParseError(
                `Redshift target requires a password: "password"`,
            );
        }
        if (!target.user) {
            throw new ParseError(`Redshift target requires a user: "user"`);
        }
        return {
            type: WarehouseTypes.REDSHIFT,
            host: target.host,
            user: target.user,
            password,
            port: target.port,
            dbname,
            schema: target.schema,
            keepalivesIdle: target.keepalives_idle,
            sslmode: target.sslmode,
        };
    }
    const errs = betterAjvErrors(redshiftSchema, target, validate.errors || []);
    throw new ParseError(
        `Couldn't read profiles.yml file for ${target.type}:\n${errs}`,
    );
};
