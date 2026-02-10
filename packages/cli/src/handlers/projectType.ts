/**
 * Project type detection utilities
 *
 * Determines whether a project is:
 * - A Lightdash YAML-only project (no dbt required)
 * - A dbt project (requires dbt)
 *
 * Detection order:
 * 1. If ANY Lightdash YAML models exist in lightdash/models/ → YAML-only project
 * 2. Otherwise → dbt project
 *
 * For YAML-only projects:
 * - warehouseCredentials, skipDbtCompile, skipWarehouseCatalog are fixed
 * - dbt is never checked (user may not have it installed)
 *
 * For dbt projects:
 * - User controls warehouseCredentials, skipDbtCompile, skipWarehouseCatalog
 */

import path from 'path';
import GlobalState from '../globalState';
import { findLightdashModelFiles } from '../lightdash/loader';

export type LightdashYamlProjectConfig = {
    type: 'lightdash-yaml';
    /**
     * YAML-only projects don't load warehouse credentials from dbt profiles
     */
    warehouseCredentials: false;
    /**
     * YAML-only projects skip dbt compilation
     */
    skipDbtCompile: true;
    /**
     * YAML-only projects skip warehouse catalog (types are in YAML)
     */
    skipWarehouseCatalog: true;
};

export type DbtProjectConfig = {
    type: 'dbt';
    /**
     * User-controlled: whether to load warehouse credentials from dbt profiles
     */
    warehouseCredentials: boolean | undefined;
    /**
     * User-controlled: whether to skip dbt compilation
     */
    skipDbtCompile: boolean | undefined;
    /**
     * User-controlled: whether to skip warehouse catalog fetch
     */
    skipWarehouseCatalog: boolean | undefined;
};

export type ProjectTypeConfig = LightdashYamlProjectConfig | DbtProjectConfig;

export function isLightdashYamlProject(
    config: ProjectTypeConfig,
): config is LightdashYamlProjectConfig {
    return config.type === 'lightdash-yaml';
}

export function isDbtProject(
    config: ProjectTypeConfig,
): config is DbtProjectConfig {
    return config.type === 'dbt';
}

type DetectProjectTypeOptions = {
    /**
     * Path to the project directory
     */
    projectDir: string;

    /**
     * User-specified options (only used for dbt projects)
     */
    userOptions?: {
        warehouseCredentials?: boolean;
        skipDbtCompile?: boolean;
        skipWarehouseCatalog?: boolean;
    };
};

/**
 * Detect project type based on project contents
 *
 * If ANY Lightdash YAML models exist → YAML-only project (dbt options ignored)
 * Otherwise → dbt project (user controls dbt options)
 */
export async function detectProjectType(
    options: DetectProjectTypeOptions,
): Promise<ProjectTypeConfig> {
    const absoluteProjectPath = path.resolve(options.projectDir);

    // Check for Lightdash YAML models first
    const yamlModelFiles = await findLightdashModelFiles(absoluteProjectPath);

    if (yamlModelFiles.length > 0) {
        GlobalState.debug(
            `> Found ${yamlModelFiles.length} Lightdash YAML model(s), using YAML-only project mode`,
        );
        return {
            type: 'lightdash-yaml',
            warehouseCredentials: false,
            skipDbtCompile: true,
            skipWarehouseCatalog: true,
        };
    }

    // No YAML models found → dbt project
    GlobalState.debug(
        '> No Lightdash YAML models found, using dbt project mode',
    );
    return {
        type: 'dbt',
        warehouseCredentials: options.userOptions?.warehouseCredentials,
        skipDbtCompile: options.userOptions?.skipDbtCompile,
        skipWarehouseCatalog: options.userOptions?.skipWarehouseCatalog,
    };
}
