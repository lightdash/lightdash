import {
    assertUnreachable,
    DbtManifestVersion,
    DbtModelNode,
    DbtRawModelNode,
    ExploreError,
    friendlyName,
    InlineError,
    InlineErrorType,
    normaliseModelDatabase,
    ParseError,
    SupportedDbtAdapter,
    UnexpectedServerError,
} from '@lightdash/common';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { AnyValidateFunction } from 'ajv/dist/types';
import GlobalState from '../globalState';
import dbtManifestSchemaV8 from '../manifestv8.json';
import dbtManifestSchemaV9 from '../manifestv9.json';
import lightdashDbtSchemaV8 from '../schema.json';
import lightdashDbtSchemaV9 from '../schemav9.json';
import { getDbtManifest } from './manifest';

const getModelValidator = async () => {
    const manifestVersion = await getDbtManifest();

    GlobalState.debug(
        `> Validating models using dbt manifest version ${manifestVersion}`,
    );
    let ajv: Ajv;

    switch (manifestVersion) {
        case DbtManifestVersion.V8:
            ajv = new Ajv({
                schemas: [lightdashDbtSchemaV8, dbtManifestSchemaV8],
            });
            break;
        case DbtManifestVersion.V9:
            ajv = new Ajv({
                schemas: [lightdashDbtSchemaV9, dbtManifestSchemaV9],
            });
            break;
        default:
            return assertUnreachable(
                manifestVersion,
                new UnexpectedServerError(
                    `Missing dbt manifest version "${manifestVersion}" in validation.`,
                ),
            );
    }
    addFormats(ajv);

    const modelValidator = ajv.getSchema<DbtRawModelNode>(
        `https://schemas.lightdash.com/dbt/manifest/${manifestVersion}.json#/definitions/LightdashCompiledModelNode`,
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

type DbtModelsGroupedByState = {
    valid: DbtModelNode[];
    invalid: ExploreError[];
    skipped: DbtRawModelNode[];
};
export const validateDbtModel = async (
    adapterType: string,
    models: DbtRawModelNode[],
): Promise<DbtModelsGroupedByState> => {
    GlobalState.debug(`> Validating ${models.length} models from dbt manifest`);
    const validator = await getModelValidator();
    const results = models.reduce<DbtModelsGroupedByState>(
        (acc, model) => {
            if (model.compiled === undefined) {
                return { ...acc, skipped: [...acc.skipped, model] };
            }

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
                return { ...acc, invalid: [...acc.invalid, exploreError] };
            }
            // Fix null databases
            const validatedModel = normaliseModelDatabase(
                model,
                adapterType as SupportedDbtAdapter,
            );
            return { ...acc, valid: [...acc.valid, validatedModel] };
        },
        { valid: [], invalid: [], skipped: [] },
    );
    if (results.valid.length > 0) {
        GlobalState.debug(
            `> Valid compiled models (${results.valid.length}): ${results.valid
                .map((m) => m.name)
                .join(', ')}`,
        );
    }
    if (results.skipped.length > 0) {
        GlobalState.debug(
            `> Skipped models (${results.skipped.length}): ${results.skipped
                .map((m) => m.name)
                .join(', ')}`,
        );
    }
    if (results.invalid.length > 0) {
        GlobalState.debug(
            `> Invalid compiled models (${
                results.invalid.length
            }): ${results.invalid.map((m) => m.name).join(', ')}`,
        );
    }

    return results;
};
