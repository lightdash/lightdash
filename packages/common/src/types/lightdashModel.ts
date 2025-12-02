/**
 * Types for Lightdash Model YAML files (dbt-free model definitions)
 * Based on schema: packages/common/src/schemas/json/model-as-code-1.0.json
 *
 * These types extend/reuse the existing dbt types to ensure coupling.
 * When new properties are added to ColumnMeta or ModelMeta, they automatically appear here.
 */

import type {
    DbtColumnLightdashAdditionalDimension,
    DbtColumnLightdashDimension,
    DbtColumnLightdashMetric,
    DbtExploreLightdashAdditionalDimension,
    DbtModelJoin,
    DbtModelLightdashConfig,
} from './dbt';
import type { RequiredFilter } from './filterGrammar';

/**
 * Dimension definition in Lightdash Model
 * Extends DbtColumnLightdashDimension with required fields
 */
export type LightdashModelDimension = DbtColumnLightdashDimension & {
    name: string; // Required in YAML (optional in dbt because it comes from column name)
    type: NonNullable<DbtColumnLightdashDimension['type']>; // Required in YAML
    sql: string; // Required in YAML - custom SQL expression for this dimension
    metrics?: Record<string, DbtColumnLightdashMetric>;
    additional_dimensions?: Record<string, LightdashModelAdditionalDimension>;
};

/**
 * Additional dimension derived from a base dimension
 * Reuses the dbt type exactly (since additional_dimensions work the same way)
 */
export type LightdashModelAdditionalDimension =
    DbtColumnLightdashAdditionalDimension & {
        type: NonNullable<DbtColumnLightdashDimension['type']>; // Required in YAML
        sql: string; // Required in YAML
    };

/**
 * Metric definition in Lightdash Model
 * Reuses DbtColumnLightdashMetric directly - no changes needed
 */
export type LightdashModelMetric = DbtColumnLightdashMetric;

/**
 * Explore configuration in Lightdash Model
 */
export type LightdashModelExplore = {
    label?: string;
    description?: string;
    group_label?: string;
    joins?: DbtModelJoin[]; // Reuses DbtModelJoin directly
    required_filters?: RequiredFilter[];
    default_filters?: RequiredFilter[];
    /**
     * Explore-scoped custom dimensions.
     * These dimensions are only available within this specific explore
     * and can reference fields from any joined table.
     */
    additional_dimensions?: Record<
        string,
        DbtExploreLightdashAdditionalDimension
    >;
};

/**
 * Root Lightdash Model structure
 * Extends DbtModelLightdashConfig to inherit all model-level configuration
 *
 * Uses sql_from to specify the table/query source,
 * which maps directly to DbtModelLightdashConfig.sql_from
 */
export type LightdashModel = Omit<
    DbtModelLightdashConfig,
    'joins' | 'explores' | 'sql_from'
> & {
    type: 'model' | 'model/v1beta' | 'model/v1';
    name: string;
    sql_from: string; // SQL query or table reference (e.g., 'schema.table' or 'SELECT ...')
    label?: string;
    description?: string;
    joins?: DbtModelJoin[]; // Reuses DbtModelJoin directly
    explores?: Record<string, LightdashModelExplore>; // Override to use RequiredFilter
    dimensions: LightdashModelDimension[]; // Required: array of dimensions with types
};
