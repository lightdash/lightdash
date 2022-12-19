import {
    DbtModelNode,
    DbtRawModelNode,
    ExploreError,
    friendlyName,
    InlineError,
    InlineErrorType,
    normaliseModelDatabase,
    ParseError,
    SupportedDbtAdapter,
} from '@lightdash/common';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { AnyValidateFunction } from 'ajv/dist/types';
import dbtManifestSchema from '../manifestv7.json';
import lightdashDbtSchema from '../schema.json';

const ajv = new Ajv({ schemas: [lightdashDbtSchema, dbtManifestSchema] });
addFormats(ajv);

const getModelValidator = () => {
    const modelValidator = ajv.getSchema<DbtRawModelNode>(
        'https://schemas.lightdash.com/dbt/manifest/v7.json#/definitions/LightdashCompiledModelNode',
    );
    if (modelValidator === undefined) {
        throw new ParseError('Could not parse Lightdash schema.');
    }
    return modelValidator;
};

const formatAjvErrors = (validator: AnyValidateFunction): string =>
    (validator.errors || [])
        .map((err) => `Field at "${err.instancePath}" ${err.message}`)
        .join('\n');

export const validateDbtModel = (
    adapterType: string,
    models: DbtRawModelNode[],
): [DbtModelNode[], ExploreError[]] => {
    const validator = getModelValidator();
    return models.reduce(
        ([validModels, invalidModels], model) => {
            let error: InlineError | undefined;
            // Match against json schema
            const isValid = validator(model);
            if (!isValid) {
                error = {
                    type: InlineErrorType.METADATA_PARSE_ERROR,
                    message: formatAjvErrors(validator),
                };
            } else if (isValid && Object.values(model.columns).length <= 0) {
                error = {
                    type: InlineErrorType.NO_DIMENSIONS_FOUND,
                    message: 'No dimensions available',
                };
            }
            if (error) {
                const exploreError: ExploreError = {
                    name: model.name,
                    label: model.meta.label || friendlyName(model.name),
                    errors: [error],
                };
                return [validModels, [...invalidModels, exploreError]];
            }
            // Fix null databases
            const validatedModel = normaliseModelDatabase(
                model,
                adapterType as SupportedDbtAdapter,
            );
            return [[...validModels, validatedModel], invalidModels];
        },
        [[] as DbtModelNode[], [] as ExploreError[]],
    );
};
