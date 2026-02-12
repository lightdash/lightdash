/**
 * Project type detection utilities
 *
 * Determines whether a project is:
 * - A Lightdash YAML-only project (no dbt required)
 * - A dbt project (requires dbt)
 *
 * Detection order:
 * 1. If ANY Lightdash YAML models exist (with `type: model`) → YAML-only project
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
import { findLightdashModelFiles } from './loader';

/**
 * Enum for project types to ensure type safety
 */
export enum CliProjectType {
    LightdashYaml = 'lightdash-yaml',
    Dbt = 'dbt',
}

export type LightdashYamlProjectConfig = {
    type: CliProjectType.LightdashYaml;
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
    type: CliProjectType.Dbt;
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
    return config.type === CliProjectType.LightdashYaml;
}

export function isDbtProject(
    config: ProjectTypeConfig,
): config is DbtProjectConfig {
    return config.type === CliProjectType.Dbt;
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
 * Detection is based on YAML files containing `type: model` (or versioned variants).
 * This ensures we don't get false positives from other YAML files like content-as-code spaces.
 *
 * If ANY Lightdash YAML models exist → YAML-only project (dbt options ignored)
 * Otherwise → dbt project (user controls dbt options)
 */
export async function detectProjectType(
    options: DetectProjectTypeOptions,
): Promise<ProjectTypeConfig> {
    const absoluteProjectPath = path.resolve(options.projectDir);

    // Check for Lightdash YAML models (files with `type: model`)
    const yamlModelFiles = await findLightdashModelFiles(absoluteProjectPath);

    if (yamlModelFiles.length > 0) {
        GlobalState.debug(
            `> Found ${yamlModelFiles.length} Lightdash YAML model(s), using YAML-only project mode`,
        );
        return {
            type: CliProjectType.LightdashYaml,
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
        type: CliProjectType.Dbt,
        warehouseCredentials: options.userOptions?.warehouseCredentials,
        skipDbtCompile: options.userOptions?.skipDbtCompile,
        skipWarehouseCatalog: options.userOptions?.skipWarehouseCatalog,
    };
}
