import Ajv, { type ValidateFunction } from 'ajv';
import fs from 'fs/promises';
import * as yaml from 'js-yaml';
import path from 'path';
import modelSchema from '../schemas/json/model-as-code-1.0.json';
import { ParseError } from '../types/errors';
import {
    type LightdashModel,
    type LightdashModelWithSource,
} from '../types/lightdashModel';

// Lazy compilation keeps importing common safe under browser CSP: Ajv
// generates code with `new Function`, which a strict policy refuses.
type ModelValidator = { ajv: Ajv; validate: ValidateFunction<LightdashModel> };
let modelValidator: ModelValidator | undefined;
const getModelValidator = (): ModelValidator => {
    if (!modelValidator) {
        const ajv = new Ajv({ allErrors: true, strict: false });
        modelValidator = {
            ajv,
            validate: ajv.compile<LightdashModel>(modelSchema),
        };
    }
    return modelValidator;
};
/** The `type` values that make a YAML file a native model. */
export const NATIVE_MODEL_TYPES = ['model', 'model/v1beta', 'model/v1'];

/** Where a native project's models live, in the order they are looked for. */
export const NATIVE_MODEL_DIRECTORIES = ['models', 'lightdash/models'];

export const isNativeModelType = (type: string): boolean =>
    NATIVE_MODEL_TYPES.includes(type);

async function readYaml(filePath: string): Promise<unknown> {
    try {
        return yaml.load(await fs.readFile(filePath, 'utf8'));
    } catch (error) {
        throw new ParseError(
            `Failed to read YAML from ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
        );
    }
}

export async function loadLightdashModel(
    filePath: string,
): Promise<LightdashModel> {
    const parsed = await readYaml(filePath);
    const { ajv, validate } = getModelValidator();
    if (!validate(parsed)) {
        throw new ParseError(
            `Invalid Lightdash model in ${filePath}: ${ajv.errorsText(validate.errors)}`,
        );
    }
    return parsed;
}

export async function findLightdashModelFiles(
    projectDir: string,
): Promise<string[]> {
    const possibleDirs = NATIVE_MODEL_DIRECTORIES.map((dir) =>
        path.join(projectDir, dir),
    );
    let modelsDir: string | undefined;
    for await (const dir of possibleDirs) {
        try {
            if ((await fs.stat(dir)).isDirectory()) {
                modelsDir = dir;
                break;
            }
        } catch (error) {
            if (
                !(
                    error instanceof Error &&
                    'code' in error &&
                    error.code === 'ENOENT'
                )
            )
                throw error;
        }
    }
    if (!modelsDir) return [];

    const relativeModelsDir = path.relative(
        await fs.realpath(projectDir),
        await fs.realpath(modelsDir),
    );
    if (
        relativeModelsDir === '..' ||
        relativeModelsDir.startsWith(`..${path.sep}`) ||
        path.isAbsolute(relativeModelsDir)
    ) {
        throw new ParseError(
            'Native models directory must stay within the project directory',
        );
    }

    const files: string[] = [];
    async function walk(dir: string): Promise<void> {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        entries.sort((a, b) => a.name.localeCompare(b.name));
        for await (const entry of entries) {
            const filePath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                await walk(filePath);
            } else if (entry.isFile() && /\.ya?ml$/.test(entry.name)) {
                const parsed = await readYaml(filePath);
                if (
                    parsed &&
                    typeof parsed === 'object' &&
                    'type' in parsed &&
                    typeof parsed.type === 'string' &&
                    isNativeModelType(parsed.type)
                )
                    files.push(filePath);
            }
        }
    }
    await walk(modelsDir);
    return files;
}

export async function loadLightdashModels(
    projectDir: string,
): Promise<LightdashModelWithSource[]> {
    const files = await findLightdashModelFiles(projectDir);
    const models: LightdashModelWithSource[] = [];
    const names = new Map<string, string>();
    for await (const filePath of files) {
        const model = await loadLightdashModel(filePath);
        const sourcePath = path
            .relative(projectDir, filePath)
            .split(path.sep)
            .join('/');
        const previousPath = names.get(model.name);
        if (previousPath !== undefined)
            throw new ParseError(
                `Duplicate Lightdash model "${model.name}" in ${previousPath} and ${sourcePath}`,
            );
        names.set(model.name, sourcePath);
        models.push({ ...model, sourcePath });
    }
    return models;
}
