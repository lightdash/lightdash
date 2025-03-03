import Ajv from 'ajv';
import betterAjvErrors from 'better-ajv-errors';
import { isMap, isSeq, parseDocument, type Document, type YAMLMap } from 'yaml';
import { parseAllReferences } from '../../compiler/exploreCompiler';
import { type CustomSqlDimension } from '../../types/field';
import lightdashDbtYamlSchema from '../../schemas/json/lightdash-dbt-2.0.json';
import { ParseError } from '../../types/errors';
import { type AdditionalMetric } from '../../types/metricQuery';
import { convertCustomDimensionToDbt } from '../../utils/convertCustomDimensionsToYaml';
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

    constructor(doc: string = '') {
        this.doc = parseDocument(doc);
        const ajvCompiler = new Ajv({ coerceTypes: true });
        // todo: change generic to YamlSchema once it is moved from backend to common
        const validate = ajvCompiler.compile<unknown>(lightdashDbtYamlSchema);
        const schemaFile: unknown = this.doc.toJS();
        if (schemaFile && !validate(schemaFile)) {
            const errors = betterAjvErrors(
                lightdashDbtYamlSchema,
                schemaFile,
                validate.errors || [],
                { indent: 2 },
            );
            throw new ParseError(`Invalid schema file: ${errors}`);
        }
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
        return columns.items.find(
            (item): item is YAMLMap<unknown, unknown> =>
                isMap(item) && item.get('name') === columnName,
        );
    }

    private findFirstColumnFromModelByName(name: string) {
        const model = this.findModelByName(name);
        if (!model) {
            return undefined;
        }
        return model.getIn(['columns', 0]) as
            | YAMLMap<unknown, unknown>
            | undefined;
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
        return columns.items.filter(isMap).map((column) => column.toJSON());
    }

    // Todo: amend type once YamlModel is moved from backend to common
    addModel(model: unknown): DbtSchemaEditor {
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

    // Todo: amend type once types are moved from backend to common
    addColumn(
        modelName: string,
        column: { name: string } & Record<string, unknown>,
    ): DbtSchemaEditor {
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
        model.setIn(['columns'], column);
        return this;
    }

    removeColumns(modelName: string, columnNames: string[]): DbtSchemaEditor {
        const model = this.getModelByName(modelName);
        const columns = model.getIn(['columns']);
        if (!isSeq(columns)) {
            throw new Error(`Model ${modelName} has invalid columns array`);
        }
        columnNames.forEach((columnName) => {
            const index = columns.items.findIndex(
                (item): item is YAMLMap<unknown, unknown> =>
                    isMap(item) && item.get('name') === columnName,
            );
            if (index !== -1) {
                model.deleteIn(['columns', index]);
            }
        });
        return this;
    }

    addCustomMetrics(customMetricsToAdd: AdditionalMetric[]): DbtSchemaEditor {
        customMetricsToAdd.forEach((metric) => {
            if (metric.baseDimensionName === undefined) {
                throw new Error(
                    `Metric ${metric.name} is missing baseDimensionName`,
                );
            }
            const column = this.findColumnByName(
                metric.table,
                metric.baseDimensionName,
            );
            if (!column) {
                throw new Error(
                    `Column ${metric.baseDimensionName} not found in model ${metric.table}`,
                );
            }
            column.setIn(
                ['meta', 'metrics', metric.name],
                convertCustomMetricToDbt(metric),
            );
        });
        return this;
    }

    addCustomDimensions(
        customDimensionsToAdd: CustomSqlDimension[],
    ): DbtSchemaEditor {
        customDimensionsToAdd.forEach((dimension) => {
            this.addCustomDimension(dimension);
        });
        return this;
    }

    addCustomDimension(customDimension: CustomSqlDimension): DbtSchemaEditor {
        const model = this.findModelByName(customDimension.table);
        if (!model) {
            throw new Error(`Model ${customDimension.table} not found`);
        }

        const refs = parseAllReferences(
            customDimension.sql,
            customDimension.table,
        );
        let firstRefFromSameTable = refs.find(
            (ref) =>
                !!this.findColumnByName(customDimension.table, ref.refName),
        )?.refName;

        if (!firstRefFromSameTable) {
            firstRefFromSameTable = this.findFirstColumnFromModelByName(
                customDimension.table,
            )?.get('name') as string;
            if (!firstRefFromSameTable) {
                throw new Error(
                    `No columns found in model ${customDimension.table}`,
                );
            }
        }

        const additionalDimension =
            convertCustomDimensionToDbt(customDimension);

        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        const index = model
            .getIn(['columns'])
            // @ts-expect-error
            ?.items.findIndex(
                // @ts-expect-error
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
                (item) => item.get('name') === firstRefFromSameTable,
            );

        model.setIn(
            [
                'columns',
                index,
                'additional_dimensions',
                additionalDimension.name,
            ],
            additionalDimension,
        );
        return this;
    }

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

    updateColumnDimensionType(
        modelName: string,
        columnName: string,
        type: string,
    ) {
        const column = this.getColumnByName(modelName, columnName);
        column.setIn(['meta', 'dimension', 'type'], type);
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
        });
    }

    // Returns the updated schema as a JSON object
    toJS(): string {
        return this.doc.toJS();
    }
}
