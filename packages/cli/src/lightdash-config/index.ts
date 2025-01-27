import {
    DEFAULT_SPOTLIGHT_CONFIG,
    LightdashProjectConfig,
    lightdashProjectConfigSchema,
    ParseError,
} from '@lightdash/common';
import betterAjvErrors from 'better-ajv-errors';
import { promises as fs } from 'fs';
import * as yaml from 'js-yaml';
import { ajv } from '../ajv';

export const loadLightdashProjectConfig = async (
    configPath: string,
): Promise<LightdashProjectConfig> => {
    try {
        const configFile = yaml.load(await fs.readFile(configPath, 'utf8'));
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
                `Invalid lightdash.config.yml at ${configPath}\n${errors}`,
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
