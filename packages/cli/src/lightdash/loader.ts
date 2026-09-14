import { type LightdashModelWithSource } from '@lightdash/common';
import { loadLightdashModels as loadNativeLightdashModels } from '@lightdash/common/lightdash/loader';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import * as path from 'path';
import GlobalState from '../globalState';

export { loadLightdashModel } from '@lightdash/common/lightdash/loader';

// Format detection must tolerate files that dbt may ignore or handle itself.
async function isLightdashModelFile(filePath: string): Promise<boolean> {
    try {
        const fileContents = await fs.promises.readFile(filePath, 'utf8');
        const parsed = yaml.load(fileContents) as { type?: string } | null;

        if (!parsed || typeof parsed !== 'object') {
            return false;
        }

        // Check for valid model type values
        const validModelTypes = ['model', 'model/v1beta', 'model/v1'];
        return validModelTypes.includes(parsed.type ?? '');
    } catch {
        return false;
    }
}

/**
 * Find all Lightdash YAML model files in a directory
 * Looks for files in models/ or lightdash/models/ directory that contain `type: model`
 *
 * This explicitly checks the YAML content for `type: model` (or versioned variants)
 * to avoid false positives from other YAML files (e.g., content-as-code spaces).
 */
export async function findLightdashModelFiles(
    projectDir: string,
): Promise<string[]> {
    // Check both possible model locations: models/ (preferred) and lightdash/models/ (legacy)
    const possibleDirs = [
        path.join(projectDir, 'models'),
        path.join(projectDir, 'lightdash', 'models'),
    ];

    const lightdashModelsDir = possibleDirs.find((dir) => fs.existsSync(dir));

    if (!lightdashModelsDir) {
        GlobalState.debug(
            `No models directory found at ${possibleDirs.join(' or ')}`,
        );
        return [];
    }

    GlobalState.debug(`Using models directory: ${lightdashModelsDir}`);

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

    // Filter to only include files that actually contain `type: model`
    const modelFiles: string[] = [];
    for await (const filePath of yamlFiles) {
        const isModel = await isLightdashModelFile(filePath);
        if (isModel) {
            modelFiles.push(filePath);
        } else {
            GlobalState.debug(
                `Skipping ${filePath}: not a valid Lightdash model file (missing type: model)`,
            );
        }
    }

    return modelFiles;
}

export async function loadLightdashModels(
    projectDir: string,
): Promise<LightdashModelWithSource[]> {
    if ((await findLightdashModelFiles(projectDir)).length === 0) return [];
    return loadNativeLightdashModels(projectDir);
}
