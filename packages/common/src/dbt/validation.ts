import Ajv, { ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import { AnyValidateFunction } from 'ajv/dist/types';
import {
    DbtManifestVersion,
    DbtMetric,
    DbtModelNode,
    DbtRawModelNode,
} from '../types/dbt';
import { ParseError, UnexpectedServerError } from '../types/errors';
import assertUnreachable from '../utils/assertUnreachable';
import lightdashMetadataSchema from './schemas/lightdashMetadata.json';
import dbtManifestSchemaV8 from './schemas/manifestV8.json';
import dbtManifestSchemaV9 from './schemas/manifestV9.json';

const LightdashMetadataSchemaRef =
    'https://schemas.lightdash.com/dbt/manifest.json';

const getDbtManifestWithLightdashMetadata = (dbtSchemaRef: string) => ({
    definitions: {
        LightdashNodeConfig: {
            allOf: [
                {
                    $ref: `${dbtSchemaRef}#/definitions/NodeConfig`,
                },
                {
                    type: 'object',
                    properties: {
                        meta: {
                            $ref: '#/definitions/LightdashModelMetadata',
                        },
                    },
                },
            ],
        },
        LightdashColumnInfo: {
            allOf: [
                {
                    $ref: `${dbtSchemaRef}#/definitions/ColumnInfo`,
                },
                {
                    type: 'object',
                    properties: {
                        meta: {
                            $ref: '#/definitions/LightdashColumnMetadata',
                        },
                    },
                },
            ],
        },
        LightdashCompiledModelNode: {
            allOf: [
                {
                    $ref: `${dbtSchemaRef}#/definitions/ModelNode`,
                },
                {
                    type: 'object',
                    properties: {
                        meta: {
                            $ref: '#/definitions/LightdashModelMetadata',
                        },
                        config: {
                            $ref: '#/definitions/LightdashNodeConfig',
                        },
                    },
                },
            ],
        },
    },
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: LightdashMetadataSchemaRef,
});

const getValidatorDefinition = (manifestVersion: DbtManifestVersion) => {
    let dbtManifestSchema;
    switch (manifestVersion) {
        case DbtManifestVersion.V8:
            dbtManifestSchema = dbtManifestSchemaV8;
            break;
        case DbtManifestVersion.V9:
            dbtManifestSchema = dbtManifestSchemaV9;
            break;
        default:
            return assertUnreachable(
                manifestVersion,
                new UnexpectedServerError(
                    `Missing dbt manifest version "${manifestVersion}" in validation.`,
                ),
            );
    }

    const ajv = new Ajv({
        schemas: [
            getDbtManifestWithLightdashMetadata(dbtManifestSchema.$id),
            lightdashMetadataSchema,
            dbtManifestSchema,
        ],
    });

    addFormats(ajv);

    return ajv;
};

const getValidator = <T>(ajv: Ajv, schemaRef: string) => {
    const validator = ajv.getSchema<T>(schemaRef);
    if (validator === undefined) {
        throw new ParseError(
            `Could not find schema with reference: ${schemaRef}`,
        );
    }
    return validator;
};

const formatAjvErrors = (validator: AnyValidateFunction): string =>
    (validator.errors || [])
        .map((err) => `Field at "${err.instancePath}" ${err.message}`)
        .join('\n');

export class ManifestValidator {
    private readonly dbtMetricValidator: ValidateFunction<DbtMetric>;

    private readonly modelValidator: ValidateFunction<DbtModelNode>;

    constructor(manifestVersion: DbtManifestVersion) {
        const ajv = getValidatorDefinition(manifestVersion);
        this.dbtMetricValidator = getValidator<DbtMetric>(
            ajv,
            `${LightdashMetadataSchemaRef}#/definitions/LightdashMetric`,
        );

        this.modelValidator = getValidator<DbtModelNode>(
            ajv,
            `${LightdashMetadataSchemaRef}#/definitions/LightdashCompiledModelNode`,
        );
    }

    static isValid = (
        validator: ValidateFunction<any>,
        data: any,
    ): [true, undefined] | [false, string] => {
        const isValid = validator(data);
        if (!isValid) {
            return [false, formatAjvErrors(validator)];
        }
        return [true, undefined];
    };

    isModelValid = (
        model: DbtRawModelNode,
    ): [true, undefined] | [false, string] =>
        ManifestValidator.isValid(this.modelValidator, model);

    isDbtMetricValid = (
        metric: DbtMetric,
    ): [true, undefined] | [false, string] =>
        ManifestValidator.isValid(this.dbtMetricValidator, metric);
}
