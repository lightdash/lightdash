import type { ParameterValue } from './parameters';
import type { WarehouseTypes } from './projects';

type SpotlightCategory = {
    label: string;
    color?: string;
};

type SpotlightConfig = {
    default_visibility: 'show' | 'hide';
    categories?: {
        [yaml_reference: string]: SpotlightCategory;
    };
};

export type LightdashParameterOption = {
    label: string;
    value: string | number;
};

export const isLightdashParameterOption = (
    opt: unknown,
): opt is LightdashParameterOption =>
    typeof opt === 'object' && opt !== null && 'label' in opt && 'value' in opt;

export type LightdashProjectParameter = {
    label: string;
    description?: string;
    type?: 'string' | 'number' | 'date'; // defaults to 'string' for backwards compatibility
    default?: ParameterValue;
    multiple?: boolean; // the parameter input will be a multi select
    allow_custom_values?: boolean; // allows users to input custom values beyond predefined options
    options?: string[] | number[] | LightdashParameterOption[]; // hardcoded options - string/number arrays or label+value pairs
    options_from_dimension?: {
        // options will be populated from dimension values
        model: string;
        dimension: string; // the value field (used in SQL substitution)
        label_dimension?: string; // optional display label field (searched and displayed in UI)
    };
};

/**
 * Warehouse configuration for Lightdash-only projects
 * Reuses WarehouseTypes enum to avoid duplication
 */
export type WarehouseConfig = {
    type: WarehouseTypes;
};

/**
 * Project-wide default settings that can be overridden at explore or field level
 */
export type ProjectDefaults = {
    /**
     * Default case sensitivity for string filters across the project.
     * When false, all string filters will be case insensitive by default.
     * Can be overridden at explore or field level.
     * Defaults to true if not specified.
     */
    case_sensitive?: boolean;
    // Room for future project-wide defaults like:
    // date_format?: string;
    // number_format?: string;
};

export type LightdashProjectConfig = {
    spotlight: SpotlightConfig;
    parameters?: Record<string, LightdashProjectParameter>; // keys must be ^[a-zA-Z0-9_-]+$
    warehouse?: WarehouseConfig; // Required for Lightdash-only projects (no dbt)
    defaults?: ProjectDefaults; // Project-wide defaults for various settings
};

export const DEFAULT_SPOTLIGHT_CONFIG: SpotlightConfig = {
    default_visibility: 'show',
};
