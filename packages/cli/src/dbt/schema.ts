import { lightdashDbtYamlSchema } from '@lightdash/common';
import betterAjvErrors from 'better-ajv-errors';
import { promises as fs } from 'fs';
import * as yaml from 'js-yaml';
import { ajv } from './ajv';

type YamlColumn = {
    name: string;
    description?: string;
};

type YamlModel = {
    name: string;
    description?: string;
    columns?: YamlColumn[];
};

export type YamlSchema = {
    version: 2;
    models?: YamlModel[];
};

export const loadYamlSchema = async (path: string): Promise<YamlSchema> => {
    const schemaFile = yaml.load(await fs.readFile(path, 'utf8'));
    const validate = ajv.compile<YamlSchema>(lightdashDbtYamlSchema);
    if (!validate(schemaFile)) {
        const errors = betterAjvErrors(
            lightdashDbtYamlSchema,
            schemaFile,
            validate.errors || [],
        );
        throw new Error(
            `Couldn't parse existing yaml file at ${path}:\n  ${errors}`,
        );
    }
    return schemaFile;
};
