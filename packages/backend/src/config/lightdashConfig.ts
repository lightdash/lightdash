import { ParseError } from '@lightdash/common';
import * as fs from 'fs';
import yaml from 'js-yaml';
import { parseConfig } from './parseConfig';

const loadRawConfig = (): any => {
    const path = process.env.LIGHTDASH_CONFIG_FILE;
    if (path === undefined) {
        throw new ParseError(
            'Must specify environment variable LIGHTDASH_CONFIG_FILE with a path to your lightdash.yml file',
            {},
        );
    }
    try {
        return yaml.load(fs.readFileSync(path, 'utf-8'));
    } catch (e: any) {
        throw new ParseError(`Failed to read config file at ${path}: ${e}`, {});
    }
};

export const lightdashConfig = parseConfig(loadRawConfig());
