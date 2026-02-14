import {
    AthenaAuthenticationType,
    CreateAthenaCredentials,
    ParseError,
    WarehouseTypes,
} from '@lightdash/common';
import { JSONSchemaType } from 'ajv';
import betterAjvErrors from 'better-ajv-errors';
import { ajv } from '../../ajv';
import { Target } from '../types';

export type AthenaTarget = {
    type: 'athena';
    region_name: string;
    database: string;
    schema: string;
    s3_staging_dir: string;
    s3_data_dir?: string;
    aws_access_key_id?: string;
    aws_secret_access_key?: string;
    work_group?: string;
    threads?: number;
    num_retries?: number;
};

export const athenaSchema: JSONSchemaType<AthenaTarget> = {
    type: 'object',
    properties: {
        type: {
            type: 'string',
            enum: ['athena'],
        },
        region_name: {
            type: 'string',
        },
        database: {
            type: 'string',
        },
        schema: {
            type: 'string',
        },
        s3_staging_dir: {
            type: 'string',
        },
        s3_data_dir: {
            type: 'string',
            nullable: true,
        },
        aws_access_key_id: {
            type: 'string',
            nullable: true,
        },
        aws_secret_access_key: {
            type: 'string',
            nullable: true,
        },
        work_group: {
            type: 'string',
            nullable: true,
        },
        threads: {
            type: 'number',
            nullable: true,
        },
        num_retries: {
            type: 'number',
            nullable: true,
        },
    },
    required: ['type', 'region_name', 'database', 'schema', 's3_staging_dir'],
};

export const convertAthenaSchema = (
    target: Target,
): CreateAthenaCredentials => {
    const validate = ajv.compile<AthenaTarget>(athenaSchema);

    if (validate(target)) {
        const hasAccessKeyCredentials =
            !!target.aws_access_key_id && !!target.aws_secret_access_key;

        return {
            type: WarehouseTypes.ATHENA,
            region: target.region_name,
            database: target.database,
            schema: target.schema,
            s3StagingDir: target.s3_staging_dir,
            s3DataDir: target.s3_data_dir,
            // CLI is intentionally permissive here: when keys are absent in a dbt
            // profile, infer IAM role auth so local/CI runs can use AWS default
            // credential resolution (for example OIDC/instance/task role).
            authenticationType: hasAccessKeyCredentials
                ? AthenaAuthenticationType.ACCESS_KEY
                : AthenaAuthenticationType.IAM_ROLE,
            accessKeyId: target.aws_access_key_id,
            secretAccessKey: target.aws_secret_access_key,
            workGroup: target.work_group,
            threads: target.threads,
            numRetries: target.num_retries,
        };
    }

    const errs = betterAjvErrors(athenaSchema, target, validate.errors || []);
    throw new ParseError(
        `Couldn't read profiles.yml file for ${target.type}:\n${errs}`,
    );
};
