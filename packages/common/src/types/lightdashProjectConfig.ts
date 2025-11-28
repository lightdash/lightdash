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

export type LightdashProjectParameter = {
    label: string;
    description?: string;
    type?: 'string' | 'number' | 'date'; // defaults to 'string' for backwards compatibility
    default?: ParameterValue;
    multiple?: boolean; // the parameter input will be a multi select
    allow_custom_values?: boolean; // allows users to input custom values beyond predefined options
    options?: string[] | number[]; // hardcoded options - kept separate as they're always homogeneous arrays
    options_from_dimension?: {
        // options will be populated from dimension values
        model: string;
        dimension: string;
    };
};

/**
 * Warehouse configuration for Lightdash-only projects
 * Reuses WarehouseTypes enum to avoid duplication
 */
export type WarehouseConfig = {
    type: WarehouseTypes;
};

export type LightdashProjectConfig = {
    spotlight: SpotlightConfig;
    parameters?: Record<string, LightdashProjectParameter>; // keys must be ^[a-zA-Z0-9_-]+$
    warehouse?: WarehouseConfig; // Required for Lightdash-only projects (no dbt)
};

export const DEFAULT_SPOTLIGHT_CONFIG: SpotlightConfig = {
    default_visibility: 'show',
};
