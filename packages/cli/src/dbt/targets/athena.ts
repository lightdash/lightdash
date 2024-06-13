import {
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
    database: string;
    schema: string;
    aws_access_key_id: string;
    aws_secret_access_key: string;
    s3_staging_dir: string;
    region_name: string;
    catalog: string;
    work_group: string;
};

export const athenaSchema: JSONSchemaType<AthenaTarget> = {
    type: 'object',
    properties: {
        type: {
            type: 'string',
            enum: ['athena'],
        },
        schema: {
            type: 'string',
        },
        s3_staging_dir: {
            type: 'string',
        },
        region_name: {
            type: 'string',
        },
        aws_access_key_id: {
            type: 'string',
        },
        aws_secret_access_key: {
            type: 'string',
        },
        database: {
            type: 'string',
        },
        catalog: {
            type: 'string',
        },
        work_group: {
            type: 'string',
            nullable: true,
        },
    },
    required: ['type', 'schema', 's3_staging_dir', 'region_name'],
};

export const convertAthenaSchema = (
    target: Target,
): CreateAthenaCredentials => {
    const validate = ajv.compile<AthenaTarget>(athenaSchema);

    if (validate(target)) {
        return {
            type: WarehouseTypes.ATHENA,
            schema: target.schema,
            database: target.database,
            outputLocation: target.s3_staging_dir,
            workgroup: target.work_group,
            awsAccessKeyId: target.aws_access_key_id,
            awsRegion: target.region_name,
            awsSecretKey: target.aws_secret_access_key,
        };
    }

    const errs = betterAjvErrors(athenaSchema, target, validate.errors || []);
    throw new ParseError(
        `Couldn't read profiles.yml file for ${target.type}:\n${errs}`,
    );
};
