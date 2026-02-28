import { type ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import Ajv2020 from 'ajv/dist/2020';
import draft7MetaSchema from 'ajv/dist/refs/json-schema-draft-07.json';
import { type AnyValidateFunction } from 'ajv/dist/types';
import { type AnyType } from '../types/any';
import {
    type DbtManifestVersion,
    type DbtMetric,
    type DbtModelNode,
    type DbtRawModelNode,
} from '../types/dbt';
import { ParseError } from '../types/errors';
import lightdashMetadataSchema from './schemas/lightdashMetadata.json';
import lightdashSchemaV7 from './schemas/lightdashV7.json';
import lightdashSchemaV8 from './schemas/lightdashV8.json';
import lightdashSchemaV9 from './schemas/lightdashV9.json';
import lightdashSchemaV10 from './schemas/lightdashV10.json';
import lightdashSchemaV11 from './schemas/lightdashV11.json';
import lightdashSchemaV12 from './schemas/lightdashV12.json';
import lightdashSchemaV20 from './schemas/lightdashV20.json';
import dbtManifestSchemaV7 from './schemas/manifestV7.json';
import dbtManifestSchemaV8 from './schemas/manifestV8.json';
import dbtManifestSchemaV9 from './schemas/manifestV9.json';
import dbtManifestSchemaV10 from './schemas/manifestV10.json';
import dbtManifestSchemaV11 from './schemas/manifestV11.json';
import dbtManifestSchemaV12 from './schemas/manifestV12.json';
import dbtManifestSchemaV20 from './schemas/manifestV20.json';

const ajv = new Ajv2020();
ajv.addMetaSchema(draft7MetaSchema); // add backward compatibility with draft-07
ajv.addSchema([
    dbtManifestSchemaV7,
    dbtManifestSchemaV8,
    dbtManifestSchemaV9,
    dbtManifestSchemaV10,
    dbtManifestSchemaV11,
    dbtManifestSchemaV12,
    dbtManifestSchemaV20,
    lightdashMetadataSchema,
    lightdashSchemaV7,
    lightdashSchemaV8,
    lightdashSchemaV9,
    lightdashSchemaV10,
    lightdashSchemaV11,
    lightdashSchemaV12,
    lightdashSchemaV20,
]);
addFormats(ajv);

export class ManifestValidator {
    private readonly lightdashSchemaId: string;

    private readonly dbtSchemaId: string;

    constructor(manifestVersion: DbtManifestVersion) {
        this.lightdashSchemaId = `https://schemas.lightdash.com/lightdash/${manifestVersion}.json`;
        this.dbtSchemaId = `https://schemas.getdbt.com/dbt/manifest/${manifestVersion}.json`;
    }

    static isValid = (
        validator: ValidateFunction<AnyType>,
        data: AnyType,
    ): [true, undefined] | [false, string] => {
        const isValid = validator(data);
        if (!isValid) {
            return [false, ManifestValidator.formatAjvErrors(validator)];
        }
        return [true, undefined];
    };

    static formatAjvErrors = (validator: AnyValidateFunction): string =>
        (validator.errors || [])
            .map((err) => {
                const baseMessage = `Field at "${err.instancePath}" ${err.message}`;

                // Add helpful hints for common YAML indentation errors
                if (err.message === 'must be object') {
                    if (err.instancePath.includes('/metrics')) {
                        return `${baseMessage}\n  Hint: This error often occurs due to incorrect YAML indentation. Ensure metric definitions are properly indented under the 'metrics:' key.\n  Example:\n    metrics:\n      my_metric:  # <-- Must be indented under 'metrics:'\n        type: count\n        sql: \${TABLE}.id`;
                    }
                    if (err.instancePath.includes('/additional_dimensions')) {
                        return `${baseMessage}\n  Hint: This error often occurs due to incorrect YAML indentation. Ensure dimension definitions are properly indented under the 'additional_dimensions:' key.\n  Example:\n    additional_dimensions:\n      my_dimension:  # <-- Must be indented under 'additional_dimensions:'\n        type: string\n        sql: \${TABLE}.custom_field`;
                    }
                }

                return baseMessage;
            })
            .join('\n');

    static getValidator = <T>(schemaRef: string) => {
        const validator = ajv.getSchema<T>(schemaRef);
        if (validator === undefined) {
            throw new ParseError(
                `Could not find schema with reference: ${schemaRef}`,
            );
        }
        return validator;
    };

    isModelValid = (
        model: DbtRawModelNode,
    ): [true, undefined] | [false, string] => {
        const validator = ManifestValidator.getValidator<DbtModelNode>(
            `${this.lightdashSchemaId}#/definitions/LightdashCompiledModelNode`,
        );
        return ManifestValidator.isValid(validator, model);
    };

    isDbtMetricValid = (
        metric: DbtMetric,
    ): [true, undefined] | [false, string] => {
        const validator = ManifestValidator.getValidator<DbtMetric>(
            `${this.dbtSchemaId}#/definitions/Metric`,
        );
        return ManifestValidator.isValid(validator, metric);
    };
}
