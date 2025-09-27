import {
    DbtSchemaEditor,
    DimensionType,
    ParseError,
    SupportedDbtVersions,
} from '@lightdash/common';
import { promises as fs } from 'fs';

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
    version?: 2;
    models?: YamlModel[];
};

const loadYamlSchema = async (
    path: string,
    dbtVersion?: SupportedDbtVersions,
): Promise<DbtSchemaEditor> => {
    try {
        return new DbtSchemaEditor(
            await fs.readFile(path, 'utf8'),
            path,
            dbtVersion,
        );
    } catch (e) {
        if (e instanceof ParseError) {
            // Prefix error message with file path
            throw new ParseError(
                `Couldn't parse existing yaml file at ${path}\n${e.message}`,
            );
        }
        throw e;
    }
};

type FindModelInYamlArgs = {
    filename: string;
    modelName: string;
    dbtVersion?: SupportedDbtVersions;
};
const findModelInYaml = async ({
    filename,
    modelName,
    dbtVersion,
}: FindModelInYamlArgs) => {
    try {
        const schemaEditor = await loadYamlSchema(filename, dbtVersion);

        if (schemaEditor.findModelByName(modelName)) {
            return schemaEditor;
        }
        return undefined;
    } catch (e: unknown) {
        if (e instanceof Error && 'code' in e && e.code === 'ENOENT') {
            return undefined;
        }
        throw e;
    }
};

type SearchForModelArgs = {
    modelName: string;
    filenames: string[];
    dbtVersion?: SupportedDbtVersions;
};
export const searchForModel = async ({
    modelName,
    filenames,
    dbtVersion,
}: SearchForModelArgs) => {
    for await (const filename of filenames) {
        const schemaEditor = await findModelInYaml({
            filename,
            modelName,
            dbtVersion,
        });
        if (schemaEditor) {
            return {
                schemaEditor,
                filename,
            };
        }
    }
    return undefined;
};
