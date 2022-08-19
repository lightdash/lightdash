import {
    DimensionType,
    lightdashDbtYamlSchema,
    ParseError,
} from '@lightdash/common';
import betterAjvErrors from 'better-ajv-errors';
import { promises as fs } from 'fs';
import * as yaml from 'js-yaml';
import { ajv } from '../ajv';

type YamlColumnMeta = {
    dimension?: {
        type?: DimensionType;
    };
};

type YamlColumn = {
    name: string;
    description?: string;
    meta?: YamlColumnMeta;
};

export type YamlModel = {
    name: string;
    description?: string;
    columns?: YamlColumn[];
};

export type YamlSchema = {
    version: 2;
    models?: YamlModel[];
};

const loadYamlSchema = async (path: string): Promise<YamlSchema> => {
    const schemaFile = yaml.load(await fs.readFile(path, 'utf8'));
    const validate = ajv.compile<YamlSchema>(lightdashDbtYamlSchema);
    if (!validate(schemaFile)) {
        const errors = betterAjvErrors(
            lightdashDbtYamlSchema,
            schemaFile,
            validate.errors || [],
            { indent: 2 },
        );
        throw new ParseError(
            `Couldn't parse existing yaml file at ${path}\n${errors}`,
        );
    }
    return schemaFile;
};

type FindModelInYamlArgs = {
    filename: string;
    modelName: string;
};
const findModelInYaml = async ({
    filename,
    modelName,
}: FindModelInYamlArgs) => {
    try {
        const existingYaml = await loadYamlSchema(filename);
        const models = existingYaml.models || [];
        const modelIndex = models.findIndex(
            (model) => model.name === modelName,
        );
        if (modelIndex < 0) {
            return undefined;
        }
        return {
            doc: existingYaml as YamlSchema &
                Required<Pick<YamlSchema, 'models'>>,
            modelIndex,
        };
    } catch (e) {
        if (e.code === 'ENOENT') {
            return undefined;
        }
        throw e;
    }
};

type SearchForModelArgs = {
    modelName: string;
    filenames: string[];
};
export const searchForModel = async ({
    modelName,
    filenames,
}: SearchForModelArgs) => {
    for await (const filename of filenames) {
        const results = await findModelInYaml({ filename, modelName });
        if (results) {
            return {
                ...results,
                filename,
            };
        }
    }
    return undefined;
};
