/**
 * Loader for Lightdash YAML model files (dbt-less projects).
 *
 * Ported from the CLI (packages/cli/src/lightdash/loader.ts) so the backend can
 * compile a git repo that defines its semantic layer in Lightdash YAML instead
 * of dbt. Productionisation note: this should be lifted into @lightdash/common
 * as the single source of truth shared by the CLI, the backend compile path,
 * and the AI writeback agent.
 */
import { ParseError, type LightdashModel } from '@lightdash/common';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import * as path from 'path';
import Logger from '../logging/logger';

const VALID_MODEL_TYPES = ['model', 'model/v1beta', 'model/v1'];

/**
 * Load and validate a single Lightdash YAML model file.
 */
export async function loadLightdashModel(
    filePath: string,
): Promise<LightdashModel> {
    try {
        const fileContents = await fs.promises.readFile(filePath, 'utf8');
        // JSON_SCHEMA: model files come from a cloned repo (untrusted); restrict
        // to JSON-compatible types so no YAML-specific deserialization applies.
        const parsed = yaml.load(fileContents, {
            schema: yaml.JSON_SCHEMA,
        }) as LightdashModel;

        if (!parsed.type || !parsed.name || !parsed.dimensions) {
            throw new ParseError(
                `Invalid Lightdash model in ${filePath}: must have type, name, and dimensions`,
            );
        }
        if (!parsed.sql_from) {
            throw new ParseError(
                `Invalid Lightdash model in ${filePath}: must have sql_from`,
            );
        }
        return parsed;
    } catch (error) {
        if (error instanceof ParseError) {
            throw error;
        }
        throw new ParseError(
            `Failed to load Lightdash model from ${filePath}: ${
                error instanceof Error ? error.message : String(error)
            }`,
        );
    }
}

/**
 * Whether a YAML file declares a Lightdash model (`type: model`). Checking the
 * content avoids false positives from other YAML (e.g. content-as-code spaces).
 */
async function isLightdashModelFile(filePath: string): Promise<boolean> {
    try {
        const fileContents = await fs.promises.readFile(filePath, 'utf8');
        const parsed = yaml.load(fileContents, {
            schema: yaml.JSON_SCHEMA,
        }) as { type?: string } | null;
        if (!parsed || typeof parsed !== 'object') {
            return false;
        }
        return VALID_MODEL_TYPES.includes(parsed.type ?? '');
    } catch {
        return false;
    }
}

/**
 * Find all Lightdash YAML model files under `models/` or `lightdash/models/`.
 */
export async function findLightdashModelFiles(
    projectDir: string,
): Promise<string[]> {
    const possibleDirs = [
        path.join(projectDir, 'models'),
        path.join(projectDir, 'lightdash', 'models'),
    ];
    const lightdashModelsDir = possibleDirs.find((dir) => fs.existsSync(dir));
    if (!lightdashModelsDir) {
        return [];
    }

    const yamlFiles: string[] = [];
    async function walkDir(dir: string) {
        const entries = await fs.promises.readdir(dir, { withFileTypes: true });
        for await (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                await walkDir(fullPath);
            } else if (
                entry.isFile() &&
                (entry.name.endsWith('.yml') || entry.name.endsWith('.yaml'))
            ) {
                yamlFiles.push(fullPath);
            }
        }
    }
    await walkDir(lightdashModelsDir);

    const modelFiles: string[] = [];
    for await (const filePath of yamlFiles) {
        if (await isLightdashModelFile(filePath)) {
            modelFiles.push(filePath);
        }
    }
    return modelFiles;
}

/**
 * Load all Lightdash YAML models from a project directory. Files that fail to
 * parse are skipped with a warning rather than failing the whole compile.
 */
export async function loadLightdashModels(
    projectDir: string,
): Promise<LightdashModel[]> {
    const modelFiles = await findLightdashModelFiles(projectDir);
    Logger.debug(
        `Found ${modelFiles.length} Lightdash YAML model files in ${projectDir}`,
    );

    const models: LightdashModel[] = [];
    for await (const filePath of modelFiles) {
        try {
            models.push(await loadLightdashModel(filePath));
        } catch (error) {
            Logger.warn(
                `Skipping ${filePath}: ${
                    error instanceof Error ? error.message : String(error)
                }`,
            );
        }
    }
    return models;
}
