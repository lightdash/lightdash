/**
 * Loader for Lightdash YAML model files
 */

import { ParseError, type LightdashModel } from '@lightdash/common';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import * as path from 'path';
import GlobalState from '../globalState';

/**
 * Load a single Lightdash YAML model file
 */
export async function loadLightdashModel(
    filePath: string,
): Promise<LightdashModel> {
    try {
        const fileContents = await fs.promises.readFile(filePath, 'utf8');
        const parsed = yaml.load(fileContents) as LightdashModel;

        // Basic validation
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
 * Find all Lightdash YAML model files in a directory
 * Looks for files in the lightdash/models directory
 */
export async function findLightdashModelFiles(
    projectDir: string,
): Promise<string[]> {
    const lightdashModelsDir = path.join(projectDir, 'lightdash', 'models');

    if (!fs.existsSync(lightdashModelsDir)) {
        GlobalState.debug(
            `No lightdash/models directory found at ${lightdashModelsDir}`,
        );
        return [];
    }

    const files: string[] = [];

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
                files.push(fullPath);
            }
        }
    }

    await walkDir(lightdashModelsDir);
    return files;
}

/**
 * Load all Lightdash YAML models from a project directory
 */
export async function loadLightdashModels(
    projectDir: string,
): Promise<LightdashModel[]> {
    const modelFiles = await findLightdashModelFiles(projectDir);

    GlobalState.debug(
        `Found ${modelFiles.length} Lightdash model files in ${projectDir}`,
    );

    const models: LightdashModel[] = [];

    for await (const filePath of modelFiles) {
        try {
            const model = await loadLightdashModel(filePath);
            models.push(model);
            GlobalState.debug(`Loaded Lightdash model: ${model.name}`);
        } catch (error) {
            console.error(
                `Warning: Failed to load ${filePath}: ${
                    error instanceof Error ? error.message : String(error)
                }`,
            );
        }
    }

    return models;
}
