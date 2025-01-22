import Ajv from 'ajv';
import * as yaml from 'js-yaml';
import betterAjvErrors from 'better-ajv-errors';
import {
    DEFAULT_SPOTLIGHT_CONFIG,
    type LightdashProjectConfig,
} from '../types/lightdashProjectConfig';
import lightdashProjectConfigSchema from '../schemas/json/lightdash-project-config-1.0.json';
import { ParseError } from '../types/errors';

export const loadLightdashProjectConfig = async (
    yamlFileContents: string,
): Promise<LightdashProjectConfig> => {
    try {
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

        return configFile;
    } catch (e: unknown) {
        if (e instanceof Error && 'code' in e && e.code === 'ENOENT') {
            // Return default config if file doesn't exist
            return {
                spotlight: DEFAULT_SPOTLIGHT_CONFIG,
            };
        }
        throw e;
    }
};
