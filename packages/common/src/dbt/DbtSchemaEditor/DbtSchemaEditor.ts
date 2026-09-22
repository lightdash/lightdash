import betterAjvErrors from '@sidvind/better-ajv-errors';
import Ajv from 'ajv';
import AjvErrors from 'ajv-errors';
import {
    isMap,
    isSeq,
    parseDocument,
    YAMLSeq,
    type Document,
    type YAMLMap,
} from 'yaml';
import {
    type CustomDimensionWriteback,
    type CustomMetricWriteback,
    type WritebackColumn,
} from '../../compiler/writebackColumn';
import lightdashDbtYamlSchema from '../../schemas/json/lightdash-dbt-2.0.json';
import { type DbtColumnLightdashAdditionalDimension } from '../../types/dbt';
import { ParameterError, ParseError } from '../../types/errors';
import { isCustomSqlDimension } from '../../types/field';
import {
    isDbtVersion110OrHigher,
    type SupportedDbtVersions,
} from '../../types/projects';
import { type WarehouseSqlBuilder } from '../../types/warehouse';
import {
    type YamlColumn,
    type YamlModel,
    type YamlSchema,
} from '../../types/yamlSchema';
import {
    convertCustomBinDimensionToDbt,
    convertCustomSqlDimensionToDbt,
} from '../../utils/convertCustomDimensionsToYaml';
import { convertCustomMetricToDbt } from '../../utils/convertCustomMetricsToYaml';

/**
 * Class to edit dbt schema files(YAML)
 * Methods can be chained and the final schema can be obtained as a string.
 * Usage:
 * const editor = new DbtSchemaEditor(schema);
 * const updatedSchema = editor.addCustomMetrics(customMetricsToAdd).toString();
 */
export default class DbtSchemaEditor {
    private readonly doc: Document;

    private readonly dbtVersion?: SupportedDbtVersions;

    constructor(
        doc: string = '',
        filename: string = '',
        dbtVersion?: SupportedDbtVersions,
    ) {
        this.doc = parseDocument(doc);
        this.dbtVersion = dbtVersion;
        const ajvCompiler = new Ajv({
            coerceTypes: true,
            allowUnionTypes: true,
            allErrors: true,
        });
        AjvErrors(ajvCompiler);
        const validate = ajvCompiler.compile<YamlSchema>(
            lightdashDbtYamlSchema,
        );
        const schemaFile: unknown = this.doc.toJS();
        if (schemaFile && !validate(schemaFile)) {
            const errors = betterAjvErrors(
                lightdashDbtYamlSchema,
                schemaFile,
                validate.errors || [],
                { indent: 2 },
            );
            throw new ParseError(`Invalid schema file: ${filename}\n${errors}`);
        }
    }

    isDbtVersion110OrHigher(): boolean {
        return isDbtVersion110OrHigher(this.dbtVersion);
    }

    findModelByName(name: string) {
        const node = this.doc.get('models');
        if (!isSeq(node)) {
            // node is not an array
            return undefined;
        }
        return node.items.find(
            (item): item is YAMLMap<unknown, unknown> =>
                isMap(item) && item.get('name') === name,
        );
    }

    getModelByName(name: string) {
        const model = this.findModelByName(name);
        if (!model) {
            throw new Error(`Model ${name} not found`);
        }
        return model;
    }

    findColumnByName(modelName: string, columnName: string) {
        const model = this.findModelByName(modelName);
        if (!model) {
            // model not found
            return undefined;
        }
        const columns = model.getIn(['columns']);
        if (!isSeq(columns)) {
            // node is not an array
            return undefined;
        }
        const lowerColumnName = columnName.toLowerCase();
        return columns.items.find(
            (item): item is YAMLMap<unknown, unknown> =>
                isMap(item) &&
                (item.get('name') as string)?.toLowerCase() === lowerColumnName,
        );
    }

    getColumnByName(modelName: string, columnName: string) {
        const column = this.findColumnByName(modelName, columnName);
        if (!column) {
            throw new Error(
                `Column ${columnName} not found in model ${modelName}`,
            );
        }
        return column;
    }

    hasModels() {
        const models = this.doc.get('models');
        return isSeq(models) && models.items.length > 0;
    }

    getModelColumns(modelName: string) {
        const model = this.findModelByName(modelName);
        if (!model) {
            // model not found
            return undefined;
        }
        const columns = model.getIn(['columns']);
        if (!isSeq(columns)) {
            // node is not an array
            return undefined;
        }
        return columns.items
            .filter(isMap)
            .map<YamlColumn>((column) => column.toJSON());
    }

    addModel(model: YamlModel): DbtSchemaEditor {
        const models = this.doc.get('models');
        if (!isSeq(models)) {
            // create models array
            this.doc.set('models', [model]);
        } else {
            // add model to existing models
            models.items.push(model);
        }
        return this;
    }

