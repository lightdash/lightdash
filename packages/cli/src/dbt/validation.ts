import {
    DbtModelNode,
    DbtRawModelNode,
    ExploreError,
    friendlyName,
    InlineError,
    InlineErrorType,
    ManifestValidator,
    normaliseModelDatabase,
    SupportedDbtAdapter,
} from '@lightdash/common';
import GlobalState from '../globalState';
import { getDbtManifest } from './manifest';

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
    const manifestVersion = await getDbtManifest();

    GlobalState.debug(
        `> Validating models using dbt manifest version ${manifestVersion}`,
    );

    const validator = new ManifestValidator(manifestVersion);
    const results = models.reduce<DbtModelsGroupedByState>(
        (acc, model) => {
            let error: InlineError | undefined;
            // Match against json schema
            const [isValid, errorMessage] = validator.isModelValid(model);
            if (!isValid) {
                error = {
                    type: InlineErrorType.METADATA_PARSE_ERROR,
                    message: errorMessage,
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
