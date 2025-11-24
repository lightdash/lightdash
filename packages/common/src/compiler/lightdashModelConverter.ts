/**
 * Converter to transform Lightdash YAML models to DbtModelNode format
 * This allows Lightdash models to be processed through the existing translator.ts pipeline
 */

import type {
    DbtColumnLightdashDimension,
    DbtModelColumn,
    DbtModelLightdashConfig,
    DbtModelNode,
} from '../types/dbt';
import type { DimensionType } from '../types/field';
import {
    type LightdashModel,
    type LightdashModelDimension,
} from '../types/lightdashModel';

/**
 * Convert a Lightdash YAML model to DbtModelNode format
 * This enables reuse of the existing convertTable and convertExplores functions
 */
export function convertLightdashModelToDbtModel(
    model: LightdashModel,
): DbtModelNode {
    // Generate a unique ID for this model
    const uniqueId = `model.lightdash.${model.name}`;

    // sql_from can be either a table reference (e.g., 'schema.table') or a SQL query
    // Maps directly to DbtModelLightdashConfig.sql_from
    const sqlFrom = model.sql_from;

    // Convert dimensions to dbt column format
    const columns: Record<string, DbtModelColumn> = {};

    model.dimensions.forEach((dimension: LightdashModelDimension) => {
        // LightdashModelDimension extends DbtColumnLightdashDimension, so we can safely
        // extract the properties that match DbtColumnLightdashDimension
        const dimensionConfig: DbtColumnLightdashDimension = {
            name: dimension.name,
            label: dimension.label,
            type: dimension.type,
            description: dimension.description,
            sql: dimension.sql,
            time_intervals: dimension.time_intervals,
            hidden: dimension.hidden,
            round: dimension.round,
            format: dimension.format,
            group_label: dimension.group_label,
            groups: dimension.groups,
            colors: dimension.colors,
            urls: dimension.urls,
            required_attributes: dimension.required_attributes,
            ai_hint: dimension.ai_hint,
            tags: dimension.tags,
            compact: dimension.compact,
        };

        columns[dimension.name] = {
            name: dimension.name,
            description: dimension.description,
            data_type: dimension.type as DimensionType,
            meta: {
                dimension: dimensionConfig,
                // LightdashModelMetric is compatible with DbtColumnLightdashMetric
                metrics: dimension.metrics,
                // LightdashModelAdditionalDimension extends DbtColumnLightdashAdditionalDimension (compatible types)
                additional_dimensions: dimension.additional_dimensions,
            },
        };
    });

    // Build the meta block with model-level configuration
    // LightdashModel extends DbtModelLightdashConfig, so we extract those properties
    const modelConfig: DbtModelLightdashConfig = {
        label: model.label,
        description: model.description,
        metrics: model.metrics,
        sets: model.sets,
        order_fields_by: model.order_fields_by,
        group_label: model.group_label,
        sql_filter: model.sql_filter,
        sql_where: model.sql_where,
        sql_from: sqlFrom, // from_sql maps directly to sql_from
        required_attributes: model.required_attributes,
        group_details: model.group_details,
        default_time_dimension: model.default_time_dimension,
        spotlight: model.spotlight,
        joins: model.joins,
        required_filters: model.required_filters,
        default_filters: model.default_filters,
        explores: model.explores,
        ai_hint: model.ai_hint,
        parameters: model.parameters,
        primary_key: model.primary_key,
    };

    // Create a DbtModelNode that mimics what dbt would produce
    // Note: database, schema, relation_name are placeholder values since sql_from is used
    return {
        unique_id: uniqueId,
        resource_type: 'model',
        name: model.name,
        database: 'db-error',
        schema: 'schema-error',
        alias: model.name,
        description: model.description || '',
        columns,
        meta: modelConfig,
        config: {
            materialized: 'view',
            meta: modelConfig,
        },
        tags: [],
        path: `lightdash/models/${model.name}.yml`,
        patch_path: `lightdash://${model.name}.yml`,
        depends_on: {
            nodes: [],
            macros: [],
        },
        refs: [],
        sources: [],
        compiled: true,
        compiled_code: sqlFrom,
        // Required by CompiledModelNode
        fqn: [model.name],
        raw_code: sqlFrom,
        language: 'sql' as const,
        package_name: 'lightdash',
        original_file_path: `lightdash/models/${model.name}.yml`,
        checksum: {
            name: 'sha256',
            checksum: '',
        },
    };
}

/**
 * Convert multiple Lightdash models to DbtModelNode format
 */
export function convertLightdashModelsToDbtModels(
    models: LightdashModel[],
): DbtModelNode[] {
    return models.map((model) => convertLightdashModelToDbtModel(model));
}
