import { isMap, isSeq, parseDocument, type Document, type YAMLMap } from 'yaml';
import { parseAllReferences } from '../../compiler/exploreCompiler';
import { type CustomSqlDimension } from '../../types/field';
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

    constructor(doc: string) {
        this.doc = parseDocument(doc);
    }

    private findModelByName(name: string) {
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

    private findColumnByName(modelName: string, columnName: string) {
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

    hasModels() {
        const models = this.doc.get('models');
        return isSeq(models) && models.items.length > 0;
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
            ['columns', index, 'additional_dimensions'],
            additionalDimension,
        );
        return this;
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