    addColumn(modelName: string, column: YamlColumn): DbtSchemaEditor {
        const model = this.findModelByName(modelName);
        if (!model) {
            // model not found
            throw new Error(`Model ${modelName} not found`);
        }
        if (this.findColumnByName(modelName, column.name)) {
            throw new Error(
                `Column ${column.name} already exists in model ${modelName}`,
            );
        }

        // If columns doesn't exist, create a new YAMLSeq
        if (!isSeq(model.get('columns'))) {
            model.set('columns', new YAMLSeq());
        }

        // Add the new column
        model.addIn(['columns'], column);

        return this;
    }

    removeColumns(modelName: string, columnNames: string[]): DbtSchemaEditor {
        const model = this.getModelByName(modelName);
        const columns = model.getIn(['columns']);
        if (!isSeq(columns)) {
            throw new Error(`Model ${modelName} has invalid columns array`);
        }
        columnNames.forEach((columnName) => {
            const lowerColumnName = columnName.toLowerCase();
            const index = columns.items.findIndex(
                (item): item is YAMLMap<unknown, unknown> =>
                    isMap(item) &&
                    (item.get('name') as string)?.toLowerCase() ===
                        lowerColumnName,
            );
            if (index !== -1) {
                model.deleteIn(['columns', index]);
            }
        });
        return this;
    }

    addCustomMetrics(metrics: CustomMetricWriteback[]): DbtSchemaEditor {
        metrics.forEach(({ metric, column }) => {
            this.setColumnMeta(
                this.getWritebackColumn(column),
                ['metrics', metric.name],
                convertCustomMetricToDbt(metric),
            );
        });
        return this;
    }

    addCustomDimensions(
        dimensions: CustomDimensionWriteback[],
        warehouseSqlBuilder: WarehouseSqlBuilder,
    ): DbtSchemaEditor {
        dimensions.forEach((item) => {
            const definition = this.getCustomDimensionDefinition(
                item,
                warehouseSqlBuilder,
            );
            this.setColumnMeta(
                this.getWritebackColumn(item.column),
                ['additional_dimensions', item.dimension.id],
                definition,
            );
        });
        return this;
    }

    getCustomDimensionDefinition(
        { dimension, column }: CustomDimensionWriteback,
        warehouseSqlBuilder: WarehouseSqlBuilder,
    ): DbtColumnLightdashAdditionalDimension {
        if (isCustomSqlDimension(dimension)) {
            return convertCustomSqlDimensionToDbt(dimension);
        }
        // Additional dimensions declared on an array of scalars stay on the
        // model, where the element does not exist.
        if (column.isScalarArrayElement) {
            throw new ParameterError(
                `Custom dimension ${dimension.name} is built on the elements of ${column.column}, an array of scalars, and dbt YAML has no column for the element to hold it`,
            );
        }
        this.getWritebackColumn(column);
        return convertCustomBinDimensionToDbt({
            customDimension: dimension,
            baseDimensionSql: column.sql,
            warehouseSqlBuilder,
        });
    }

    private getWritebackColumn({ model, column }: WritebackColumn) {
        const node = this.findColumnByName(model, column);
        if (!node) {
            throw new Error(`Column ${column} not found in model ${model}`);
        }
        return node;
    }

    private setColumnMeta(
        column: YAMLMap<unknown, unknown>,
        path: string[],
        value: unknown,
    ) {
        const metaPath = isDbtVersion110OrHigher(this.dbtVersion)
            ? ['config', 'meta']
            : ['meta'];
        column.setIn([...metaPath, ...path], value);
    }

    /**
     * Update column properties(deep) in the schema.
     * Null values can be used to remove properties.
     * Undefined values are ignored.
     * Usage:
     * editor.updateColumn({
     *  modelName: 'my_model',
     *  columnName: 'my_column',
     *  properties: {
     *    description: 'new description',
     *    meta: {
     *      type: 'string',
     *      label: null, // remove label
     *    }
     *  }
     */
    updateColumn({
        modelName,
        columnName,
        properties = {},
    }: {
        modelName: string;
        columnName: string;
        properties?: Record<string, unknown>;
    }) {
        const column = this.getColumnByName(modelName, columnName);

        // Update schema properties recursively if value is an object
        function applyUpdates(path: string[], value: unknown) {
            if (value === undefined) {
                return;
            }
            if (typeof value === 'object' && value !== null) {
                const existingValue = column.getIn(path);
                if (existingValue && typeof existingValue === 'object') {
                    Object.entries(value).forEach(([key, val]) =>
                        applyUpdates([...path, key], val),
                    );
                    return;
                }
            }
            column.setIn(path, value);
        }

        Object.entries(properties).forEach(([key, value]) =>
            applyUpdates([key], value),
        );
    }

    // Returns the updated schema as a string(YAML)
    toString(options?: { quoteChar?: `'` | `"` }): string {
        return this.doc.toString({
            /**
             * Use 'single quote' rather than "double quote" where applicable.
             * Set to `false` to disable single quotes completely.
             * Set to `null` to keep the original quotes.
             *
             * Once we allow the user to set the quote char in the UI, we can enforce the quote char for the entire file.
             * Until then, we try to keep the original quotes by defaulting to null.
             */
            singleQuote:
                options?.quoteChar && options.quoteChar === `'` ? true : null,
            lineWidth: 0,
        });
    }

    // Returns the updated schema as a JSON object
    toJS(): string {
        return this.doc.toJS();
    }
}
