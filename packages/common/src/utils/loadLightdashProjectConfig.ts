import Ajv from 'ajv';
import betterAjvErrors from 'better-ajv-errors';
import * as yaml from 'js-yaml';
import lightdashProjectConfigSchema from '../schemas/json/lightdash-project-config-1.0.json';
import { ParseError } from '../types/errors';
import {
    DEFAULT_SPOTLIGHT_CONFIG,
    type LightdashProjectConfig,
} from '../types/lightdashProjectConfig';

export const loadLightdashProjectConfig = async (
    yamlFileContents: string,
    onLoaded?: (config: LightdashProjectConfig) => Promise<void>,
): Promise<LightdashProjectConfig> => {
    if (yamlFileContents.trim() === '') {
        return {
            spotlight: DEFAULT_SPOTLIGHT_CONFIG,
        };
    }
    const configFile = yaml.load(yamlFileContents);
    const ajv = new Ajv({ coerceTypes: true });
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

    if (onLoaded) {
        await onLoaded(configFile);
    }

    return configFile;
};
