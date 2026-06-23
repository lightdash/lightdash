import { type DimensionType } from './field';
import type { ParameterValue } from './parameters';
import type { WarehouseTypes } from './projects';
import type { GroupType } from './table';
import { type TimeFrames } from './timeFrames';

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
    /**
     * Default behavior for column totals in results tables.
     * When false, the extra warehouse query that calculates column totals
     * is not run by default for new queries. Charts that explicitly enable
     * "Show column totals" still calculate them.
     * Defaults to true if not specified.
     */
    column_totals?: boolean;
    /**
     * Extra time intervals appended to the built-in defaults for date/timestamp
     * dimensions that do not declare their own `time_intervals`. Values may be
     * standard granularities (e.g. `hour`) or `custom_granularities` keys.
     */
    additional_time_intervals?: {
        date?: (TimeFrames | string)[];
        timestamp?: (TimeFrames | string)[];
    };
    /**
     * Override the display label of standard granularities (e.g. `week`:
     * "Week starting Monday"). Keyed by standard granularity name; applies to
     * Explorer dimension labels, the Explorer sidebar tree, and the date zoom.
     */
    granularity_labels?: Record<string, string>;
    // Room for future project-wide defaults like:
    // date_format?: string;
    // number_format?: string;
};

export type CustomGranularity = {
    label: string;
    sql: string;
    type?: DimensionType.DATE | DimensionType.TIMESTAMP | DimensionType.STRING;
};

export type LightdashProjectConfig = {
    spotlight: SpotlightConfig;
    parameters?: Record<string, LightdashProjectParameter>; // keys must be ^[a-zA-Z0-9_-]+$
    warehouse?: WarehouseConfig; // Required for Lightdash-only projects (no dbt)
    defaults?: ProjectDefaults; // Project-wide defaults for various settings
    custom_granularities?: Record<string, CustomGranularity>;
    /**
     * Labels & descriptions for the group keys referenced by models'
     * `meta.groups` array. Used to render nested table groups in the
     * Explore sidebar. Missing keys fall back to using the key as the label.
     */
    table_groups?: Record<string, GroupType>;
};

export const DEFAULT_SPOTLIGHT_CONFIG: SpotlightConfig = {
    default_visibility: 'show',
};
