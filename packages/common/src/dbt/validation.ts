import Ajv, { type ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import { type AnyValidateFunction } from 'ajv/dist/types';
import {
    type DbtManifestVersion,
    type DbtMetric,
    type DbtModelNode,
    type DbtRawModelNode,
} from '../types/dbt';
import { ParseError } from '../types/errors';
import lightdashMetadataSchema from './schemas/lightdashMetadata.json';
import lightdashSchemaV10 from './schemas/lightdashV10.json';
import lightdashSchemaV11 from './schemas/lightdashV11.json';
import lightdashSchemaV7 from './schemas/lightdashV7.json';
import lightdashSchemaV8 from './schemas/lightdashV8.json';
import lightdashSchemaV9 from './schemas/lightdashV9.json';
import dbtManifestSchemaV10 from './schemas/manifestV10.json';
import dbtManifestSchemaV11 from './schemas/manifestV11.json';
import dbtManifestSchemaV7 from './schemas/manifestV7.json';
import dbtManifestSchemaV8 from './schemas/manifestV8.json';
import dbtManifestSchemaV9 from './schemas/manifestV9.json';

const ajv = new Ajv({
    schemas: [
        dbtManifestSchemaV7,
        dbtManifestSchemaV8,
        dbtManifestSchemaV9,
        dbtManifestSchemaV10,
        dbtManifestSchemaV11,
        lightdashMetadataSchema,
        lightdashSchemaV7,
        lightdashSchemaV8,
        lightdashSchemaV9,
        lightdashSchemaV10,
        lightdashSchemaV11,
    ],
});

addFormats(ajv);

export class ManifestValidator {
    private readonly lightdashSchemaId: string;

    private readonly dbtSchemaId: string;

    constructor(manifestVersion: DbtManifestVersion) {
        this.lightdashSchemaId = `https://schemas.lightdash.com/lightdash/${manifestVersion}.json`;
        this.dbtSchemaId = `https://schemas.getdbt.com/dbt/manifest/${manifestVersion}.json`;
    }

    static isValid = (
        validator: ValidateFunction<any>,
        data: any,
    ): [true, undefined] | [false, string] => {
        const isValid = validator(data);
        if (!isValid) {
            return [false, ManifestValidator.formatAjvErrors(validator)];
        }
        return [true, undefined];
    };

    static formatAjvErrors = (validator: AnyValidateFunction): string =>
        (validator.errors || [])
            .map((err) => `Field at "${err.instancePath}" ${err.message}`)
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
