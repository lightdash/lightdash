import Ajv from 'ajv';
import AjvErrors from 'ajv-errors';
import betterAjvErrors from 'better-ajv-errors';
import * as yaml from 'js-yaml';
import { validateParameterNames } from '../compiler/parameters';
import lightdashProjectConfigSchema from '../schemas/json/lightdash-project-config-1.0.json';
import { LightdashProjectConfigError, ParseError } from '../types/errors';
import {
    DEFAULT_SPOTLIGHT_CONFIG,
    type LightdashProjectConfig,
} from '../types/lightdashProjectConfig';

const defaultConfig: LightdashProjectConfig = {
    spotlight: DEFAULT_SPOTLIGHT_CONFIG,
};
export const loadLightdashProjectConfig = async (
    yamlFileContents: string,
    onLoaded?: (config: LightdashProjectConfig) => Promise<void>,
): Promise<LightdashProjectConfig> => {
    if (yamlFileContents.trim() === '') {
        return defaultConfig;
    }
    // Type assertion for the loaded YAML config
    const loadedConfig = yaml.load(
        yamlFileContents,
    ) as Partial<LightdashProjectConfig>;
    // Merge the loaded config with the default config
    const configFile: LightdashProjectConfig = {
        ...defaultConfig,
        ...loadedConfig,
    };
    const ajv = new Ajv({
        coerceTypes: true,
        allErrors: true,
        allowUnionTypes: true,
    });
    // This method call extends JSON schema to utilize AJV Errors
    AjvErrors(ajv);
    const validate = ajv.compile<LightdashProjectConfig>(
        lightdashProjectConfigSchema,
    );

    if (!validate(configFile)) {
        const errors = betterAjvErrors(
            lightdashProjectConfigSchema,
            configFile,
            validate.errors || [],
            { indent: 2 },
        );
        throw new ParseError(
            `Invalid lightdash.config.yml with errors:\n${errors}`,
        );
    }

    if (configFile.parameters == null) {
        configFile.parameters = undefined;
    }

    const { isInvalid: hasInvalidParameterNames, invalidParameters } =
        validateParameterNames(configFile.parameters);

    if (hasInvalidParameterNames) {
        throw new LightdashProjectConfigError(
            `Invalid lightdash.config.yml with invalid parameter names: ${invalidParameters.join(
                ', ',
            )}`,
            {
                invalidParameters,
            },
        );
    }

    if (onLoaded) {
        await onLoaded(configFile);
    }

    return configFile;
};
